// Relacao de despesas, aviso de vencimento e leitura em lote.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contasVencendo, filtroDaUrl, relacaoDeDespesas, somarDespesas } from "../src/lib/despesas";
import { contasDaLeitura, emGrupos } from "../src/lib/contas-em-lote";
import { CATEGORIAS_DE_DESPESA, rotuloDaCategoria } from "../src/lib/financeiro";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { gerarContasDoMes } from "../src/lib/contas-do-escritorio";

const HOJE = "2026-11-05";
const dia = (s: string) => new Date(`${s}T12:00:00Z`);

describe("filtro e totais", () => {
  it("lê a URL e recusa o que não faz sentido", () => {
    expect(filtroDaUrl({ ano: "2026", mes: "13", situacao: "xyz" }, HOJE)).toEqual({ ano: 2026, mes: undefined, categoria: undefined, situacao: "todas", busca: undefined });
    expect(filtroDaUrl({ ano: "1800", mes: "3", situacao: "vencidas", busca: "  luz " }, HOJE)).toMatchObject({ ano: 2026, mes: 3, situacao: "vencidas", busca: "luz" });
  });

  it("separa pago, a pagar e vencido, e soma por categoria", () => {
    const t = somarDespesas(
      [
        { valorCentavos: 10000, pagoEm: dia("2026-11-01"), vencimento: dia("2026-11-01"), categoria: "ENERGIA" },
        { valorCentavos: 5000, pagoEm: null, vencimento: dia("2026-11-04"), categoria: "ENERGIA" },
        { valorCentavos: 2000, pagoEm: null, vencimento: dia("2026-11-05"), categoria: "PERICIA" },
        { valorCentavos: 700, pagoEm: null, vencimento: null, categoria: null },
      ],
      HOJE,
    );
    expect(t).toMatchObject({ total: 17700, pago: 10000, aPagar: 7700, vencido: 5000 });
    expect(t.porCategoria[0]).toEqual({ categoria: "ENERGIA", centavos: 15000, quantas: 2 });
  });

  it("perícia é categoria de despesa, com rótulo", () => {
    expect(CATEGORIAS_DE_DESPESA).toContain("PERICIA");
    expect(rotuloDaCategoria("PERICIA")).toBe("Perícia e assistente técnico");
  });
});

describe("leitura em lote", () => {
  it("um arquivo com duas contas vira duas linhas; sem valor não vira linha", () => {
    const campo = (valor: string, confianca: "ALTA" | "MEDIA" = "ALTA") => ({ valor, confianca, origem: null });
    const contas = contasDaLeitura(
      {
        campos: { descricao: campo("Condomínio - novembro"), valor: campo("850,00"), vencimento: campo("2026-11-10"), categoria: campo("CONDOMINIO") },
        observacoes: ["Boleto e taxa extra no mesmo PDF."],
        outras: [
          { campos: { descricao: campo("Taxa extra"), valor: campo("120,00", "MEDIA"), categoria: campo("INVENTADA") }, observacoes: [] },
          { campos: { descricao: campo("Sem valor") }, observacoes: [] },
        ],
      },
      "condominio.pdf",
      "x",
    );
    expect(contas.map((c) => [c.descricao, c.valor, c.categoria, c.conferir])).toEqual([
      ["Condomínio - novembro", "850,00", "CONDOMINIO", false],
      ["Taxa extra", "120,00", "OUTRAS_DESPESAS", true],
    ]);
    expect(contas[0].observacoes).toEqual(["Boleto e taxa extra no mesmo PDF."]);
    expect(new Set(contas.map((c) => c.chave)).size).toBe(2);
  });

  it("no máximo três ao mesmo tempo, e o resultado na ordem", async () => {
    let agora = 0;
    let pico = 0;
    const r = await emGrupos([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      agora += 1;
      pico = Math.max(pico, agora);
      await new Promise((ok) => setTimeout(ok, 5 + (n % 3) * 3));
      agora -= 1;
      return n * 10;
    });
    expect(pico).toBe(3);
    expect(r).toEqual([10, 20, 30, 40, 50, 60, 70]);
  });
});

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

d("despesas no banco", () => {
  let escritorio = "";

  beforeAll(async () => {
    escritorio = (await prismaPlataforma().escritorio.create({ data: { slug: `despesas-${Date.now()}`, nome: "Banca das Despesas" } })).id;
    await comEscritorio(escritorio, (db) =>
      db.lancamento.createMany({
        data: [
          { descricao: "Conta de luz", valorCentavos: 18900, tipo: "DESPESA", categoria: "ENERGIA", competencia: "2026-10", vencimento: dia("2026-10-20"), pagoEm: dia("2026-10-19") },
          { descricao: "Conta de luz", valorCentavos: 20100, tipo: "DESPESA", categoria: "ENERGIA", competencia: "2026-11", vencimento: dia("2026-11-03") },
          { descricao: "Laudo do perito", valorCentavos: 150000, tipo: "DESPESA", categoria: "PERICIA", competencia: "2026-11", vencimento: dia("2026-11-08"), fornecedor: "Dr. Perito" },
          { descricao: "Honorários", valorCentavos: 500000, tipo: "RECEITA", categoria: "HONORARIOS", competencia: "2026-11" },
        ].map((l) => semEscritorio(l)) as never,
      }),
    );
  });

  afterAll(async () => {
    if (escritorio) await prismaPlataforma().escritorio.delete({ where: { id: escritorio } }).catch(() => {});
    await prismaPlataforma().$disconnect();
  });

  it("a relação traz só despesa, filtra e soma", async () => {
    const ano = await relacaoDeDespesas(escritorio, filtroDaUrl({ ano: "2026" }, HOJE), HOJE);
    expect(ano.linhas).toHaveLength(3);
    expect(ano.totais).toMatchObject({ total: 189000, pago: 18900, vencido: 20100 });
    const vencidas = await relacaoDeDespesas(escritorio, filtroDaUrl({ ano: "2026", situacao: "vencidas" }, HOJE), HOJE);
    expect(vencidas.linhas.map((l) => l.valorCentavos)).toEqual([20100]);
    const busca = await relacaoDeDespesas(escritorio, filtroDaUrl({ ano: "2026", busca: "perito" }, HOJE), HOJE);
    expect(busca.linhas.map((l) => l.descricao)).toEqual(["Laudo do perito"]);
    const outubro = await relacaoDeDespesas(escritorio, filtroDaUrl({ ano: "2026", mes: "10" }, HOJE), HOJE);
    expect(outubro.totais.total).toBe(18900);
    expect(ano.linhas.every((l) => l.excluivel)).toBe(true);
  });

  it("o aviso da tela inicial conta vencidas e as dos próximos dias", async () => {
    const v = await contasVencendo(escritorio, HOJE);
    expect(v).toMatchObject({ vencidas: 1, proximas: 1, centavosVencidas: 20100, centavosProximas: 150000 });
    // Sem nada para avisar, nada aparece.
    expect(await contasVencendo(escritorio, "2026-01-01")).toBeNull();
  });

  it("a despesa lançada com repetir não dobra no mês dela", async () => {
    const fixa = await comEscritorio(escritorio, async (db) => {
      const f = await db.despesaFixa.create({
        data: semEscritorio({ descricao: "Salário", categoria: "SALARIOS", valorCentavos: 300000, diaDoVencimento: 5, inicioEm: new Date("2026-11-01T00:00:00Z") }),
      });
      await db.lancamento.create({
        data: semEscritorio({ descricao: "Salário", valorCentavos: 300000, tipo: "DESPESA", categoria: "SALARIOS", competencia: "2026-11", despesaFixaId: f.id }),
      });
      return f;
    });
    expect((await gerarContasDoMes(escritorio, "2026-11")).criados).toBe(0);
    expect((await gerarContasDoMes(escritorio, "2026-12")).criados).toBe(1);
    const dela = await comEscritorio(escritorio, (db) => db.lancamento.count({ where: { despesaFixaId: fixa.id } }));
    expect(dela).toBe(2);
  });
});
