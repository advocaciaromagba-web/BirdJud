// Media mensal e projecao do ano no painel financeiro (21/10/2026).
//
// O que protege o escritorio: a media so conta mes fechado (o corrente pela
// metade puxaria para baixo); a projecao soma o realizado com o que ainda
// esta previsto; e a cobranca que ja e parcela prevista de contrato nao
// entra duas vezes.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { anoDoEscritorio } from "../src/lib/metas-do-escritorio";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

d("ano do escritório: média e projeção", () => {
  let esc = "";
  const ANO = 2031; // longe de qualquer dado de outro teste

  beforeAll(async () => {
    esc = (await prismaPlataforma().escritorio.create({ data: { slug: `ano-${Date.now()}`, nome: "Banca do Ano" } })).id;
    await comEscritorio(esc, async (db) => {
      const cliente = await db.cliente.create({ data: semEscritorio({ nome: "Cliente do Ano", documento: "52998224725" }) });
      const receita = (competencia: string, valorCentavos: number, pagoEm: Date | null, cobrancaId?: string) =>
        db.lancamento.create({
          data: semEscritorio({ descricao: "Honorários", tipo: "RECEITA", competencia, valorCentavos, pagoEm, cobrancaId }),
        });
      // Janeiro e fevereiro fechados: 100 e 300 (media 200). Marco (corrente) 50 recebidos.
      await receita(`${ANO}-01`, 100_00, new Date(Date.UTC(ANO, 0, 15)));
      await receita(`${ANO}-02`, 300_00, new Date(Date.UTC(ANO, 1, 15)));
      await receita(`${ANO}-03`, 50_00, new Date(Date.UTC(ANO, 2, 5)));
      // Despesa paga nao entra na media de receita.
      await db.lancamento.create({
        data: semEscritorio({ descricao: "Aluguel", tipo: "DESPESA", competencia: `${ANO}-01`, valorCentavos: 999_00, pagoEm: new Date(Date.UTC(ANO, 0, 10)) }),
      });
      // Parcela prevista em abril (a receber), ja com cobranca emitida: 200.
      const cobranca = await db.cobranca.create({
        data: semEscritorio({
          clienteId: cliente.id, descricao: "Parcela 2", valorCentavos: 200_00, forma: "PIX",
          vencimento: new Date(Date.UTC(ANO, 3, 10)), idNoProvedor: `ano-${Date.now()}`,
        }),
      });
      await receita(`${ANO}-04`, 200_00, null, cobranca.id);
      // Cobranca avulsa em aberto em maio, sem lancamento: 80.
      await db.cobranca.create({
        data: semEscritorio({
          clienteId: cliente.id, descricao: "Avulsa", valorCentavos: 80_00, forma: "PIX",
          vencimento: new Date(Date.UTC(ANO, 4, 10)), idNoProvedor: `ano-b-${Date.now()}`,
        }),
      });
    });
  });

  afterAll(async () => {
    if (esc) await prismaPlataforma().escritorio.delete({ where: { id: esc } }).catch(() => {});
  });

  it("a média só conta os meses fechados; a cobrança já prevista não dobra", async () => {
    const a = await anoDoEscritorio(esc, ANO, `${ANO}-03-20`);
    expect(a.mediaMensalCentavos).toBe(200_00);
    expect(a.realizadoCentavos).toBe(450_00);
    // Previsto do ano: 200 (parcela) + 80 (avulsa). A cobranca da parcela nao soma de novo.
    expect(a.previstoCentavos).toBe(280_00);
    expect(a.meses[3].previstoCentavos).toBe(200_00);
    // Projecao: realizado + previsto de marco em diante.
    expect(a.projecaoCentavos).toBe(450_00 + 280_00);
  });

  it("em janeiro não há média; ano passado tem os doze meses fechados", async () => {
    expect((await anoDoEscritorio(esc, ANO, `${ANO}-01-20`)).mediaMensalCentavos).toBeNull();
    const passado = await anoDoEscritorio(esc, ANO, `${ANO + 1}-06-01`);
    expect(passado.mediaMensalCentavos).toBe(Math.round(450_00 / 12));
    // Ano fechado: nada mais a prever entra na projecao, so o realizado.
    expect(passado.projecaoCentavos).toBe(450_00);
  });
});
