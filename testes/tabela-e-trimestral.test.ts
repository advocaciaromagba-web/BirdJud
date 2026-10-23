// Tabela de precos editavel e ciclo trimestral (23/10/2026).
//
// O que protege: a tabela do console vale na vitrine e na fatura do mesmo
// jeito; um JSON pela metade nunca deixa preco faltando; o trimestral cobra
// tres mensalidades com o desconto da tabela e marca o periodo pago, e nos
// meses do meio so sai excedente; e o contrato fechado nao muda com a tabela.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { TABELA_PADRAO } from "../src/lib/precos";
import { contaDoPlano, contaMontada } from "../src/lib/planos";
import {
  esquecerTabela,
  mesclarTabela,
  reajustarTabela,
  salvarTabela,
  tabelaVigente,
  TabelaInvalida,
  voltarATabelaPadrao,
} from "../src/lib/tabela-de-precos";
import { aplicarRegua, trimestralidade } from "../src/lib/cobranca";
import { descricaoDaFatura, mesesDaFatura } from "../src/lib/cobranca-plataforma";

describe("tabela de preços", () => {
  it("JSON pela metade cai no padrão campo a campo", () => {
    const t = mesclarTabela({ faixa: { ATE_1: 19_900 }, descontoAnual: 0.15, plano: { COMPLETO: { ATE_1: -5 } } });
    expect(t.faixa.ATE_1).toBe(19_900);
    expect(t.faixa.ATE_3).toBe(TABELA_PADRAO.faixa.ATE_3);
    expect(t.descontoAnual).toBe(0.15);
    // Negativo nao entra: fica o padrao.
    expect(t.plano.COMPLETO.ATE_1).toBe(TABELA_PADRAO.plano.COMPLETO.ATE_1);
    expect(mesclarTabela(null)).toEqual(TABELA_PADRAO);
  });

  it("a conta usa a tabela que recebe", () => {
    const t = mesclarTabela({ plano: { COMPLETO: { ATE_1: 30_000 } } });
    expect(contaDoPlano("COMPLETO", "ATE_1", t).totalCentavos).toBe(30_000);
    expect(contaDoPlano("COMPLETO", "ATE_1").totalCentavos).toBe(TABELA_PADRAO.plano.COMPLETO.ATE_1);
  });

  it("reajuste arredonda cada preço ao real e não mexe nos descontos", () => {
    const r = reajustarTabela(TABELA_PADRAO, 4.5);
    expect(r.faixa.ATE_1).toBe(15_600); // 149 * 1,045 = 155,705 -> 156
    expect(r.descontoAnual).toBe(TABELA_PADRAO.descontoAnual);
    expect(Object.values(r.plano.COMPLETO).every((v) => v % 100 === 0)).toBe(true);
  });

  it("trimestral: três mensalidades com o desconto da tabela", () => {
    const itens = trimestralidade("ATE_1", [], 10_000, mesclarTabela({ descontoTrimestral: 0.08 }));
    expect(itens).toEqual([
      { descricao: "Assinatura trimestral: 3 x 100,00", valorCentavos: 30_000 },
      { descricao: "Desconto do plano trimestral (8%)", valorCentavos: -2_400 },
    ]);
    expect(mesesDaFatura(itens)).toBe(3);
    expect(descricaoDaFatura("2026-11", 3)).toBe("BirdJud — assinatura trimestral (3 meses) a partir de 11/2026");
    expect(descricaoDaFatura("2026-11", true)).toContain("anual (12 meses)");
  });
});

const temBanco = Boolean(process.env.DATABASE_URL);
(temBanco ? describe : describe.skip)("tabela e trimestral contra o banco", () => {
  let esc = "";

  beforeAll(async () => {
    esquecerTabela();
    esc = (await prismaPlataforma().escritorio.create({ data: { slug: `trim-${Date.now()}`, nome: "Banca Trimestral", faixa: "ATE_1", status: "ATIVO" } })).id;
    await prismaPlataforma().assinatura.create({
      data: { escritorioId: esc, valorCentavos: 0, fimDoTeste: new Date("2026-01-01T12:00:00Z"), ciclo: "TRIMESTRAL" },
    });
    await comEscritorio(esc, (db) => db.moduloContratado.create({ data: semEscritorio({ modulo: "NUCLEO", ativo: true }) }));
  });

  afterAll(async () => {
    await voltarATabelaPadrao("teste");
    if (esc) await prismaPlataforma().escritorio.delete({ where: { id: esc } }).catch(() => {});
  });

  it("salvar recusa desconto de 90%, aceita a tabela válida e a vitrine passa a usá-la", async () => {
    await expect(salvarTabela({ ...TABELA_PADRAO, descontoAnual: 0.9 }, "teste")).rejects.toBeInstanceOf(TabelaInvalida);
    await salvarTabela(
      { ...TABELA_PADRAO, plano: { ...TABELA_PADRAO.plano, ESSENCIAL: { ...TABELA_PADRAO.plano.ESSENCIAL, ATE_1: 16_000 } }, descontoTrimestral: 0.1 },
      "teste",
    );
    const t = await tabelaVigente();
    // A faixa acompanha o Essencial: sao o mesmo produto.
    expect(t.faixa.ATE_1).toBe(16_000);
    expect(contaMontada([], "ATE_1", t).totalCentavos).toBe(16_000);
  });

  it("a régua cobra o trimestre com a tabela vigente e marca o período pago; no mês seguinte, nada", async () => {
    const outubro = new Date("2026-10-15T12:00:00Z");
    const r = await aplicarRegua(esc, outubro);
    expect(r.faturaGerada).toBeTruthy();
    const f = await prismaPlataforma().fatura.findUniqueOrThrow({ where: { id: r.faturaGerada! } });
    expect(f.valorCentavos).toBe(16_000 * 3 - Math.round(16_000 * 3 * 0.1));
    const a = await prismaPlataforma().assinatura.findUniqueOrThrow({ where: { escritorioId: esc } });
    expect(a.anualAte?.toISOString().slice(0, 10)).toBe("2027-01-15");

    await prismaPlataforma().fatura.update({ where: { id: f.id }, data: { status: "PAGA", pagoEm: outubro } });
    const novembro = await aplicarRegua(esc, new Date("2026-11-15T12:00:00Z"));
    expect(novembro.faturaGerada).toBeNull();
  });
});
