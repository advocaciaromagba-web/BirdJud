// Contratos x financeiro (21/10/2026).
//
// O que protege o escritorio: a pergunta "o que os contratos preveem bate
// com o que esta no financeiro?" tem resposta. Parcela sem lancamento,
// lancamento ou cobranca com valor fora do contrato e cobranca de parcela
// que saiu do plano aparecem; receita sem contrato por tras e contada.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { salvarContrato } from "../src/lib/honorarios-do-escritorio";
import { conciliarContratos } from "../src/lib/conciliacao-de-contratos";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

d("conciliação de contratos com o financeiro", () => {
  let esc = "";
  let clienteId = "";

  beforeAll(async () => {
    esc = (await prismaPlataforma().escritorio.create({ data: { slug: `concon-${Date.now()}`, nome: "Banca dos Contratos" } })).id;
    clienteId = await comEscritorio(esc, async (db) => {
      for (const modulo of ["FINANCEIRO", "COBRANCAS"]) {
        await db.moduloContratado.create({ data: semEscritorio({ modulo, ativo: true }) });
      }
      return (await db.cliente.create({ data: semEscritorio({ nome: "Cliente Conciliado", documento: "52998224725" }) })).id;
    });
  });

  afterAll(async () => {
    if (esc) await prismaPlataforma().escritorio.delete({ where: { id: esc } }).catch(() => {});
  });

  it("contrato recém-gravado está em dia; mexer por fora aparece", async () => {
    const { id } = await salvarContrato(esc, {
      clienteId, tipo: "VALOR", valorCentavos: 300_000, parcelas: 3,
      primeiroVencimento: "2026-11-10", forma: "PIX", emissaoAutomatica: false,
    });
    let c = await conciliarContratos(esc);
    expect(c.contratos).toHaveLength(1);
    expect(c.contratos[0]).toMatchObject({ previstoCentavos: 300_000, lancadoCentavos: 300_000, cobradoCentavos: 0, recebidoCentavos: 0, problemas: [] });
    expect(c.comProblema).toBe(0);

    await comEscritorio(esc, async (db) => {
      // Parcela 1 recebida com valor menor; parcela 3 apagada; cobranca da parcela 2 com valor errado.
      await db.lancamento.update({ where: { contratoId_parcelaNumero: { contratoId: id, parcelaNumero: 1 } }, data: { valorCentavos: 90_000, pagoEm: new Date() } });
      await db.lancamento.delete({ where: { contratoId_parcelaNumero: { contratoId: id, parcelaNumero: 3 } } });
      await db.cobranca.create({
        data: semEscritorio({
          clienteId, contratoId: id, parcelaNumero: 2, parcelaTotal: 3, descricao: "Parcela 2", valorCentavos: 120_000,
          forma: "PIX", vencimento: new Date("2026-12-10T12:00:00Z"), idNoProvedor: `concon-${Date.now()}`,
        }),
      });
      // Receita avulsa, sem contrato.
      await db.lancamento.create({ data: semEscritorio({ descricao: "Consulta", tipo: "RECEITA", competencia: "2026-10", valorCentavos: 50_000, pagoEm: new Date() }) });
    });

    c = await conciliarContratos(esc);
    const l = c.contratos[0];
    // O real sai com espaco inseparavel entre "R$" e o numero.
    expect(l.problemas.map((p) => p.replace(/\u00a0/g, " "))).toEqual([
      "Parcela 1: recebido R$ 900,00, o contrato prevê R$ 1.000,00",
      "Parcela 2: cobrança de R$ 1.200,00, o contrato prevê R$ 1.000,00",
      "Parcela 3 sem lançamento no financeiro",
    ]);
    expect(l.recebidoCentavos).toBe(90_000);
    expect(l.cobradoCentavos).toBe(120_000);
    expect(c.comProblema).toBe(1);
    expect(c).toMatchObject({ recebidoCentavos: 140_000, deContratoCentavos: 90_000, avulsoCentavos: 50_000 });
  });
});
