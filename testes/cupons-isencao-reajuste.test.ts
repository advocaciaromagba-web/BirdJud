// Cupons, isencao por prazo e reajuste dos contratos (23/10/2026).
//
// O que protege: o cupom desconta so a mensalidade e nunca a deixa negativa;
// o limite de usos nao e ultrapassado; isencao com data para de valer no dia
// seguinte e a regua volta a cobrar sozinha; o reajuste deixa de fora quem foi
// reajustado ha menos de 12 meses e registra a data.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import {
  CupomInvalido,
  aplicarCupom,
  criarCupom,
  fimDoCupom,
  linhaDoCupom,
  mesesCobertos,
  normalizarCodigo,
  ultimoMesDoCupom,
} from "../src/lib/cupons";
import { centavosDoTexto } from "../src/lib/precos";
import { aplicarRegua, emCortesia } from "../src/lib/cobranca";
import { aplicarReajuste, previaDoReajuste, valorReajustado } from "../src/lib/reajuste";

describe("cupom e isenção, sem banco", () => {
  it("código normalizado", () => {
    expect(normalizarCodigo(" boas vindas-2026 ")).toBe("BOASVINDAS-2026");
    expect(normalizarCodigo("Promoção")).toBe("PROMOCAO");
  });

  it("percentual sobre a mensalidade; valor fixo por mês, nunca negativo", () => {
    const base = [{ descricao: "Mensalidade", valorCentavos: 27_900 }];
    expect(linhaDoCupom({ codigo: "X", percentual: 20, valorCentavos: null }, base)).toEqual({
      descricao: "Cupom X (20%)",
      valorCentavos: -5_580,
    });
    expect(linhaDoCupom({ codigo: "Y", percentual: null, valorCentavos: 5_000 }, base, 3)?.valorCentavos).toBe(-15_000);
    expect(linhaDoCupom({ codigo: "Z", percentual: null, valorCentavos: 50_000 }, base)?.valorCentavos).toBe(-27_900);
  });

  it("cupom conta meses de fatura, não dias: 1 mês a partir de 20/10 não pega a fatura de 01/11", () => {
    const fim = fimDoCupom(new Date("2026-10-20T15:00:00Z"), 1);
    expect(fim.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(ultimoMesDoCupom(fim)).toBe("10/2026");
    expect(mesesCobertos(fim, new Date("2026-10-20T15:00:00Z"), 1)).toBe(1);
    expect(mesesCobertos(fim, new Date("2026-11-01T09:00:00Z"), 1)).toBe(0);
    expect(mesesCobertos(null, new Date(), 12)).toBe(12);
    expect(ultimoMesDoCupom(fimDoCupom(new Date("2026-12-05T12:00:00Z"), 1))).toBe("12/2026");
  });

  it("na fatura anual, cupom curto desconta só os meses que cobre", () => {
    const ano = [{ descricao: "Assinatura anual", valorCentavos: 120_000 }];
    // 50% por 1 mes: 1/12 do ano pela metade, e nao o ano inteiro.
    expect(linhaDoCupom({ codigo: "M", percentual: 50, valorCentavos: null }, ano, 12, 1)).toEqual({
      descricao: "Cupom M (50%, 1 de 12 meses)",
      valorCentavos: -5_000,
    });
    expect(linhaDoCupom({ codigo: "F", percentual: null, valorCentavos: 5_000 }, ano, 12, 2)?.valorCentavos).toBe(-10_000);
    expect(linhaDoCupom({ codigo: "F", percentual: null, valorCentavos: 5_000 }, ano, 12, 0)).toBeNull();
  });

  it("preço digitado no console: vírgula ou ponto decimal; vazio é inválido", () => {
    expect(centavosDoTexto("99.90")).toBe(9_990);
    expect(centavosDoTexto("99,90")).toBe(9_990);
    expect(centavosDoTexto("1.234,56")).toBe(123_456);
    expect(centavosDoTexto("1.234")).toBe(123_400);
    expect(centavosDoTexto("R$ 1.299,00")).toBe(129_900);
    expect(centavosDoTexto("149")).toBe(14_900);
    expect(centavosDoTexto("")).toBeNaN();
    expect(centavosDoTexto("abc")).toBeNaN();
  });

  it("isenção com data vale até a data; sem data, sempre", () => {
    const agora = new Date("2026-10-23T12:00:00Z");
    expect(emCortesia({ cortesiaDesde: agora, cortesiaAte: null }, agora)).toBe(true);
    expect(emCortesia({ cortesiaDesde: agora, cortesiaAte: new Date("2026-11-01T03:00:00Z") }, agora)).toBe(true);
    expect(emCortesia({ cortesiaDesde: agora, cortesiaAte: new Date("2026-10-20T03:00:00Z") }, agora)).toBe(false);
    expect(emCortesia(null, agora)).toBe(false);
  });

  it("reajuste ao centavo", () => {
    expect(valorReajustado(29_900, 4.5)).toBe(31_246);
  });
});

const temBanco = Boolean(process.env.DATABASE_URL);
(temBanco ? describe : describe.skip)("cupons, isenção e reajuste contra o banco", () => {
  const marca = Date.now().toString(36).toUpperCase();
  let esc = "";
  let outro = "";
  let operadorId = "";
  const cupons: string[] = [];

  async function novoEscritorio(nome: string, valor: number) {
    const id = (await prismaPlataforma().escritorio.create({ data: { slug: `cup-${nome}-${Date.now()}`, nome, faixa: "ATE_1", status: "ATIVO" } })).id;
    await prismaPlataforma().assinatura.create({
      data: { escritorioId: id, valorCentavos: valor, fimDoTeste: new Date("2026-01-01T12:00:00Z"), criadaEm: new Date("2025-01-01T12:00:00Z") },
    });
    await comEscritorio(id, (db) => db.moduloContratado.create({ data: semEscritorio({ modulo: "NUCLEO", ativo: true }) }));
    return id;
  }

  beforeAll(async () => {
    esc = await novoEscritorio("Banca do Cupom", 20_000);
    outro = await novoEscritorio("Banca do Limite", 20_000);
    operadorId = (
      await prismaPlataforma().operadorPlataforma.create({
        data: { nome: "Operadora de Teste", email: `op-${Date.now()}@teste.test`, senhaHash: "x" },
      })
    ).id;
  });

  afterAll(async () => {
    for (const id of [esc, outro]) if (id) await prismaPlataforma().escritorio.delete({ where: { id } }).catch(() => {});
    await prismaPlataforma().cupom.deleteMany({ where: { id: { in: cupons } } });
    if (operadorId) {
      await prismaPlataforma().acessoSuporte.deleteMany({ where: { operadorId } });
      await prismaPlataforma().operadorPlataforma.delete({ where: { id: operadorId } }).catch(() => {});
    }
  });

  it("cupom de 25% por 2 meses entra na fatura e respeita o limite de usos", async () => {
    const c = await criarCupom({ codigo: `T${marca}`, percentual: 25, meses: 2, maxUsos: 1 }, "teste");
    cupons.push(c.id);
    await expect(criarCupom({ codigo: `T${marca}`, percentual: 10 }, "teste")).rejects.toBeInstanceOf(CupomInvalido);
    await expect(criarCupom({ codigo: `V${marca}`, percentual: 10, valorCentavos: 100 }, "teste")).rejects.toBeInstanceOf(CupomInvalido);

    const agora = new Date("2026-10-01T12:00:00Z");
    await aplicarCupom(esc, `t${marca}`, agora);
    await expect(aplicarCupom(outro, `T${marca}`, agora)).rejects.toThrow(/número máximo/);

    const r = await aplicarRegua(esc, new Date("2026-10-15T12:00:00Z"));
    const f = await prismaPlataforma().fatura.findUniqueOrThrow({ where: { id: r.faturaGerada! } });
    expect(f.valorCentavos).toBe(15_000);

    // Dois meses de fatura contados do mes de hoje (o teste ja tinha
    // acabado): outubro e novembro com desconto, dezembro sem.
    const nov = await aplicarRegua(esc, new Date("2026-11-01T09:00:00Z"));
    const fn = await prismaPlataforma().fatura.findUniqueOrThrow({ where: { id: nov.faturaGerada! } });
    expect(fn.valorCentavos).toBe(15_000);
    const dez = await aplicarRegua(esc, new Date("2026-12-15T12:00:00Z"));
    const fd = await prismaPlataforma().fatura.findUniqueOrThrow({ where: { id: dez.faturaGerada! } });
    expect(fd.valorCentavos).toBe(20_000);
  });

  it("isenção até uma data: sem fatura até lá, e a régua volta a cobrar sozinha depois", async () => {
    await prismaPlataforma().assinatura.update({
      where: { escritorioId: outro },
      data: { cortesiaDesde: new Date("2026-10-01T12:00:00Z"), cortesiaAte: new Date("2026-11-01T03:00:00Z"), cortesiaMotivo: "teste" },
    });
    expect((await aplicarRegua(outro, new Date("2026-10-20T12:00:00Z"))).faturaGerada).toBeNull();
    const nov = await aplicarRegua(outro, new Date("2026-11-10T12:00:00Z"));
    expect(nov.faturaGerada).toBeTruthy();
  });

  it("reajuste: prévia sem gravar; aplicar registra a data e deixa de fora o recente", async () => {
    const agora = new Date("2026-10-23T12:00:00Z");
    const previa = (await previaDoReajuste(4.5, agora)).filter((l) => [esc, outro].includes(l.escritorioId));
    expect(previa.map((l) => l.novoCentavos)).toEqual([20_900, 20_900]);
    expect(previa.every((l) => !l.recente)).toBe(true);
    // Um dos dois foi reajustado ha 3 meses: fica de fora.
    await prismaPlataforma().assinatura.update({ where: { escritorioId: outro }, data: { reajustadoEm: new Date("2026-07-23T12:00:00Z") } });
    await aplicarReajuste(4.5, { incluirRecentes: false, avisar: false, operadorId, agora });
    const [a, b] = await Promise.all([
      prismaPlataforma().assinatura.findUniqueOrThrow({ where: { escritorioId: esc } }),
      prismaPlataforma().assinatura.findUniqueOrThrow({ where: { escritorioId: outro } }),
    ]);
    expect(a.valorCentavos).toBe(20_900);
    expect(a.reajustadoEm?.toISOString()).toBe(agora.toISOString());
    expect(b.valorCentavos).toBe(20_000);
  });
});
