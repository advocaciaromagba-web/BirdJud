// Contas a pagar.
//
// O QUE ESTES TESTES PROTEGEM: dinheiro saindo sem motivo, e dinheiro saindo
// a mais. A despesa fixa que continua sendo gerada depois do contrato acabar
// faz o escritorio pagar aluguel de sala que devolveu; a conta que vence sem
// aviso vira juros, multa, ou servico cortado.
import { describe, expect, it } from "vitest";
import {
  AVISOS_EM_DIAS,
  comoTexto,
  diasAte,
  limiteDaBusca,
  urgencia,
  vigenciaCoerente,
  vigenteNaCompetencia,
} from "../src/lib/contas-a-pagar";

describe("vigencia da despesa fixa", () => {
  const sempre = { inicioEm: null, fimEm: null, ativo: true };

  it("sem inicio nem fim, vale todo mes", () => {
    expect(vigenteNaCompetencia(sempre, "2026-01")).toBe(true);
    expect(vigenteNaCompetencia(sempre, "2030-12")).toBe(true);
  });

  it("nao gera mes anterior ao comeco", () => {
    const v = { inicioEm: "2026-03-20", fimEm: null, ativo: true };
    expect(vigenteNaCompetencia(v, "2026-02")).toBe(false);
    // Comecou dia 20 de marco: ainda e despesa de marco.
    expect(vigenteNaCompetencia(v, "2026-03")).toBe(true);
    expect(vigenteNaCompetencia(v, "2026-04")).toBe(true);
  });

  // O caso que custa dinheiro: a sala foi devolvida em junho.
  it("nao gera mes posterior ao fim", () => {
    const v = { inicioEm: "2026-01-01", fimEm: "2026-06-30", ativo: true };
    expect(vigenteNaCompetencia(v, "2026-06")).toBe(true);
    expect(vigenteNaCompetencia(v, "2026-07")).toBe(false);
    expect(vigenteNaCompetencia(v, "2027-01")).toBe(false);
  });

  it("fim no comeco do mes ainda vale aquele mes", () => {
    const v = { inicioEm: null, fimEm: "2026-06-02", ativo: true };
    expect(vigenteNaCompetencia(v, "2026-06")).toBe(true);
    expect(vigenteNaCompetencia(v, "2026-07")).toBe(false);
  });

  it("desligada nao gera nunca", () => {
    expect(vigenteNaCompetencia({ ...sempre, ativo: false }, "2026-06")).toBe(false);
  });

  it("competencia malformada nao gera", () => {
    expect(vigenteNaCompetencia(sempre, "2026")).toBe(false);
    expect(vigenteNaCompetencia(sempre, "06/2026")).toBe(false);
  });

  it("o fim nao pode vir antes do comeco", () => {
    expect(vigenciaCoerente("2026-03-01", "2026-02-01")).toBe(false);
    expect(vigenciaCoerente("2026-03-01", "2026-03-01")).toBe(true);
    expect(vigenciaCoerente("2026-03-01", null)).toBe(true);
    expect(vigenciaCoerente(null, "2026-03-01")).toBe(true);
  });
});

describe("regua do aviso", () => {
  it("avisa 3 dias antes, 1 dia antes, no dia, e quando atrasa", () => {
    expect(urgencia("2026-10-10", "2026-10-07")).toBe("EM_3_DIAS");
    expect(urgencia("2026-10-10", "2026-10-09")).toBe("AMANHA");
    expect(urgencia("2026-10-10", "2026-10-10")).toBe("HOJE");
    expect(urgencia("2026-10-10", "2026-10-11")).toBe("ATRASADA");
  });

  // Avisar todo dia e o jeito certo de o aviso virar ruido que ninguem le.
  it("nao avisa nos dias de folga da regua", () => {
    expect(urgencia("2026-10-10", "2026-10-08")).toBeNull(); // faltam 2
    expect(urgencia("2026-10-10", "2026-10-06")).toBeNull(); // faltam 4
    expect(urgencia("2026-10-10", "2026-09-10")).toBeNull();
  });

  it("e a mesma regua dos prazos", () => {
    expect([...AVISOS_EM_DIAS]).toEqual([3, 1, 0]);
  });

  it("atravessa a virada do mes e do ano", () => {
    expect(urgencia("2027-01-01", "2026-12-29")).toBe("EM_3_DIAS");
    expect(urgencia("2027-01-01", "2026-12-31")).toBe("AMANHA");
    expect(diasAte("2027-01-01", "2026-12-01")).toBe(31);
  });

  it("escreve do jeito que se fala", () => {
    expect(comoTexto("ATRASADA", -1)).toBe("venceu ha 1 dia");
    expect(comoTexto("ATRASADA", -5)).toBe("venceu ha 5 dias");
    expect(comoTexto("HOJE", 0)).toBe("vence hoje");
    expect(comoTexto("AMANHA", 1)).toBe("vence amanha");
  });
});

describe("limite da busca", () => {
  // O vencimento e gravado ao meio-dia. Buscar ate "hoje + 3 as 00h" deixaria
  // a conta do terceiro dia de fora por doze horas, e o aviso de tres dias
  // antes nunca sairia — sem erro nenhum na tela.
  it("alcanca o dia inteiro da conta que vence em 3 dias", () => {
    const limite = limiteDaBusca("2026-10-07");
    const vencimentoAoMeioDia = new Date("2026-10-10T12:00:00Z");
    expect(vencimentoAoMeioDia.getTime()).toBeLessThan(limite.getTime());
  });

  it("nao alcanca o quarto dia", () => {
    const limite = limiteDaBusca("2026-10-07");
    expect(new Date("2026-10-11T12:00:00Z").getTime()).toBeGreaterThan(limite.getTime());
  });

  // Buscar um dia a mais nao cria aviso a mais: quem decide e `urgencia`.
  it("buscar mais nao avisa mais", () => {
    expect(urgencia("2026-10-10", "2026-10-06")).toBeNull();
  });
});
