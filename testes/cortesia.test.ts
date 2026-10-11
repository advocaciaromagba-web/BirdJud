// Cortesia: o escritorio usa sem pagar, por tempo indeterminado.
import { afterAll, describe, expect, it } from "vitest";
import { prismaPlataforma } from "../src/lib/prisma";
import { aplicarRegua, criarAssinatura } from "../src/lib/cobranca";
import { analisarCarteira, type EscritorioNoPainel } from "../src/lib/painel-plataforma";

const AGORA = new Date("2026-10-15T15:00:00Z");
const dia = (iso: string) => new Date(`${iso}T15:00:00Z`);

function esc(id: string, extra: Partial<EscritorioNoPainel> = {}): EscritorioNoPainel {
  return {
    id,
    nome: id,
    status: "ATIVO",
    faixa: "ATE_3",
    criadoEm: dia("2026-01-01"),
    encerradoEm: null,
    assinatura: { valorCentavos: 29900, diaVencimento: 10, fimDoTeste: dia("2026-02-01"), canceladaEm: null },
    faturas: [],
    ...extra,
  };
}

describe("cortesia no painel da plataforma", () => {
  it("fica fora da receita, do ticket e da previsao, e e contada a parte", () => {
    const a = analisarCarteira(
      [
        esc("Pagante"),
        esc("Casa", { assinatura: { valorCentavos: 29900, diaVencimento: 10, fimDoTeste: dia("2026-10-12"), canceladaEm: null, cortesiaDesde: dia("2026-10-11") } }),
      ],
      AGORA,
    );
    expect(a.receitaMensal).toBe(29900);
    expect(a.pagantes).toBe(1);
    expect(a.cortesias).toBe(1);
    expect(a.previsao[0].garantido).toBe(29900);
    expect(a.testesAcabando).toHaveLength(0);
  });
});

const d = process.env.DATABASE_URL ? describe : describe.skip;
const marca = Date.now();
let escritorio = "";

d("cortesia na regua", () => {
  afterAll(async () => {
    if (escritorio) await prismaPlataforma().escritorio.delete({ where: { id: escritorio } }).catch(() => {});
  });

  it("teste acabado e cortesia: nenhuma fatura, e o escritorio fica ATIVO", async () => {
    escritorio = (await prismaPlataforma().escritorio.create({ data: { slug: `cortesia-${marca}`, nome: "Casa" } })).id;
    await criarAssinatura(escritorio, 29900, 14);
    await prismaPlataforma().assinatura.update({
      where: { escritorioId: escritorio },
      data: { fimDoTeste: new Date(Date.now() - 24 * 3600_000), cortesiaDesde: new Date(), cortesiaMotivo: "Escritorio da casa" },
    });

    const r = await aplicarRegua(escritorio);
    expect(r.faturaGerada).toBeNull();
    expect(r.statusNovo).toBe("ATIVO");
    expect(await prismaPlataforma().fatura.count({ where: { escritorioId: escritorio } })).toBe(0);

    // Retirada a cortesia, a regua volta a cobrar.
    await prismaPlataforma().assinatura.update({ where: { escritorioId: escritorio }, data: { cortesiaDesde: null } });
    const depois = await aplicarRegua(escritorio);
    expect(depois.faturaGerada).not.toBeNull();
  });
});
