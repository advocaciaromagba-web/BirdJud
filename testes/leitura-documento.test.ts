// Cadastro por leitura.
//
// O que se prova: a leitura da IA nao entra no cadastro sem passar por uma
// conferencia local. Campo inventado e descartado, CPF que nao fecha o digito
// e rebaixado e explicado, numero de processo fora do padrao do CNJ tambem, e
// resposta que nao e JSON vira erro em vez de cadastro vazio.
import { describe, expect, it } from "vitest";
import {
  cnpjValido,
  cpfValido,
  formatarDocumento,
} from "../src/lib/documentos";
import {
  interpretar,
  LeituraIlegivel,
  montarInstrucao,
  rotuloDoCampo,
} from "../src/lib/leitura-documento";

describe("CPF e CNPJ", () => {
  it("confere o digito verificador", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("529.982.247-26")).toBe(false);
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11.222.333/0001-82")).toBe(false);
  });

  it("numero repetido nao passa, mesmo fechando a conta", () => {
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cnpjValido("11.111.111/1111-11")).toBe(false);
  });

  it("poe a mascara que o escritorio le", () => {
    expect(formatarDocumento("52998224725")).toBe("529.982.247-25");
    expect(formatarDocumento("11222333000181")).toBe("11.222.333/0001-81");
  });
});

describe("leitura de documento", () => {
  it("aceita so os campos do perfil", () => {
    const leitura = interpretar(
      "CLIENTE",
      JSON.stringify({
        campos: {
          nome: { valor: "Maria de Souza", confianca: "ALTA", origem: "RG" },
          salario: { valor: "3000", confianca: "ALTA" },
        },
        observacoes: [],
      }),
    );

    expect(Object.keys(leitura.campos)).toEqual(["nome"]);
    expect(leitura.campos.nome.valor).toBe("Maria de Souza");
    expect(leitura.campos.nome.origem).toBe("RG");
  });

  it("CPF que nao fecha o digito desce para BAIXA e ganha observacao", () => {
    const leitura = interpretar(
      "CLIENTE",
      JSON.stringify({
        campos: { documento: { valor: "529.982.247-26", confianca: "ALTA" } },
        observacoes: [],
      }),
    );

    expect(leitura.campos.documento.confianca).toBe("BAIXA");
    expect(leitura.observacoes.join(" ")).toContain("digito verificador");
  });

  it("CPF certo volta com mascara e mantem a confianca", () => {
    const leitura = interpretar(
      "CLIENTE",
      JSON.stringify({
        campos: { documento: { valor: "52998224725", confianca: "ALTA" } },
        observacoes: [],
      }),
    );

    expect(leitura.campos.documento.valor).toBe("529.982.247-25");
    expect(leitura.campos.documento.confianca).toBe("ALTA");
  });

  it("numero de processo vira digitos; fora do padrao do CNJ, desce para BAIXA", () => {
    const bom = interpretar(
      "PROCESSO",
      JSON.stringify({
        campos: {
          numero: { valor: "0001234-56.2026.8.26.0100", confianca: "ALTA" },
        },
      }),
    );
    expect(bom.campos.numero.valor).toBe("00012345620268260100");
    expect(bom.campos.numero.confianca).toBe("ALTA");

    const ruim = interpretar(
      "PROCESSO",
      JSON.stringify({
        campos: { numero: { valor: "123/2026", confianca: "ALTA" } },
      }),
    );
    expect(ruim.campos.numero.confianca).toBe("BAIXA");
    expect(ruim.observacoes.join(" ")).toContain("CNJ");
  });

  it("campo sem confianca declarada nao entra como certo", () => {
    const leitura = interpretar(
      "CLIENTE",
      JSON.stringify({ campos: { nome: { valor: "Joao" } } }),
    );
    expect(leitura.campos.nome.confianca).toBe("MEDIA");
  });

  it("le mesmo com cerca de codigo em volta", () => {
    const leitura = interpretar(
      "CLIENTE",
      '```json\n{"campos":{"nome":{"valor":"Ana","confianca":"ALTA"}}}\n```',
    );
    expect(leitura.campos.nome.valor).toBe("Ana");
  });

  it("resposta que nao e JSON vira erro, nao cadastro vazio", () => {
    expect(() =>
      interpretar("CLIENTE", "nao consegui ler os documentos"),
    ).toThrow(LeituraIlegivel);
  });

  it("valor vazio nao vira campo", () => {
    const leitura = interpretar(
      "CLIENTE",
      JSON.stringify({ campos: { nome: { valor: "   ", confianca: "ALTA" } } }),
    );
    expect(leitura.campos).toEqual({});
  });

  it("a instrucao lista os campos do perfil e proibe inventar", () => {
    const instrucao = montarInstrucao("CLIENTE");
    expect(instrucao).toContain('"documento"');
    expect(instrucao).toContain("Nao invente");
    expect(instrucao).not.toContain('"tribunal"');
    expect(rotuloDoCampo("PROCESSO", "vara")).toBe("Vara");
  });
});
