// O financeiro. O que se prova aqui e o que estraga relatorio em silencio:
// categoria que nao combina com o tipo, pizza que nao fecha, competencia
// errada por fuso, e dia 31 em mes de 30.
import { describe, expect, it } from "vitest";
import {
  CATEGORIAS_DE_DESPESA,
  CATEGORIAS_DE_RECEITA,
  categoriaCombina,
  categoriaProvavel,
  competenciaDaData,
  ehCategoria,
  fatias,
  resumoDoMes,
  rotuloDaCategoria,
  vencimentoNaCompetencia,
} from "@/lib/financeiro";
import { numeroPorExtenso, porExtenso } from "@/lib/dinheiro";

describe("catalogo de categorias", () => {
  it("nao repete categoria entre despesa e receita", () => {
    const repetidas = CATEGORIAS_DE_DESPESA.filter((c) =>
      (CATEGORIAS_DE_RECEITA as readonly string[]).includes(c),
    );
    expect(repetidas).toEqual([]);
  });

  it("toda categoria tem rotulo em portugues", () => {
    for (const c of [...CATEGORIAS_DE_DESPESA, ...CATEGORIAS_DE_RECEITA]) {
      const rotulo = rotuloDaCategoria(c);
      expect(rotulo).not.toBe(c);
      expect(rotulo.length).toBeGreaterThan(2);
    }
  });

  it("reconhece o que e categoria e o que nao e", () => {
    expect(ehCategoria("AGUA")).toBe(true);
    expect(ehCategoria("agua")).toBe(false);
    expect(ehCategoria("QUALQUER")).toBe(false);
  });

  // Aluguel lancado como receita passa despercebido no total e destroi o
  // comparativo com o mes anterior.
  it("recusa categoria que nao combina com o tipo", () => {
    expect(categoriaCombina("DESPESA", "ALUGUEL")).toBe(true);
    expect(categoriaCombina("RECEITA", "ALUGUEL")).toBe(false);
    expect(categoriaCombina("RECEITA", "HONORARIOS")).toBe(true);
    expect(categoriaCombina("DESPESA", "HONORARIOS")).toBe(false);
  });
});

describe("palpite de categoria", () => {
  it("reconhece as concessionarias mais comuns", () => {
    expect(categoriaProvavel("EMBASA - conta de agua")).toBe("AGUA");
    expect(categoriaProvavel("Coelba / Neoenergia")).toBe("ENERGIA");
    expect(categoriaProvavel("Vivo Fibra 500MB")).toBe("INTERNET");
    expect(categoriaProvavel("DARF Simples Nacional")).toBe("IMPOSTOS");
  });

  it("nao chuta quando nao sabe", () => {
    expect(categoriaProvavel("Pagamento avulso")).toBeNull();
    expect(categoriaProvavel("")).toBeNull();
  });
});

describe("resumo do mes", () => {
  const base = { categoria: null, competencia: "2026-09" };
  const lancamentos = [
    { ...base, tipo: "RECEITA", valorCentavos: 500_000, pagoEm: new Date() },
    { ...base, tipo: "RECEITA", valorCentavos: 300_000, pagoEm: null },
    { ...base, tipo: "DESPESA", categoria: "ALUGUEL", valorCentavos: 200_000, pagoEm: new Date() },
    { ...base, tipo: "DESPESA", categoria: "AGUA", valorCentavos: 10_000, pagoEm: null },
    // De outra competencia: nao pode entrar.
    { ...base, tipo: "RECEITA", valorCentavos: 999_999, competencia: "2026-08", pagoEm: new Date() },
  ];

  it("separa o realizado do previsto", () => {
    const r = resumoDoMes(lancamentos, "2026-09");
    expect(r.receitas).toBe(500_000);
    expect(r.aReceber).toBe(300_000);
    expect(r.despesas).toBe(200_000);
    expect(r.aPagar).toBe(10_000);
    expect(r.saldo).toBe(300_000);
  });

  it("ignora outras competencias", () => {
    const r = resumoDoMes(lancamentos, "2026-09");
    expect(r.receitas).not.toBe(1_499_999);
  });

  // O grafico mostra o comprometido, pago ou nao: e o que decide se da para
  // gastar mais neste mes.
  it("o grafico soma despesa paga e a pagar, ordenado pela maior", () => {
    const r = resumoDoMes(lancamentos, "2026-09");
    expect(r.porCategoria).toEqual([
      { categoria: "ALUGUEL", rotulo: "Aluguel", centavos: 200_000 },
      { categoria: "AGUA", rotulo: "Agua e esgoto", centavos: 10_000 },
    ]);
  });

  it("mes sem nada nao quebra", () => {
    const r = resumoDoMes([], "2026-09");
    expect(r).toMatchObject({ receitas: 0, despesas: 0, saldo: 0 });
    expect(r.porCategoria).toEqual([]);
  });
});

describe("fatias da pizza", () => {
  it("fecham exatamente 360 graus", () => {
    // Tres fatias iguais: 120 graus cada nao e representavel sem sobra.
    const f = fatias([
      { categoria: "A", rotulo: "A", centavos: 100 },
      { categoria: "B", rotulo: "B", centavos: 100 },
      { categoria: "C", rotulo: "C", centavos: 100 },
    ]);
    expect(f[0].de).toBe(0);
    expect(f.at(-1)!.ate).toBe(360);
    for (let i = 1; i < f.length; i += 1) {
      expect(f[i].de).toBe(f[i - 1].ate);
    }
  });

  it("porcentagens somam 100", () => {
    const f = fatias([
      { categoria: "A", rotulo: "A", centavos: 1 },
      { categoria: "B", rotulo: "B", centavos: 2 },
    ]);
    expect(f.reduce((s, x) => s + x.porcentagem, 0)).toBeCloseTo(100, 6);
  });

  it("sem despesa, nao ha pizza", () => {
    expect(fatias([])).toEqual([]);
    expect(fatias([{ categoria: "A", rotulo: "A", centavos: 0 }])).toEqual([]);
  });
});

describe("competencia", () => {
  // 1h da manha do dia 1 em UTC ainda e dia 30 as 22h em Brasilia: a
  // competencia tem que ser a do escritorio, nao a do servidor.
  it("usa o fuso de Brasilia", () => {
    expect(competenciaDaData(new Date("2026-10-01T01:00:00Z"))).toBe("2026-09");
    expect(competenciaDaData(new Date("2026-10-01T12:00:00Z"))).toBe("2026-10");
  });
});

describe("vencimento da despesa fixa", () => {
  it("respeita o dia escolhido", () => {
    expect(vencimentoNaCompetencia("2026-09", 10)?.toISOString().slice(0, 10)).toBe(
      "2026-09-10",
    );
  });

  // Dia 31 em mes de 30 cai no ultimo dia, como qualquer boleto — nao no dia
  // 1 do mes seguinte, que e o que o Date faria sozinho.
  it("dia 31 em mes de 30 cai no ultimo dia do mes", () => {
    expect(vencimentoNaCompetencia("2026-09", 31)?.toISOString().slice(0, 10)).toBe(
      "2026-09-30",
    );
    expect(vencimentoNaCompetencia("2026-02", 31)?.toISOString().slice(0, 10)).toBe(
      "2026-02-28",
    );
  });

  it("recusa competencia e dia impossiveis", () => {
    expect(vencimentoNaCompetencia("2026-13", 10)).toBeNull();
    expect(vencimentoNaCompetencia("setembro", 10)).toBeNull();
    expect(vencimentoNaCompetencia("2026-09", 0)).toBeNull();
    expect(vencimentoNaCompetencia("2026-09", 32)).toBeNull();
  });
});

describe("valor por extenso", () => {
  // No contrato, o valor por extenso prevalece sobre o numero quando os dois
  // discordam. Errar aqui e errar o preco.
  it("escreve o que se escreve em contrato", () => {
    expect(porExtenso(100)).toBe("um real");
    expect(porExtenso(200)).toBe("dois reais");
    expect(porExtenso(300_000)).toBe("tres mil reais");
    expect(porExtenso(150_000)).toBe("mil e quinhentos reais");
    expect(porExtenso(29_990)).toBe("duzentos e noventa e nove reais e noventa centavos");
    expect(porExtenso(1)).toBe("um centavo");
    expect(porExtenso(0)).toBe("zero real");
  });

  // "cem" sozinho, "cento" acompanhado: cem reais, cento e um reais.
  it("cem e cento", () => {
    expect(numeroPorExtenso(100)).toBe("cem");
    expect(numeroPorExtenso(101)).toBe("cento e um");
    expect(numeroPorExtenso(199)).toBe("cento e noventa e nove");
  });

  it("o 'e' cai onde cai na fala", () => {
    expect(numeroPorExtenso(1000)).toBe("mil");
    expect(numeroPorExtenso(1500)).toBe("mil e quinhentos");
    expect(numeroPorExtenso(2030)).toBe("dois mil e trinta");
    expect(numeroPorExtenso(1234)).toBe("mil duzentos e trinta e quatro");
    expect(numeroPorExtenso(100_000)).toBe("cem mil");
    expect(numeroPorExtenso(1_000_000)).toBe("um milhao");
    expect(numeroPorExtenso(2_000_000)).toBe("dois milhoes");
  });

  it("centavos nao viram reais", () => {
    expect(porExtenso(99)).toBe("noventa e nove centavos");
    expect(porExtenso(101)).toBe("um real e um centavo");
  });
});
