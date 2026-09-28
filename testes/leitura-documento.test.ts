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
  normalizarDataHora,
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

// Perfil AGENDA: a intimacao ja traz dia, hora e endereco. O risco aqui e
// especifico e caro — audiencia no dia errado e perda de prazo, nao
// inconveniente. Por isso data que nao da para entender e recusada, nunca
// adivinhada.
describe("leitura para a agenda", () => {
  it("aceita os formatos que aparecem em intimacao brasileira", () => {
    expect(normalizarDataHora("2026-11-03T14:30")).toBe("2026-11-03T14:30");
    expect(normalizarDataHora("2026-11-03 14:30")).toBe("2026-11-03T14:30");
    expect(normalizarDataHora("03/11/2026 14:30")).toBe("2026-11-03T14:30");
    expect(normalizarDataHora("3/11/2026 as 14:30")).toBe("2026-11-03T14:30");
    expect(normalizarDataHora("03/11/2026 às 14h30")).toBe("2026-11-03T14:30");
  });

  it("sem hora, assume 09:00", () => {
    expect(normalizarDataHora("03/11/2026")).toBe("2026-11-03T09:00");
  });

  // O Date "corrige" 31/11 para 01/12 em silencio, e a audiencia mudaria de
  // mes sem ninguem ver.
  it("recusa data que nao existe em vez de deslizar para o mes seguinte", () => {
    expect(normalizarDataHora("31/11/2026 10:00")).toBeNull();
    expect(normalizarDataHora("30/02/2026 10:00")).toBeNull();
    expect(normalizarDataHora("2026-02-30T10:00")).toBeNull();
  });

  it("recusa hora impossivel e texto solto", () => {
    expect(normalizarDataHora("03/11/2026 25:00")).toBeNull();
    expect(normalizarDataHora("em quinze dias")).toBeNull();
    expect(normalizarDataHora("")).toBeNull();
  });

  it("a leitura rebaixa e explica quando a data nao serve", () => {
    const leitura = interpretar(
      "AGENDA",
      JSON.stringify({
        campos: {
          titulo: { valor: "Audiencia de instrucao", confianca: "ALTA" },
          inicio: { valor: "em quinze dias", confianca: "ALTA" },
          local: { valor: "Forum Ruy Barbosa, sala 3", confianca: "ALTA" },
        },
        observacoes: [],
      }),
    );
    // Campo que a tela nao conseguiria usar nao entra preenchido com lixo.
    expect(leitura.campos.inicio).toBeUndefined();
    expect(leitura.campos.titulo.valor).toBe("Audiencia de instrucao");
    expect(leitura.observacoes.join(" ")).toContain("nao pode ser entendida");
  });

  it("aceita a data boa e mantem o resto", () => {
    const leitura = interpretar(
      "AGENDA",
      JSON.stringify({
        campos: {
          titulo: { valor: "Audiencia una", confianca: "ALTA" },
          inicio: { valor: "03/11/2026 as 14:30", confianca: "ALTA" },
          local: { valor: "Forum", confianca: "MEDIA" },
          // Campo que o perfil nao conhece continua sendo descartado.
          documento: { valor: "123", confianca: "ALTA" },
        },
        observacoes: [],
      }),
    );
    expect(leitura.campos.inicio.valor).toBe("2026-11-03T14:30");
    expect(leitura.campos.documento).toBeUndefined();
  });
});
