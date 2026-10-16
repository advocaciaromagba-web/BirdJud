// A fatura cobra o mesmo que a vitrine mostra, e o plano anual com desconto.
//
// O que se prova: escritorio no plano Completo e cobrado pelo PACOTE (antes a
// fatura somava os modulos avulsos, mais caro que a vitrine); modulo avulso
// leva o fator da faixa; no anual sai uma fatura de 12 meses com 10% a menos,
// os meses do meio so cobram excedente, e o ano seguinte renova a partir de
// onde o anterior acabou.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { aplicarRegua, anuidade, criarAssinatura, inicioDoAno, mensalidadeDaConta, mensalidadeDoEscritorio } from "../src/lib/cobranca";
import { contaMontada, contaDoPlano, modulosDoPlano } from "../src/lib/planos";
import { PRECO_DA_FAIXA, custoDaAntecipacao, opcoesNoCartao, pagamentoNoCartao, precoDoModulo, somar } from "../src/lib/precos";

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

describe("cartao: tarifa e antecipacao repassadas", () => {
  it("a BirdJud recebe o valor da fatura depois de tarifa e antecipacao", () => {
    for (const p of opcoesNoCartao(301_320, true)) {
      const liquido = p.totalCentavos - p.totalCentavos * p.percentual - 49;
      expect(liquido).toBeGreaterThanOrEqual(301_320);
      expect(liquido - 301_320).toBeLessThan(1);
    }
  });

  it("a vista: 2,99% + 0,49, sem antecipacao", () => {
    const p = pagamentoNoCartao(27_900, 1);
    expect(p.percentual).toBe(0.0299);
    expect(p.totalCentavos).toBe(28_811);
  });

  it("parcelado: faixa do cartao mais a antecipacao media das parcelas", () => {
    expect(custoDaAntecipacao(1)).toBe(0);
    // 6x: 1,70% x 32/30 x 3,5 meses em media.
    expect(custoDaAntecipacao(6)).toBeCloseTo(0.017 * (32 / 30) * 3.5, 10);
    expect(pagamentoNoCartao(301_320, 6).percentual).toBeCloseTo(0.0349 + custoDaAntecipacao(6), 10);
    expect(pagamentoNoCartao(301_320, 6).totalCentavos).toBe(334_248);
    expect(pagamentoNoCartao(301_320, 6).parcelaCentavos).toBe(55_708);
  });

  // Limite de 6x: o anual no cartao nunca pode sair mais caro que pagar 12
  // mensalidades no boleto — senao o "desconto" do anual e de mentira.
  it("qualquer opcao do anual no cartao sai mais barata que 12 mensalidades", () => {
    for (const p of opcoesNoCartao(301_320, true)) expect(p.totalCentavos).toBeLessThan(12 * 27_900);
  });

  it("mensalidade so a vista; anual de 1x a 6x", () => {
    expect(opcoesNoCartao(27_900, false).map((p) => p.parcelas)).toEqual([1]);
    expect(opcoesNoCartao(301_320, true).map((p) => p.parcelas)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(() => pagamentoNoCartao(100, 0)).toThrow(RangeError);
    expect(() => pagamentoNoCartao(100, 7)).toThrow(RangeError);
  });
});

describe("de onde conta o ano", () => {
  it("emenda no anterior quando a regua roda logo depois", () => {
    const marco = new Date("2027-01-05T12:00:00Z");
    expect(inicioDoAno(marco, new Date("2027-01-06T12:00:00Z"))).toBe(marco);
  });

  // Mensal desde janeiro, passou ao anual em julho: contar do fim do teste
  // daria um "ano" que acaba em janeiro, metade ja gasta.
  it("marco antigo: conta de hoje", () => {
    const agora = new Date("2026-07-01T12:00:00Z");
    expect(inicioDoAno(new Date("2026-01-05T12:00:00Z"), agora)).toBe(agora);
  });
});

d("trocar de ciclo", () => {
  const ids: string[] = [];
  const DIA = 86_400_000;

  async function escritorio(fimDoTeste: Date) {
    const id = (await prismaPlataforma().escritorio.create({
      data: { slug: `ciclo-${Date.now()}-${ids.length}`, nome: "Banca Ciclo", status: "ATIVO", faixa: "ATE_1" },
    })).id;
    ids.push(id);
    await comEscritorio(id, async (db) => {
      for (const modulo of modulosDoPlano("COMPLETO")) {
        await db.moduloContratado.create({ data: semEscritorio({ modulo, ativo: true }) });
      }
    });
    await criarAssinatura(id, 27_900, 0, fimDoTeste);
    return id;
  }

  afterAll(async () => {
    for (const id of ids) await prismaPlataforma().escritorio.delete({ where: { id } }).catch(() => {});
  });

  it("mensal por meses e depois anual: o ano conta da troca, nao do fim do teste", async () => {
    const esc = await escritorio(new Date("2026-01-05T12:00:00Z"));
    const julho = await aplicarRegua(esc, new Date("2026-07-01T12:00:00Z"));
    const mensal = await prismaPlataforma().fatura.findUniqueOrThrow({ where: { id: julho.faturaGerada! } });
    expect(mensal.valorCentavos).toBe(27_900);
    await prismaPlataforma().fatura.update({ where: { id: mensal.id }, data: { status: "PAGA", pagoEm: new Date() } });

    await prismaPlataforma().assinatura.update({ where: { escritorioId: esc }, data: { ciclo: "ANUAL" } });
    const agosto = new Date("2026-08-01T12:00:00Z");
    const r = await aplicarRegua(esc, agosto);
    const anual = await prismaPlataforma().fatura.findUniqueOrThrow({ where: { id: r.faturaGerada! } });
    expect(anual.valorCentavos).toBe(301_320);
    const a = await prismaPlataforma().assinatura.findUniqueOrThrow({ where: { escritorioId: esc } });
    expect(a.anualAte?.toISOString()).toBe("2027-08-01T12:00:00.000Z");
  });

  // Um nome fora do catalogo na tabela (area antiga, teste) fazia o pacote
  // "nao cobrir" e a fatura do Completo sair pelo preco avulso.
  it("nome estranho entre os modulos nao derruba o preco do pacote", async () => {
    const fim = new Date("2026-01-05T12:00:00Z");
    const esc = await escritorio(fim);
    await comEscritorio(esc, (db) => db.moduloContratado.create({ data: semEscritorio({ modulo: "ENTREVISTAS", ativo: true }) }));
    await prismaPlataforma().assinatura.update({ where: { escritorioId: esc }, data: { ciclo: "ANUAL", valorCentavos: 0 } });
    const r = await aplicarRegua(esc, new Date(fim.getTime() + DIA));
    const f = await prismaPlataforma().fatura.findUniqueOrThrow({ where: { id: r.faturaGerada! } });
    expect(f.valorCentavos).toBe(301_320);
  });

  it("pagou o anual e voltou ao mensal: nada de mensalidade ate o ano acabar", async () => {
    const fim = new Date("2026-01-05T12:00:00Z");
    const esc = await escritorio(fim);
    await prismaPlataforma().assinatura.update({ where: { escritorioId: esc }, data: { ciclo: "ANUAL" } });
    const r = await aplicarRegua(esc, new Date(fim.getTime() + DIA));
    await prismaPlataforma().fatura.update({ where: { id: r.faturaGerada! }, data: { status: "PAGA", pagoEm: new Date() } });

    await prismaPlataforma().assinatura.update({ where: { escritorioId: esc }, data: { ciclo: "MENSAL" } });
    const meio = await aplicarRegua(esc, new Date("2026-09-01T12:00:00Z"));
    expect(meio.faturaGerada).toBeNull();

    // Acabado o ano pago, volta a mensalidade normal.
    const depois = await aplicarRegua(esc, new Date("2027-02-01T12:00:00Z"));
    const f = await prismaPlataforma().fatura.findUniqueOrThrow({ where: { id: depois.faturaGerada! } });
    expect(f.valorCentavos).toBe(27_900);
  });
});
