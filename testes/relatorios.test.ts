import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { diasDeAtraso, mesesDoPeriodo, montarPeriodo, montarRelatorio, type Relatorio } from "../src/lib/relatorios/dados";
import { gerarPdfDoRelatorio } from "../src/lib/relatorios/pdf";

describe("contas dos relatórios", () => {
  it("período em Brasília e meses do período", () => {
    const p = montarPeriodo("2026-01-15", "2026-04-02");
    expect(p.rotulo).toBe("15/01/2026 a 02/04/2026");
    expect(mesesDoPeriodo(p)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
    // Virada de ano.
    expect(mesesDoPeriodo(montarPeriodo("2025-11-01", "2026-02-28"))).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("dias de atraso contam dias inteiros em Brasília", () => {
    const venc = new Date("2026-10-10T15:00:00Z");
    expect(diasDeAtraso(venc, new Date("2026-10-10T23:00:00Z"))).toBe(0);
    expect(diasDeAtraso(venc, new Date("2026-10-11T04:00:00Z"))).toBe(1); // 01h de Brasilia do dia 11
    expect(diasDeAtraso(venc, new Date("2026-10-09T12:00:00Z"))).toBe(0);
  });

  it("o PDF sai em A4 deitado, com quebra de página e o cabeçalho repetido", async () => {
    const relatorio: Relatorio = {
      titulo: "Relatório de teste",
      subtitulo: "Só para conferir o desenho — com acentuação: ção, ã, é",
      escritorio: "Prado & Moura",
      periodo: montarPeriodo("2026-01-01", "2026-12-31"),
      blocos: [
        { tipo: "resumo", itens: [{ rotulo: "Emitido", valor: "R$ 10,00" }, { rotulo: "Vencido", valor: "R$ 5,00", tom: "ruim" }] },
        { tipo: "texto", texto: "Texto explicativo. ".repeat(40) },
        {
          tipo: "grafico",
          titulo: "Por mês",
          series: [{ nome: "Receita", cor: "verde" }, { nome: "Despesa", cor: "vermelho" }],
          pontos: Array.from({ length: 12 }, (_, i) => ({ rotulo: `m${i + 1}`, valores: [i * 10_000, (12 - i) * 7_000] })),
          formato: "dinheiro",
        },
        {
          tipo: "tabela",
          titulo: "Muitas linhas",
          colunas: [{ titulo: "Cliente", largura: 300 }, { titulo: "Valor", largura: 100, direita: true }],
          linhas: Array.from({ length: 120 }, (_, i) => [`Cliente número ${i + 1} com um nome bem comprido para ser cortado na coluna estreita da tabela`, "R$ 1.000,00"]),
          alerta: [3],
        },
      ],
    };
    const bytes = await gerarPdfDoRelatorio(relatorio);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(2);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeGreaterThan(height);
  });
});

const d = process.env.DATABASE_URL ? describe : describe.skip;
let esc = "";

d("relatório de cobranças contra o banco", () => {
  beforeAll(async () => {
    esc = (await prismaPlataforma().escritorio.create({ data: { slug: `rel-${Date.now()}`, nome: "Banca dos Relatórios" } })).id;
    await comEscritorio(esc, async (db) => {
      const a = await db.cliente.create({ data: semEscritorio({ nome: "Cliente Em Dia" }) });
      const b = await db.cliente.create({ data: semEscritorio({ nome: "Cliente Atrasado" }) });
      const cob = (clienteId: string, valor: number, vencimento: string, status: string, extra: Record<string, unknown> = {}) =>
        db.cobranca.create({
          data: semEscritorio({ clienteId, descricao: "Honorários", valorCentavos: valor, vencimento: new Date(`${vencimento}T12:00:00Z`), forma: "PIX", status, idNoProvedor: `x_${Math.random()}`, ...extra }),
        });
      await cob(a.id, 100_000, "2026-09-10", "PAGA", { pagoEm: new Date("2026-09-25T12:00:00Z"), valorPagoCentavos: 100_000 });
      await cob(b.id, 50_000, "2026-09-20", "VENCIDA");
      await cob(b.id, 50_000, "2026-10-05", "CANCELADA");
    });
  });
  afterAll(async () => {
    if (esc) await prismaPlataforma().escritorio.delete({ where: { id: esc } }).catch(() => {});
  });

  it("inadimplência em dinheiro sobre o emitido; cancelada fora; paga com atraso aparece", async () => {
    const r = await montarRelatorio(esc, "cobrancas", montarPeriodo("2026-09-01", "2026-10-31"), { agora: new Date("2026-10-20T15:00:00Z") });
    const resumo = r.blocos.find((b) => b.tipo === "resumo");
    if (resumo?.tipo !== "resumo") throw new Error("sem resumo");
    const valor = (rotulo: string) => resumo.itens.find((i) => i.rotulo === rotulo)?.valor.replace(/ /g, " ");
    expect(valor("Emitido")).toBe("R$ 1.500,00");
    expect(valor("Vencido")).toBe("R$ 500,00");
    expect(valor("Inadimplência")).toBe("33,3%");
    const tabela = r.blocos.filter((b) => b.tipo === "tabela").at(-1);
    if (tabela?.tipo !== "tabela") throw new Error("sem tabela");
    expect(tabela.linhas.some((l) => l.includes("pago com 15 dia(s)"))).toBe(true);
    expect(tabela.linhas.some((l) => l.includes("30 dia(s)"))).toBe(true);
    expect(await gerarPdfDoRelatorio(r)).toBeInstanceOf(Uint8Array);
  });
});
