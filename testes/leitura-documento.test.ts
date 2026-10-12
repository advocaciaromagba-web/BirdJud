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
  completarCadastroFiscal,
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

// Perfil CONTA: conta de agua, energia, internet. O risco aqui e contabil —
// valor que nao vira dinheiro e categoria inventada fecham o mes errado sem
// ninguem perceber.
describe("leitura de conta de consumo", () => {
  it("le fornecedor, valor, vencimento e categoria", () => {
    const leitura = interpretar(
      "CONTA",
      JSON.stringify({
        campos: {
          fornecedor: { valor: "EMBASA", confianca: "ALTA" },
          descricao: { valor: "Conta de agua - setembro", confianca: "ALTA" },
          valor: { valor: "189,47", confianca: "ALTA" },
          vencimento: { valor: "10/10/2026", confianca: "ALTA" },
          categoria: { valor: "AGUA", confianca: "ALTA" },
        },
        observacoes: [],
      }),
    );
    expect(leitura.campos.fornecedor.valor).toBe("EMBASA");
    expect(leitura.campos.valor.valor).toBe("189,47");
    expect(leitura.campos.vencimento.valor).toBe("2026-10-10");
    expect(leitura.campos.categoria.valor).toBe("AGUA");
  });

  it("aceita o rotulo em minuscula e com espaco, e normaliza", () => {
    const leitura = interpretar(
      "CONTA",
      JSON.stringify({
        campos: { categoria: { valor: "pro labore", confianca: "ALTA" } },
        observacoes: [],
      }),
    );
    expect(leitura.campos.categoria.valor).toBe("PRO_LABORE");
  });

  // Categoria inventada quebra o grafico e o comparativo entre meses.
  it("descarta categoria que nao existe no catalogo, e explica", () => {
    const leitura = interpretar(
      "CONTA",
      JSON.stringify({
        campos: { categoria: { valor: "cafezinho", confianca: "ALTA" } },
        observacoes: [],
      }),
    );
    expect(leitura.campos.categoria).toBeUndefined();
    expect(leitura.observacoes.join(" ")).toContain("nao existe no catalogo");
  });

  it("descarta valor que nao vira dinheiro, e explica", () => {
    const leitura = interpretar(
      "CONTA",
      JSON.stringify({
        campos: {
          valor: { valor: "ver verso", confianca: "ALTA" },
          fornecedor: { valor: "COELBA", confianca: "ALTA" },
        },
        observacoes: [],
      }),
    );
    expect(leitura.campos.valor).toBeUndefined();
    expect(leitura.campos.fornecedor.valor).toBe("COELBA");
    expect(leitura.observacoes.join(" ")).toContain("como dinheiro");
  });

  it("descarta vencimento impossivel", () => {
    const leitura = interpretar(
      "CONTA",
      JSON.stringify({
        campos: { vencimento: { valor: "31/02/2026", confianca: "ALTA" } },
        observacoes: [],
      }),
    );
    expect(leitura.campos.vencimento).toBeUndefined();
  });

  it("a instrucao lista as categorias validas", () => {
    const instrucao = montarInstrucao("CONTA");
    expect(instrucao).toContain("ENERGIA");
    expect(instrucao).toContain("TOTAL A PAGAR");
  });
});

describe("cliente por documento de identidade e comprovante de endereco", () => {
  const campo = (valor: string, confianca = "ALTA") => ({ valor, confianca });

  it("preenche qualificacao e endereco, normalizando cada um", () => {
    const leitura = interpretar(
      "CLIENTE",
      JSON.stringify({
        campos: {
          nome: campo("Maria de Souza"),
          documento: campo("52998224725"),
          rg: campo("12.345.678-9 SSP/SP"),
          nascimento: campo("07/03/1985"),
          nacionalidade: campo("brasileira"),
          estadoCivil: campo("casada"),
          profissao: campo("professora"),
          cep: campo("14840000"),
          logradouro: campo("Rua das Flores"),
          numero: campo("120"),
          bairro: campo("Centro"),
          cidade: campo("Guariba"),
          uf: campo("sp"),
        },
        observacoes: ["Conta de energia em nome do marido."],
      }),
    );

    const v = (k: string) => leitura.campos[k]?.valor;
    expect(v("documento")).toBe("529.982.247-25");
    expect(v("nascimento")).toBe("1985-03-07");
    expect(v("cep")).toBe("14840-000");
    expect(v("uf")).toBe("SP");
    // O numero da casa nao passa pelo formato de numero de processo.
    expect(v("numero")).toBe("120");
    expect(v("rg")).toBe("12.345.678-9 SSP/SP");
    expect(leitura.observacoes).toContain("Conta de energia em nome do marido.");
  });

  it("CEP, UF e nascimento que nao servem ficam de fora, explicados", () => {
    const leitura = interpretar(
      "CLIENTE",
      JSON.stringify({
        campos: {
          cep: campo("1484-000"),
          uf: campo("Sao Paulo"),
          nascimento: campo("mil novecentos e oitenta"),
        },
        observacoes: [],
      }),
    );
    expect(leitura.campos).toEqual({});
    expect(leitura.observacoes.join(" ")).toMatch(/CEP/);
    expect(leitura.observacoes.join(" ")).toMatch(/UF/);
    expect(leitura.observacoes.join(" ")).toMatch(/nascimento/);
  });

  it("a instrucao separa identidade de comprovante e nao usa o telefone da conta", () => {
    const instrucao = montarInstrucao("CLIENTE");
    expect(instrucao).toMatch(/comprovante/);
    expect(instrucao).toMatch(/nome de outra pessoa/);
    expect(instrucao).toMatch(/nao use/);
    expect(instrucao).not.toMatch(/conta com valores de varios meses/);
  });

  it("no processo, numero continua sendo o numero unico do CNJ", () => {
    const leitura = interpretar(
      "PROCESSO",
      JSON.stringify({ campos: { numero: campo("120") }, observacoes: [] }),
    );
    expect(leitura.campos.numero.confianca).toBe("BAIXA");
  });
});

describe("cadastro fiscal por cartao CNPJ e contrato social", () => {
  const resposta = JSON.stringify({
    campos: {
      razaoSocial: { valor: "Roma Sociedade de Advogados", confianca: "ALTA" },
      cnpj: { valor: "11.222.333/0001-81", confianca: "ALTA" },
      cep: { valor: "14840000", confianca: "ALTA" },
      cnae: { valor: "6911-7/01", confianca: "ALTA" },
      regime: { valor: "Optante pelo Simples Nacional", confianca: "ALTA" },
      // O modelo nao escolhe codigo de tabela: isto cai fora.
      codigoTributacao: { valor: "999999", confianca: "ALTA" },
      codigoMunicipio: { valor: "1234567", confianca: "ALTA" },
    },
    observacoes: [],
  });

  it("a instrucao nao pede o que o sistema deriva", () => {
    const instrucao = montarInstrucao("FISCAL");
    expect(instrucao).toContain('"cnae"');
    expect(instrucao).not.toContain('"codigoMunicipio"');
    expect(instrucao).not.toContain('"codigoTributacao"');
  });

  it("IBGE sai do CEP e o codigo do servico do CNAE", () => {
    const lida = interpretar("FISCAL", resposta);
    expect(lida.campos.codigoTributacao).toBeUndefined();
    expect(lida.campos.codigoMunicipio).toBeUndefined();
    expect(lida.campos.cep.valor).toBe("14840-000");
    expect(lida.campos.regime.valor).toBe("SIMPLES");

    const completa = completarCadastroFiscal(lida, "3518602");
    expect(completa.campos.codigoMunicipio.valor).toBe("3518602");
    expect(completa.campos.codigoTributacao.valor).toBe("171401");
    expect(completa.campos.codigoTributacao.confianca).toBe("MEDIA");
    expect(completa.observacoes.join(" ")).toContain("aliquota");
  });

  it("CNAE que nao e de advocacia fica sem codigo, e sem IBGE avisa", () => {
    const lida = interpretar(
      "FISCAL",
      JSON.stringify({ campos: { cnae: { valor: "8211-3/00" }, cep: { valor: "14840-000" } }, observacoes: [] }),
    );
    const completa = completarCadastroFiscal(lida, null);
    expect(completa.campos.codigoTributacao).toBeUndefined();
    expect(completa.campos.codigoMunicipio).toBeUndefined();
    expect(completa.observacoes.join(" ")).toContain("IBGE");
  });
});
