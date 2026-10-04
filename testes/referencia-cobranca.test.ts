import { describe, expect, it } from "vitest";
import {
  SISTEMA,
  lerReferencia,
  referencia,
  resumoDaBaixa,
} from "../src/lib/referencia-cobranca";

/**
 * O que estes testes protegem: a conta Asaas da Blackbird atende varios
 * sistemas, e o evento de pagamento de qualquer um deles chega no webhook de
 * todos. Errar a leitura da referencia tem dois precos, os dois caros:
 *
 *   - achar que um pagamento alheio e nosso -> baixa na fatura errada;
 *   - achar que um pagamento nosso e alheio -> escritorio pago e suspenso.
 */
describe("referencia de cobranca", () => {
  it("marca a referencia com o sistema e o tipo", () => {
    expect(referencia("fatura", "abc123")).toBe("birdjud:fatura:abc123");
    expect(referencia("escritorio", "esc1")).toBe("birdjud:escritorio:esc1");
  });

  it("reconhece a propria marca", () => {
    expect(lerReferencia("birdjud:fatura:abc123")).toEqual({
      dono: "nosso",
      tipo: "fatura",
      id: "abc123",
    });
  });

  it("devolve o que a referencia ida produziu", () => {
    const leitura = lerReferencia(referencia("fatura", "cmul0001"));
    expect(leitura).toEqual({ dono: "nosso", tipo: "fatura", id: "cmul0001" });
  });

  it("identifica o pagamento de outro sistema da mesma conta", () => {
    // Os vizinhos reais desta conta em 04/10/2026.
    for (const outro of ["laudojud", "anjosdasuasaude", "chamaja"]) {
      expect(lerReferencia(`${outro}:fatura:9`)).toEqual({
        dono: "outro",
        sistema: outro,
      });
    }
  });

  it("nao se engana com maiusculas na marca", () => {
    expect(lerReferencia("BirdJud:fatura:abc")).toEqual({
      dono: "nosso",
      tipo: "fatura",
      id: "abc",
    });
    expect(lerReferencia("LAUDOJUD:fatura:abc")).toEqual({
      dono: "outro",
      sistema: "laudojud",
    });
  });

  it("nao chuta: referencia sem marca fica indefinida, nunca nossa", () => {
    // Era assim que as cobrancas antigas saiam, e e assim que saem as de
    // sistemas que nao marcam. Quem le decide pelo banco.
    expect(lerReferencia("cmuljjo3z0000tp3nyq30n0tl")).toEqual({
      dono: "indefinido",
      bruto: "cmuljjo3z0000tp3nyq30n0tl",
    });
    expect(lerReferencia(null)).toEqual({ dono: "indefinido", bruto: null });
    expect(lerReferencia("   ")).toEqual({ dono: "indefinido", bruto: null });
    expect(lerReferencia(undefined)).toEqual({
      dono: "indefinido",
      bruto: null,
    });
  });

  it("nossa marca com tipo desconhecido nao vira tipo inventado", () => {
    const leitura = lerReferencia("birdjud:boleto:abc");
    expect(leitura.dono).toBe("indefinido");
  });

  it("nossa marca sem id nao vale", () => {
    expect(lerReferencia("birdjud:fatura:").dono).toBe("indefinido");
    expect(lerReferencia("birdjud:fatura").dono).toBe("indefinido");
  });

  it("id que contem o separador volta inteiro", () => {
    // Nao vai acontecer com cuid, mas partir o id no primeiro ":" daria baixa
    // em outra fatura — e isto e dinheiro.
    expect(lerReferencia("birdjud:fatura:a:b:c")).toEqual({
      dono: "nosso",
      tipo: "fatura",
      id: "a:b:c",
    });
  });

  it("a marca e estavel: esta gravada nas cobrancas ja emitidas", () => {
    expect(SISTEMA).toBe("birdjud");
  });
});

describe("resumo da baixa", () => {
  it("diz a forma, o valor e o pagamento", () => {
    expect(
      resumoDaBaixa({
        sistema: "birdjud",
        marcada: true,
        forma: "PIX",
        valor: 299,
        pagamentoId: "pay_123",
      }),
    ).toBe("recebido por Pix · R$ 299,00 · pay_123");
  });

  it("traduz as formas do provedor", () => {
    expect(resumoDaBaixa({ forma: "BOLETO" })).toBe("recebido por boleto");
    expect(resumoDaBaixa({ forma: "CREDIT_CARD" })).toBe(
      "recebido por cartao de credito",
    );
  });

  it("forma que nao conhecemos aparece como veio, nao desaparece", () => {
    expect(resumoDaBaixa({ forma: "FORMA_NOVA" })).toBe(
      "recebido por FORMA_NOVA",
    );
  });

  it("baixa manual mostra a origem em vez da forma", () => {
    expect(
      resumoDaBaixa({
        sistema: "birdjud",
        origem: "baixa manual no console da plataforma",
        pagamentoId: null,
      }),
    ).toBe("baixa manual no console da plataforma");
  });

  it("avisa quando a referencia veio sem marca de sistema", () => {
    expect(resumoDaBaixa({ forma: "PIX", marcada: false })).toBe(
      "recebido por Pix · sem marca de sistema na referencia",
    );
  });

  it("aguenta lixo sem derrubar a pagina", () => {
    // O conteudo vem de evento de terceiro. A pagina do console e exatamente
    // onde alguem vai olhar quando o pagamento deu problema: ela nao pode ser
    // a segunda coisa a falhar.
    expect(resumoDaBaixa(null)).toBeNull();
    expect(resumoDaBaixa(undefined)).toBeNull();
    expect(resumoDaBaixa("texto")).toBeNull();
    expect(resumoDaBaixa(42)).toBeNull();
    expect(resumoDaBaixa([])).toBeNull();
    expect(resumoDaBaixa({})).toBe("recebido no provedor");
    expect(resumoDaBaixa({ forma: 7, valor: "muito" })).toBe(
      "recebido no provedor",
    );
    expect(resumoDaBaixa({ valor: Number.NaN })).toBe("recebido no provedor");
  });
});
