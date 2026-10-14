// A fatura cobra o mesmo que a vitrine mostra, e o plano anual com desconto.
//
// O que se prova: escritorio no plano Completo e cobrado pelo PACOTE (antes a
// fatura somava os modulos avulsos, mais caro que a vitrine); modulo avulso
// leva o fator da faixa; no anual sai uma fatura de 12 meses com 10% a menos,
// os meses do meio so cobram excedente, e o ano seguinte renova a partir de
// onde o anterior acabou.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { aplicarRegua, anuidade, criarAssinatura, mensalidadeDaConta, mensalidadeDoEscritorio } from "../src/lib/cobranca";
import { contaMontada, contaDoPlano, modulosDoPlano } from "../src/lib/planos";
import { PRECO_DA_FAIXA, precoDoModulo, somar } from "../src/lib/precos";

describe("a fatura e a vitrine", () => {
  it("plano Completo: a fatura cobra o pacote, nao a soma avulsa", () => {
    const modulos = modulosDoPlano("COMPLETO");
    expect(somar(mensalidadeDaConta("ATE_1", modulos))).toBe(contaDoPlano("COMPLETO", "ATE_1").totalCentavos);
    expect(somar(mensalidadeDaConta("ATE_1", modulos))).toBe(27_900);
    for (const faixa of ["ATE_3", "ATE_10", "ATE_25"] as const) {
      expect(somar(mensalidadeDaConta(faixa, modulos))).toBe(contaMontada(modulos, faixa).totalCentavos);
    }
  });

  it("modulo avulso leva o fator da faixa, como na vitrine", () => {
    const itens = mensalidadeDaConta("ATE_10", ["WHATSAPP"]);
    expect(somar(itens)).toBe(PRECO_DA_FAIXA.ATE_10 + precoDoModulo("WHATSAPP", "ATE_10"));
  });

  it("contrato assinado nao muda com a tabela: vale o valor fechado", () => {
    // Fechou por R$ 299 antes da tabela de 14/10/2026: continua R$ 299.
    expect(somar(mensalidadeDoEscritorio("ATE_1", modulosDoPlano("COMPLETO"), 29_900))).toBe(29_900);
    // Sem valor gravado, vale a vitrine.
    expect(somar(mensalidadeDoEscritorio("ATE_1", modulosDoPlano("COMPLETO"), 0))).toBe(27_900);
    expect(somar(anuidade("ATE_1", [], 29_900))).toBe(Math.round(29_900 * 12 * 0.9));
  });

  it("anual: 12 mensalidades com 10% de desconto", () => {
    const itens = anuidade("ATE_1", modulosDoPlano("COMPLETO"));
    expect(itens[0].valorCentavos).toBe(27_900 * 12);
    expect(itens[1].valorCentavos).toBe(-Math.round(27_900 * 12 * 0.1));
    expect(somar(itens)).toBe(301_320);
  });
});

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

d("assinatura anual na regua", () => {
  let esc = "";
  const DIA = 86_400_000;
  const fimDoTeste = new Date("2026-01-05T12:00:00Z");

  beforeAll(async () => {
    esc = (await prismaPlataforma().escritorio.create({
      data: { slug: `anual-${Date.now()}`, nome: "Banca Anual", status: "TESTE", faixa: "ATE_1" },
    })).id;
    await comEscritorio(esc, async (db) => {
      for (const modulo of modulosDoPlano("COMPLETO")) {
        await db.moduloContratado.create({ data: semEscritorio({ modulo, ativo: true }) });
      }
    });
    await criarAssinatura(esc, 27_900, 0, fimDoTeste);
    await prismaPlataforma().assinatura.update({ where: { escritorioId: esc }, data: { ciclo: "ANUAL" } });
  });

  afterAll(async () => {
    if (esc) await prismaPlataforma().escritorio.delete({ where: { id: esc } }).catch(() => {});
    await prismaPlataforma().$disconnect();
  });

  it("primeira fatura: o ano inteiro com desconto, e o ano fica marcado", async () => {
    const r = await aplicarRegua(esc, new Date(fimDoTeste.getTime() + DIA));
    expect(r.faturaGerada).not.toBeNull();
    const fatura = await prismaPlataforma().fatura.findUniqueOrThrow({ where: { id: r.faturaGerada! } });
    expect(fatura.valorCentavos).toBe(301_320);
    const a = await prismaPlataforma().assinatura.findUniqueOrThrow({ where: { escritorioId: esc } });
    expect(a.anualAte?.toISOString()).toBe("2027-01-05T12:00:00.000Z");
    await prismaPlataforma().fatura.update({ where: { id: fatura.id }, data: { status: "PAGA", pagoEm: new Date() } });
  });

  it("meses do meio, sem excedente: nenhuma fatura", async () => {
    const r = await aplicarRegua(esc, new Date("2026-06-15T12:00:00Z"));
    expect(r.faturaGerada).toBeNull();
    expect(r.statusNovo).toBe("ATIVO");
  });

  it("acabado o ano, renova a partir de onde acabou", async () => {
    const r = await aplicarRegua(esc, new Date("2027-01-06T12:00:00Z"));
    expect(r.faturaGerada).not.toBeNull();
    const a = await prismaPlataforma().assinatura.findUniqueOrThrow({ where: { escritorioId: esc } });
    expect(a.anualAte?.toISOString()).toBe("2028-01-05T12:00:00.000Z");
  });
});
