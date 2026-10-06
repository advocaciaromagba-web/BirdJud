// Representantes legais de pessoa juridica.
//
// O QUE ESTES TESTES PROTEGEM: quem assina a procuracao e o contrato de uma
// empresa e uma PESSOA, com qualificacao propria. Errar aqui nao aparece como
// erro de sistema — aparece como peca com um socio a menos, ou procuracao
// assinada por quem nao podia.
import { describe, expect, it } from "vitest";
import {
  RepresentanteInvalido,
  ehPessoaJuridica,
  enderecoEmLinha,
  prepararRepresentantes,
  qualificacao,
} from "../src/lib/representantes";

// CPFs com digito verificador correto.
const CPF_A = "529.982.247-25";
const CPF_B = "111.444.777-35";

describe("quando a tela pede representante", () => {
  it("so para pessoa juridica", () => {
    expect(ehPessoaJuridica("11.222.333/0001-81")).toBe(true);
    expect(ehPessoaJuridica(CPF_A)).toBe(false);
    expect(ehPessoaJuridica(null)).toBe(false);
    expect(ehPessoaJuridica("")).toBe(false);
  });
});

describe("linha em branco e linha comecada", () => {
  // Formulario com tres linhas em que a pessoa preencheu duas nao pode dar
  // erro por causa da terceira.
  it("linha totalmente vazia e ignorada", () => {
    const r = prepararRepresentantes([
      { nome: "Ana Souza", cpf: CPF_A },
      {},
      { nome: "", cpf: "", email: "   " },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.nome).toBe("Ana Souza");
  });

  // Mas metade de um representante vai para a procuracao do mesmo jeito.
  it("linha comecada sem nome ou sem CPF e recusada", () => {
    expect(() => prepararRepresentantes([{ nome: "Ana Souza" }])).toThrow(
      RepresentanteInvalido,
    );
    expect(() => prepararRepresentantes([{ cpf: CPF_A }])).toThrow(
      /nome e o CPF do 1º/,
    );
    expect(() =>
      prepararRepresentantes([{ profissao: "engenheira" }]),
    ).toThrow(RepresentanteInvalido);
  });

  it("o numero na mensagem conta so as linhas que valem", () => {
    expect(() =>
      prepararRepresentantes([
        { nome: "Ana Souza", cpf: CPF_A },
        {},
        { profissao: "socio" },
      ]),
    ).toThrow(/2º representante/);
  });
});

describe("o CPF e conferido", () => {
  it("digito que nao fecha e recusado", () => {
    expect(() =>
      prepararRepresentantes([{ nome: "Ana", cpf: "111.222.333-44" }]),
    ).toThrow(/digito verificador/);
  });

  // Duas linhas com o mesmo CPF costuma ser a mesma pessoa digitada duas
  // vezes — e ela assinaria duas vezes a mesma procuracao.
  it("o mesmo CPF nao entra duas vezes, nem com mascara diferente", () => {
    expect(() =>
      prepararRepresentantes([
        { nome: "Ana", cpf: CPF_A },
        { nome: "Ana de novo", cpf: "52998224725" },
      ]),
    ).toThrow(/mais de um representante/);
  });

  it("dois representantes diferentes passam", () => {
    const r = prepararRepresentantes([
      { nome: "Ana Souza", cpf: CPF_A },
      { nome: "Bruno Lima", cpf: CPF_B },
    ]);
    expect(r.map((x) => x.ordem)).toEqual([0, 1]);
  });
});

describe("o e-mail, quando ha", () => {
  // E por ele que a assinatura eletronica chega.
  it("torto e recusado", () => {
    expect(() =>
      prepararRepresentantes([{ nome: "Ana", cpf: CPF_A, email: "nao-e-email" }]),
    ).toThrow(/e-mail do 1º/);
  });

  it("ausente nao atrapalha", () => {
    expect(prepararRepresentantes([{ nome: "Ana", cpf: CPF_A }])[0]!.email).toBeNull();
  });
});

describe("o endereco", () => {
  it("por padrao e o da empresa", () => {
    const r = prepararRepresentantes([{ nome: "Ana", cpf: CPF_A }]);
    expect(r[0]!.mesmoEnderecoDaEmpresa).toBe(true);
    expect(r[0]!.endereco).toBeNull();
  });

  // Guardar endereco proprio de quem usa o da empresa deixaria um endereco
  // antigo pendurado, pronto para sair na peca depois da mudanca de sede.
  it("endereco proprio so e guardado quando a pessoa diz que e outro", () => {
    const comum = { nome: "Ana", cpf: CPF_A, endereco: { rua: "Rua X", cidade: "Salvador" } };
    expect(prepararRepresentantes([comum])[0]!.endereco).toBeNull();
    const proprio = prepararRepresentantes([
      { ...comum, mesmoEnderecoDaEmpresa: false },
    ])[0]!;
    expect(proprio.endereco?.rua).toBe("Rua X");
  });

  it("a UF sobe para maiuscula", () => {
    const r = prepararRepresentantes([
      {
        nome: "Ana",
        cpf: CPF_A,
        mesmoEnderecoDaEmpresa: false,
        endereco: { uf: "ba" },
      },
    ]);
    expect(r[0]!.endereco?.uf).toBe("BA");
  });

  it("endereco escrito em linha nao deixa virgula sobrando", () => {
    expect(
      enderecoEmLinha({ rua: "Rua X", numero: "10", cidade: "Salvador", uf: "BA" }),
    ).toBe("Rua X, 10, Salvador, BA");
    expect(enderecoEmLinha(null)).toBe("");
    expect(enderecoEmLinha({ cidade: "Salvador" })).toBe("Salvador");
  });
});

describe("a qualificacao que entra na peca", () => {
  it("monta com o que foi preenchido", () => {
    const r = prepararRepresentantes([
      {
        nome: "Ana Souza",
        cpf: CPF_A,
        rg: "12.345.678",
        nacionalidade: "brasileira",
        estadoCivil: "casada",
        profissao: "engenheira",
      },
    ])[0]!;
    const texto = qualificacao(r, { rua: "Av. Sete", cidade: "Salvador", uf: "BA" });
    expect(texto).toBe(
      "Ana Souza, brasileira, casada, engenheira, portador do RG nº 12.345.678, " +
        "inscrito no CPF sob o nº 529.982.247-25, residente e domiciliado em " +
        "Av. Sete, Salvador, BA",
    );
  });

  // Nada de "estado civil: nao informado" numa peticao, e nada de inventar.
  it("o que nao foi preenchido simplesmente nao aparece", () => {
    const r = prepararRepresentantes([{ nome: "Ana Souza", cpf: CPF_A }])[0]!;
    const texto = qualificacao(r);
    expect(texto).toBe("Ana Souza, inscrito no CPF sob o nº 529.982.247-25");
    expect(texto).not.toContain("RG");
    expect(texto).not.toContain("null");
    expect(texto).not.toContain("undefined");
  });

  it("usa o endereco proprio quando ha um", () => {
    const r = prepararRepresentantes([
      {
        nome: "Ana",
        cpf: CPF_A,
        mesmoEnderecoDaEmpresa: false,
        endereco: { cidade: "Feira de Santana", uf: "BA" },
      },
    ])[0]!;
    expect(qualificacao(r, { cidade: "Salvador" })).toContain("Feira de Santana, BA");
  });
});

describe("CPF na qualificacao", () => {
  // Quem digitou so numeros nao pode ver "52998224725" impresso na procuracao.
  it("sai pontuado mesmo quando foi digitado sem pontos", () => {
    const texto = qualificacao({
      nome: "Ana Souza",
      cpf: "52998224725",
      rg: null,
      nacionalidade: null,
      estadoCivil: null,
      profissao: null,
      endereco: null,
      mesmoEnderecoDaEmpresa: false,
    });
    expect(texto).toBe("Ana Souza, inscrito no CPF sob o nº 529.982.247-25");
  });
});
