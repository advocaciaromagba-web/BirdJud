// Honorarios no financeiro.
//
// O que se prova: o contrato gravado na ficha do cliente poe as parcelas no
// financeiro A RECEBER, com as datas; a baixa (cobranca paga ou conferencia
// do extrato) acontece NA MESMA linha, nunca numa segunda; e editar ou
// encerrar o contrato mexe so no que ainda nao foi recebido nem cobrado.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import {
  encerrarContrato,
  preverRecebimentos,
  salvarContrato,
} from "../src/lib/honorarios-do-escritorio";
import { darBaixa } from "../src/lib/cobrancas";
import {
  PREFIXO_DA_PARCELA,
  ValorDiferenteDaParcela,
  decidirEntrada,
  pendentesComSugestao,
} from "../src/lib/extrato";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

d("honorarios no financeiro", () => {
  let escritorio = "";
  let clienteId = "";

  const contrato = (parcelas: number) => ({
    clienteId,
    tipo: "VALOR" as const,
    valorCentavos: 300_000,
    parcelas,
    primeiroVencimento: "2026-11-10",
    forma: "PIX" as const,
    emissaoAutomatica: false,
  });

  const linhas = (contratoId: string) =>
    comEscritorio(escritorio, (db) =>
      db.lancamento.findMany({ where: { contratoId }, orderBy: { parcelaNumero: "asc" } }),
    );

  beforeAll(async () => {
    const e = await prismaPlataforma().escritorio.create({
      data: { slug: `honfin-${Date.now()}`, nome: "Banca dos Honorarios" },
    });
    escritorio = e.id;
    clienteId = await comEscritorio(escritorio, async (db) => {
      for (const modulo of ["FINANCEIRO", "COBRANCAS"]) {
        await db.moduloContratado.create({ data: semEscritorio({ modulo, ativo: true }) });
      }
      const c = await db.cliente.create({
        data: semEscritorio({ nome: "Maria Aparecida Souza", documento: "52998224725" }),
      });
      return c.id;
    });
  });

  afterAll(async () => {
    if (escritorio) {
      await prismaPlataforma().escritorio.delete({ where: { id: escritorio } }).catch(() => {});
    }
    await prismaPlataforma().$disconnect();
  });

  it("gravar o contrato poe as parcelas a receber, com as datas", async () => {
    const { id } = await salvarContrato(escritorio, contrato(3));
    const l = await linhas(id);
    expect(l.map((x) => x.parcelaNumero)).toEqual([1, 2, 3]);
    expect(l.every((x) => x.tipo === "RECEITA" && x.categoria === "HONORARIOS" && x.pagoEm === null)).toBe(true);
    expect(l.map((x) => x.valorCentavos)).toEqual([100_000, 100_000, 100_000]);
    expect(l.map((x) => x.vencimento?.toISOString().slice(0, 10))).toEqual([
      "2026-11-10",
      "2026-12-10",
      "2027-01-10",
    ]);
    expect(l[0].competencia).toBe("2026-11");
    expect(l[0].descricao).toContain("Maria Aparecida Souza");

    // Rodar de novo nao duplica.
    await preverRecebimentos(escritorio, id);
    expect(await linhas(id)).toHaveLength(3);
  });

  it("a cobranca paga da baixa na parcela prevista, sem criar outra receita", async () => {
    const { id } = await salvarContrato(escritorio, contrato(2));
    const cobranca = await comEscritorio(escritorio, (db) =>
      db.cobranca.create({
        data: semEscritorio({
          clienteId,
          descricao: "Honorarios — parcela 1/2",
          valorCentavos: 150_000,
          vencimento: new Date("2026-11-10T12:00:00Z"),
          forma: "PIX",
          status: "PAGA",
          idNoProvedor: `pay-${Date.now()}`,
          contratoId: id,
          parcelaNumero: 1,
        }),
      }),
    );
    const quando = new Date("2026-11-09T15:00:00Z");
    const lancamentoId = await darBaixa(escritorio, { ...cobranca, lancamentoId: null }, 150_000, quando);

    const l = await linhas(id);
    expect(l).toHaveLength(2);
    expect(l[0].id).toBe(lancamentoId);
    expect(l[0].pagoEm?.toISOString()).toBe(quando.toISOString());
    expect(l[0].cobrancaId).toBe(cobranca.id);
    expect(l[1].pagoEm).toBeNull();
  });

  it("a conferencia do extrato acha a parcela pelo nome e valor e da baixa nela", async () => {
    const { id } = await salvarContrato(escritorio, { ...contrato(1), valorCentavos: 87_350 });
    const entrada = await comEscritorio(escritorio, (db) =>
      db.entradaDeExtrato.create({
        data: semEscritorio({
          idNoProvedor: `tr-${Date.now()}`,
          tipo: "PIX_RECEIVED",
          valorCentavos: 87_350,
          data: new Date("2026-11-10T00:00:00Z"),
          descricao: "PIX recebido de MARIA APARECIDA SOUZA",
          destino: "RECEITA",
        }),
      }),
    );

    const { entradas } = await pendentesComSugestao(escritorio);
    const sugestao = entradas.find((e) => e.id === entrada.id)!.sugestao;
    expect(sugestao.tipo).toBe("PROVAVEL");
    const parcelaId = sugestao.tipo === "PROVAVEL" ? sugestao.cobrancaId : "";
    expect(parcelaId.startsWith(PREFIXO_DA_PARCELA)).toBe(true);

    const r = await decidirEntrada(escritorio, entrada.id, { tipo: "LANCAR", parcelaId });
    const [parcela] = await linhas(id);
    expect(r.lancamentoId).toBe(parcela.id);
    expect(parcela.pagoEm?.toISOString().slice(0, 10)).toBe("2026-11-10");
    // Nenhuma receita avulsa nasceu desse pagamento.
    expect(
      await comEscritorio(escritorio, (db) =>
        db.lancamento.count({ where: { valorCentavos: 87_350 } }),
      ),
    ).toBe(1);
  });

  it("valor diferente da parcela nao da baixa", async () => {
    const { id } = await salvarContrato(escritorio, { ...contrato(1), valorCentavos: 55_500 });
    const [parcela] = await linhas(id);
    const entrada = await comEscritorio(escritorio, (db) =>
      db.entradaDeExtrato.create({
        data: semEscritorio({
          idNoProvedor: `tr2-${Date.now()}`,
          tipo: "PIX_RECEIVED",
          valorCentavos: 50_000,
          data: new Date("2026-11-10T00:00:00Z"),
          descricao: "PIX de Maria",
          destino: "RECEITA",
        }),
      }),
    );
    await expect(
      decidirEntrada(escritorio, entrada.id, { tipo: "LANCAR", parcelaId: `${PREFIXO_DA_PARCELA}${parcela.id}` }),
    ).rejects.toBeInstanceOf(ValorDiferenteDaParcela);
  });

  it("editar mexe so no a receber; encerrar tira o que nao foi recebido nem cobrado", async () => {
    const { id } = await salvarContrato(escritorio, contrato(3));
    // Parcela 1 recebida por fora.
    await comEscritorio(escritorio, (db) =>
      db.lancamento.updateMany({
        where: { contratoId: id, parcelaNumero: 1 },
        data: { pagoEm: new Date("2026-11-10T12:00:00Z") },
      }),
    );

    // Contrato corrigido para 2 parcelas: o valor de cada uma muda, e a 3 sai.
    await salvarContrato(escritorio, contrato(2), id);
    let l = await linhas(id);
    expect(l.map((x) => x.parcelaNumero)).toEqual([1, 2]);
    expect(l[0].valorCentavos).toBe(100_000); // recebida: intocada
    expect(l[1].valorCentavos).toBe(150_000);

    await encerrarContrato(escritorio, id);
    l = await linhas(id);
    expect(l.map((x) => x.parcelaNumero)).toEqual([1]);
    expect(l[0].pagoEm).not.toBeNull();
  });

  it("percentual de exito nao entra no financeiro", async () => {
    const { id } = await salvarContrato(escritorio, {
      clienteId,
      tipo: "PERCENTUAL",
      percentualBp: 3000,
      parcelas: 1,
      forma: "PIX",
      emissaoAutomatica: false,
    });
    expect(await linhas(id)).toHaveLength(0);
  });
});
