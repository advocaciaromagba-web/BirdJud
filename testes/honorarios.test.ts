// Honorarios.
//
// O QUE ESTES TESTES PROTEGEM: o valor que o cliente vai pagar. Parcela
// calculada errada nao parece erro — parece contrato. E so aparece quando o
// cliente soma as parcelas e reclama, meses depois, com razao.
import { describe, expect, it } from "vitest";
import {
  ANTECEDENCIA_DIAS,
  dividir,
  impedimentos,
  mesesAdiante,
  naJanela,
  percentualEmTexto,
  planoDoContrato,
  proximaParcela,
  type Contrato,
  vencida,
} from "../src/lib/honorarios";

const CONTRATO = (over: Partial<Contrato> = {}): Contrato => ({
  tipo: "VALOR",
  valorCentavos: 300_000,
  percentualBp: null,
  parcelas: 3,
  primeiroVencimento: "2026-11-10",
  descricao: null,
  ativo: true,
  ...over,
});

describe("divisao do valor", () => {
  it("a soma das parcelas e exatamente o total", () => {
    for (const total of [100_00, 10_000, 299_99, 1, 7, 123_457]) {
      for (const n of [1, 2, 3, 7, 12]) {
        if (n > total) continue;
        const partes = dividir(total, n);
        expect(partes).toHaveLength(n);
        expect(partes.reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  it("a sobra de centavos fica na ultima", () => {
    expect(dividir(10_000, 3)).toEqual([3333, 3333, 3334]);
  });
});

describe("vencimentos mes a mes", () => {
  it("mantem o dia contratado", () => {
    expect(mesesAdiante("2026-11-10", 0)).toBe("2026-11-10");
    expect(mesesAdiante("2026-11-10", 1)).toBe("2026-12-10");
    expect(mesesAdiante("2026-11-10", 3)).toBe("2027-02-10");
  });

  // Somar 30 dias faria 31/01 virar 02/03 e depois 01/04: o vencimento anda
  // para tras e deixa de ser o dia que o cliente combinou.
  it("dia 31 em mes curto cai no ultimo dia do mes", () => {
    expect(mesesAdiante("2027-01-31", 1)).toBe("2027-02-28");
    expect(mesesAdiante("2028-01-31", 1)).toBe("2028-02-29");
    expect(mesesAdiante("2027-01-31", 2)).toBe("2027-03-31");
  });

  it("nao perde o dia depois de passar por um mes curto", () => {
    const p = planoDoContrato(CONTRATO({ primeiroVencimento: "2027-01-31", parcelas: 3 }));
    expect(p.parcelas.map((x) => x.vencimento)).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
    ]);
  });
});

describe("plano do contrato", () => {
  it("parcela valor fixo", () => {
    const p = planoDoContrato(CONTRATO());
    expect(p.emiteSozinho).toBe(true);
    expect(p.parcelas).toHaveLength(3);
    expect(p.parcelas[0]).toMatchObject({
      numero: 1,
      total: 3,
      valorCentavos: 100_000,
      vencimento: "2026-11-10",
    });
    expect(p.parcelas[0].descricao).toContain("parcela 1/3");
  });

  it("a vista nao escreve 'parcela 1/1'", () => {
    const p = planoDoContrato(CONTRATO({ parcelas: 1 }));
    expect(p.parcelas[0].descricao).toBe("Honorarios advocaticios");
  });

  it("a descricao do contrato entra no nome da cobranca", () => {
    const p = planoDoContrato(CONTRATO({ parcelas: 1, descricao: "acao trabalhista" }));
    expect(p.parcelas[0].descricao).toBe("Honorarios advocaticios — acao trabalhista");
  });

  // O valor do exito so existe quando a acao termina: emitir antes seria
  // cobrar um numero que ninguem sabe ainda.
  it("percentual de exito nao gera parcela", () => {
    const p = planoDoContrato(CONTRATO({ tipo: "PERCENTUAL", percentualBp: 3000, valorCentavos: null }));
    expect(p.emiteSozinho).toBe(false);
    expect(p.parcelas).toEqual([]);
  });

  it("misto gera so a entrada, e diz que e entrada", () => {
    const p = planoDoContrato(CONTRATO({ tipo: "MISTO", percentualBp: 2000, parcelas: 1 }));
    expect(p.emiteSozinho).toBe(true);
    expect(p.parcelas).toHaveLength(1);
    expect(p.parcelas[0].descricao).toContain("(entrada)");
  });

  it("contrato encerrado nao gera mais nada", () => {
    expect(planoDoContrato(CONTRATO({ ativo: false })).emiteSozinho).toBe(false);
  });

  it("recusa, dizendo o que falta, em vez de emitir errado", () => {
    expect(planoDoContrato(CONTRATO({ valorCentavos: 0 })).motivo).toMatch(/sem valor/i);
    expect(planoDoContrato(CONTRATO({ primeiroVencimento: null })).motivo).toMatch(/primeiro vencimento/i);
    expect(planoDoContrato(CONTRATO({ primeiroVencimento: "10/11/2026" })).motivo).toMatch(/primeiro vencimento/i);
    expect(planoDoContrato(CONTRATO({ parcelas: 0 })).motivo).toMatch(/quantas parcelas/i);
    expect(planoDoContrato(CONTRATO({ parcelas: 900 })).motivo).toMatch(/confira o contrato/i);
    expect(planoDoContrato(CONTRATO({ valorCentavos: 10, parcelas: 12 })).motivo).toMatch(/centavos/i);
  });
});

describe("proxima parcela", () => {
  it("pula as que ja viraram cobranca", () => {
    const p = planoDoContrato(CONTRATO());
    expect(proximaParcela(p, [])?.numero).toBe(1);
    expect(proximaParcela(p, [1])?.numero).toBe(2);
    expect(proximaParcela(p, [1, 2, 3])).toBeNull();
  });

  // Se a 2a saiu antes da 1a (emissao a mao), a 1a continua devida.
  it("volta na que ficou para tras", () => {
    const p = planoDoContrato(CONTRATO());
    expect(proximaParcela(p, [2])?.numero).toBe(1);
  });

  it("contrato que nao emite sozinho nao tem proxima", () => {
    expect(proximaParcela(planoDoContrato(CONTRATO({ tipo: "PERCENTUAL" })), [])).toBeNull();
  });
});

describe("janela de emissao", () => {
  it("so emite perto do vencimento", () => {
    expect(naJanela("2026-11-10", "2026-11-01")).toBe(true);
    // Dez dias antes e o primeiro dia que vale; onze dias antes ainda nao.
    expect(naJanela("2026-11-10", "2026-10-31")).toBe(true);
    expect(naJanela("2026-11-10", "2026-10-30")).toBe(false);
    // Parcela ja vencida continua devida: nao some da lista por ter passado.
    expect(naJanela("2026-11-10", "2026-11-30")).toBe(true);
  });

  it("a janela e de dez dias", () => {
    expect(ANTECEDENCIA_DIAS).toBe(10);
  });

  it("atravessa a virada do mes sem errar", () => {
    expect(naJanela("2027-01-05", "2026-12-26")).toBe(true);
    expect(naJanela("2027-01-05", "2026-12-25")).toBe(false);
  });
});

describe("impedimentos do cadastro", () => {
  it("sem CPF ou CNPJ valido nao emite", () => {
    expect(impedimentos({ nome: "Ana", documento: null })).toHaveLength(1);
    expect(impedimentos({ nome: "Ana", documento: "123" })).toHaveLength(1);
    expect(impedimentos({ nome: "", documento: "52998224725" })).toHaveLength(1);
    expect(impedimentos({ nome: "Ana", documento: "529.982.247-25" })).toEqual([]);
    expect(impedimentos({ nome: "Aurora LTDA", documento: "11222333000181" })).toEqual([]);
  });
});

describe("percentual na tela", () => {
  it("escreve como o contrato escreve", () => {
    expect(percentualEmTexto(3000)).toBe("30%");
    expect(percentualEmTexto(1250)).toBe("12,5%");
    expect(percentualEmTexto(555)).toBe("5,55%");
  });
});

describe("parcela atrasada", () => {
  // O provedor recusa boleto com vencimento no passado, e emitir com a data de
  // hoje mudaria caladamente o que o contrato diz.
  it("vencida e so o que ja passou", () => {
    expect(vencida("2026-11-10", "2026-11-11")).toBe(true);
    expect(vencida("2026-11-10", "2026-11-10")).toBe(false);
    expect(vencida("2026-11-10", "2026-11-09")).toBe(false);
  });
});
