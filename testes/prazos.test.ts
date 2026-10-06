// Contagem de prazo processual.
//
// POR QUE ESTE E O ARQUIVO DE TESTE MAIS IMPORTANTE DO SISTEMA: todo erro
// aqui tem conserto depois, menos este. Dinheiro cobrado errado se devolve,
// cadastro errado se corrige, e-mail que nao saiu se reenvia. Prazo perdido
// perde o direito, e nao ha tela que desfaca.
//
// As datas abaixo foram conferidas no calendario, uma a uma. Quem mudar o
// codigo e vir um destes testes vermelho deve desconfiar do codigo, nao do
// teste.
import { describe, expect, it } from "vitest";
import {
  PrazoInvalido,
  calcularPrazo,
  dataValida,
  dentroDoRecesso,
  diasUteisAte,
  domingoDePascoa,
  ehDiaUtil,
  feriadosNacionais,
  paraBR,
  proximoDiaUtil,
} from "../src/lib/prazos";

const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("o calendario movel", () => {
  // Pascoa erra o ano inteiro de carnaval, sexta santa e Corpus Christi.
  it("acha a Pascoa", () => {
    expect(domingoDePascoa(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(domingoDePascoa(2027).toISOString().slice(0, 10)).toBe("2027-03-28");
    expect(domingoDePascoa(2024).toISOString().slice(0, 10)).toBe("2024-03-31");
  });

  it("pendura carnaval, sexta santa e Corpus Christi de 2026", () => {
    const f = feriadosNacionais(2026);
    expect(f.has("2026-02-16")).toBe(true); // segunda de carnaval
    expect(f.has("2026-02-17")).toBe(true); // terca de carnaval
    expect(f.has("2026-04-03")).toBe(true); // sexta-feira santa
    expect(f.has("2026-06-04")).toBe(true); // corpus christi
  });

  it("traz os feriados forenses, que nao sao feriado nacional", () => {
    const f = feriadosNacionais(2026);
    expect(f.has("2026-08-11")).toBe(true); // Dia do Advogado
    expect(f.has("2026-11-01")).toBe(true); // Todos os Santos
    expect(f.has("2026-12-08")).toBe(true); // Dia da Justica
  });
});

describe("o que e dia util", () => {
  it("fim de semana nao e", () => {
    expect(ehDiaUtil(dia("2026-10-10"))).toBe(false); // sabado
    expect(ehDiaUtil(dia("2026-10-11"))).toBe(false); // domingo
    expect(ehDiaUtil(dia("2026-10-09"))).toBe(true); // sexta
  });

  it("feriado nacional nao e", () => {
    expect(ehDiaUtil(dia("2026-09-07"))).toBe(false); // Independencia, segunda
  });

  it("o recesso inteiro nao e (CPC 220)", () => {
    expect(dentroDoRecesso(dia("2026-12-19"))).toBe(false);
    expect(dentroDoRecesso(dia("2026-12-20"))).toBe(true);
    expect(dentroDoRecesso(dia("2027-01-20"))).toBe(true);
    expect(dentroDoRecesso(dia("2027-01-21"))).toBe(false);
    // 22/12/2026 e uma terca-feira comum, e mesmo assim nao corre prazo.
    expect(ehDiaUtil(dia("2026-12-22"))).toBe(false);
  });

  it("o dia que o ESCRITORIO marcou nao e", () => {
    // Feriado municipal nao cabe em lista nacional: cada escritorio trabalha
    // em comarcas diferentes. Esta e a diferenca que o multi-inquilino exige.
    const comarca = ["2026-10-08"]; // feriado so naquela cidade
    expect(ehDiaUtil(dia("2026-10-08"))).toBe(true);
    expect(ehDiaUtil(dia("2026-10-08"), comarca)).toBe(false);
  });
});

describe("prazo em dias uteis (CPC 219)", () => {
  // Quinta 08/10/2026. Exclui o dia do comeco: comeca sexta 09/10.
  // 09(1) 13(2) 14(3) 15(4) 16(5) — segunda 12/10 e Nossa Senhora Aparecida.
  it("exclui o dia do comeco e pula o feriado no meio", () => {
    const p = calcularPrazo("2026-10-08", 5);
    expect(p.inicioContagem).toBe("2026-10-09");
    expect(p.vencimento).toBe("2026-10-16");
    expect(p.explicacao).toContain("CPC 219");
  });

  it("prazo de 1 dia vence no primeiro dia util seguinte", () => {
    expect(calcularPrazo("2026-10-08", 1).vencimento).toBe("2026-10-09");
  });

  // Termo inicial numa sexta: a contagem so comeca na segunda.
  it("termo inicial na sexta comeca a correr na segunda", () => {
    const p = calcularPrazo("2026-10-09", 1);
    expect(p.inicioContagem).toBe("2026-10-13"); // 12/10 e feriado
    expect(p.vencimento).toBe("2026-10-13");
  });

  // 15 dias uteis a partir de 15/12/2026 atravessam o recesso inteiro.
  // Comeca 16/12: 16,17,18(3). Recesso de 20/12 a 20/01. Volta 21/01:
  // 21,22,25,26,27,28,29(10) fev 01,02,03,04,05(15) -> 05/02/2027.
  it("suspende no recesso e avisa na explicacao (CPC 220)", () => {
    const p = calcularPrazo("2026-12-15", 15);
    expect(p.inicioContagem).toBe("2026-12-16");
    expect(p.vencimento).toBe("2027-02-05");
    expect(p.explicacao).toContain("CPC 220");
  });

  it("prazo que nao toca o recesso nao fala dele", () => {
    expect(calcularPrazo("2026-10-08", 5).explicacao).not.toContain("CPC 220");
  });

  it("o calendario do escritorio empurra o vencimento", () => {
    const sem = calcularPrazo("2026-10-08", 5).vencimento;
    const com = calcularPrazo("2026-10-08", 5, "UTEIS", ["2026-10-14"]).vencimento;
    expect(sem).toBe("2026-10-16");
    expect(com).toBe("2026-10-19"); // pulou 14/10, caiu na segunda
  });
});

describe("prazo em dias corridos (CPP 798, direito material)", () => {
  it("conta sabado e domingo", () => {
    const p = calcularPrazo("2026-10-08", 5, "CORRIDOS");
    expect(p.vencimento).toBe("2026-10-13"); // 13/10, pois 12/10 e feriado
  });

  // O engano mais comum: achar que "corrido" quer dizer "sem prorrogar".
  it("ainda prorroga quando o vencimento cai em dia sem expediente", () => {
    // 05/10/2026 + 5 = 10/10, sabado -> prorroga para segunda 13/10 (12 e feriado)
    const p = calcularPrazo("2026-10-05", 5, "CORRIDOS");
    expect(p.vencimento).toBe("2026-10-13");
    expect(p.explicacao).toContain("CPC 224 § 1º");
  });

  it("vencimento ja em dia util nao fala em prorrogacao", () => {
    const p = calcularPrazo("2026-10-08", 1, "CORRIDOS");
    expect(p.vencimento).toBe("2026-10-09");
    expect(p.explicacao).not.toContain("prorrogado");
  });
});

describe("o que a funcao recusa", () => {
  // Recusar e melhor que devolver uma data: data errada aqui perde direito.
  it("data que nao existe no calendario", () => {
    expect(() => calcularPrazo("2026-11-31", 5)).toThrow(PrazoInvalido);
    expect(() => calcularPrazo("2026-02-30", 5)).toThrow(PrazoInvalido);
    expect(() => calcularPrazo("08/10/2026", 5)).toThrow(PrazoInvalido);
    expect(() => calcularPrazo("", 5)).toThrow(PrazoInvalido);
  });

  it("quantidade de dias que nao serve", () => {
    for (const d of [0, -5, 1.5, 1001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => calcularPrazo("2026-10-08", d), String(d)).toThrow(PrazoInvalido);
    }
  });

  it("ano inteiro sem expediente lanca em vez de devolver dia errado", () => {
    const anoTodo: string[] = [];
    for (let i = 0; i < 420; i++) {
      anoTodo.push(new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10));
    }
    expect(() => proximoDiaUtil(dia("2026-01-02"), anoTodo)).toThrow(/sem expediente/);
  });
});

describe("quanto falta", () => {
  it("conta dias uteis entre duas datas", () => {
    // 08/10 (qui) ate 16/10 (sex): 09,13,14,15,16 = 5 (12/10 e feriado)
    expect(diasUteisAte("2026-10-08", "2026-10-16")).toBe(5);
  });

  it("devolve negativo quando a data ja passou", () => {
    expect(diasUteisAte("2026-10-16", "2026-10-08")).toBe(-5);
  });

  it("mesmo dia e zero", () => {
    expect(diasUteisAte("2026-10-08", "2026-10-08")).toBe(0);
  });
});

describe("apresentacao", () => {
  it("vira DD/MM/AAAA", () => {
    expect(paraBR("2026-10-08")).toBe("08/10/2026");
  });

  it("data que nao serve nao vira texto enganoso", () => {
    expect(paraBR("2026-11-31")).toBe("");
    expect(paraBR(null)).toBe("");
    expect(paraBR("qualquer coisa")).toBe("");
  });

  it("dataValida pega o 31 de novembro", () => {
    expect(dataValida("2026-11-30")).toBe(true);
    expect(dataValida("2026-11-31")).toBe(false);
    expect(dataValida("2024-02-29")).toBe(true); // bissexto
    expect(dataValida("2026-02-29")).toBe(false);
  });
});
