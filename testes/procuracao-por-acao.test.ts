import { describe, expect, it } from "vitest";
import { nomeDoArquivoDaPeca, tituloDaPeca, valoresDaPeca, type DadosDaPeca } from "../src/lib/modelos-do-escritorio";

const base = {
  cliente: { nome: "João da Silva", documento: null, email: null, telefone: null },
  escritorio: { nome: "Prado & Moura", cidade: "Ribeirão Preto", telefoneAtendimento: null },
  contrato: {
    tipo: "VALOR",
    valorCentavos: 500000,
    entradaCentavos: null,
    percentualBp: null,
    parcelas: 1,
    primeiroVencimento: null,
    descricao: "ação de cobrança",
    ativo: true,
  },
  hoje: new Date("2026-11-01T12:00:00Z"),
} as unknown as DadosDaPeca;

describe("uma procuração por ação contratada", () => {
  it("a ação da via vira a finalidade; sem ação, vale a descrição do contrato", () => {
    expect(valoresDaPeca(base)["honorarios.descricao"]).toBe("ação de cobrança");
    expect(valoresDaPeca({ ...base, acao: "ação revisional de crédito rural" })["honorarios.descricao"]).toBe(
      "ação revisional de crédito rural",
    );
    expect(valoresDaPeca({ ...base, acao: "   " })["honorarios.descricao"]).toBe("ação de cobrança");
  });

  it("a ação entra no nome do arquivo e no título: duas vias do mesmo dia não viram um arquivo só", () => {
    const a = nomeDoArquivoDaPeca("PROCURACAO", "João da Silva", "Ação revisional de crédito rural", "PDF");
    const b = nomeDoArquivoDaPeca("PROCURACAO", "João da Silva", "Ação de cobrança", "PDF");
    expect(a).not.toBe(b);
    expect(a).toBe("procuracao-acao-revisional-de-credito-rural-joao-da-silva.pdf");
    expect(nomeDoArquivoDaPeca("PROCURACAO", "João da Silva", null, "DOCX")).toBe("procuracao-joao-da-silva.docx");
    expect(tituloDaPeca("PROCURACAO", "João da Silva", "Ação de cobrança")).toBe("Procuração (Ação de cobrança) - João da Silva");
  });
});
