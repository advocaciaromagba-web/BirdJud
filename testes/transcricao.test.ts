/**
 * Como a fala vira anotacao.
 *
 * Cada caso aqui e uma forma conhecida de o reconhecimento estragar o texto:
 * paragrafo unico de dez minutos, trecho repetido a cada pausa, e resposta
 * do cliente colada na pergunta do advogado.
 */
import { describe, expect, it } from "vitest";
import {
  AVISO_DA_DISPONIBILIDADE,
  juntarFala,
  temFala,
} from "../src/lib/transcricao";

describe("juntar a fala reconhecida", () => {
  it("abre com a marca de quem fala", () => {
    expect(juntarFala("", "boa tarde", "ADVOGADO", null)).toBe(
      "Advogado: Boa tarde.",
    );
  });

  it("poe maiuscula e ponto, que o reconhecimento não poe", () => {
    expect(juntarFala("", "fui mandado embora", "CLIENTE", null)).toBe(
      "Cliente: Fui mandado embora.",
    );
  });

  it("não duplica pontuação que já veio", () => {
    expect(juntarFala("", "quando foi?", "ADVOGADO", null)).toBe(
      "Advogado: Quando foi?",
    );
  });

  it("troca de lado começa linha nova", () => {
    const depois = juntarFala(
      "Advogado: Quando foi?",
      "em marco",
      "CLIENTE",
      "ADVOGADO",
    );
    expect(depois).toBe("Advogado: Quando foi?\n\nCliente: Em marco.");
  });

  it("mesmo lado continua na mesma linha", () => {
    const depois = juntarFala(
      "Cliente: Em marco.",
      "no dia dez",
      "CLIENTE",
      "CLIENTE",
    );
    expect(depois).toBe("Cliente: Em marco. No dia dez.");
  });

  it("trecho repetido na pausa não entra duas vezes", () => {
    const uma = juntarFala("", "fui mandado embora", "CLIENTE", null);
    const duas = juntarFala(uma, "Fui mandado embora.", "CLIENTE", "CLIENTE");
    expect(duas).toBe(uma);
  });

  it("trecho vazio ou só espaço não mexe no texto", () => {
    expect(juntarFala("Cliente: Oi.", "   ", "CLIENTE", "CLIENTE")).toBe(
      "Cliente: Oi.",
    );
    expect(juntarFala("Cliente: Oi.", "", "ADVOGADO", "CLIENTE")).toBe(
      "Cliente: Oi.",
    );
  });

  it("espacos a mais no meio do trecho somem", () => {
    expect(juntarFala("", "  fui   embora  ", "CLIENTE", null)).toBe(
      "Cliente: Fui embora.",
    );
  });
});

describe("tem fala de verdade?", () => {
  it("texto só com marcas não conta", () => {
    expect(temFala("Advogado:\nCliente:")).toBe(false);
    expect(temFala("")).toBe(false);
  });

  it("com qualquer palavra, conta", () => {
    expect(temFala("Cliente: Oi.")).toBe(true);
  });
});

describe("aviso de disponibilidade", () => {
  /**
   * A trava que importa: o sistema NUNCA oferece nuvem como alternativa
   * equivalente. Sem local, ele diz o que isso significa e deixa a escolha
   * com quem esta na sala.
   */
  it("sem suporte, o aviso diz que a conversa sairia do escritório", () => {
    expect(AVISO_DA_DISPONIBILIDADE["sem-suporte"]).toContain(
      "sair do escritório",
    );
  });

  it("pronto, o aviso afirma que a conversa não sai dali", () => {
    expect(AVISO_DA_DISPONIBILIDADE.pronto).toContain("não sai daqui");
  });
});
