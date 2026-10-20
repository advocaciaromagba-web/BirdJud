// Participantes do compromisso.
//
// O QUE ESTES TESTES PROTEGEM: duas coisas que o escritorio paga caro. Avisar
// a mesma pessoa duas vezes faz quem recebe concluir que o escritorio esta
// confuso sobre a propria audiencia. E transformar testemunha em cliente
// cadastrado suja a lista de clientes para sempre — ela passa a aparecer na
// busca, na cobranca e na escolha de quem assina uma procuracao.
import { describe, expect, it } from "vitest";
import {
  MAXIMO,
  ParticipanteInvalido,
  prepararParticipantes,
  quemAvisar,
  semComoAvisar,
} from "../src/lib/participantes";

describe("quem e o participante", () => {
  it("cliente do escritório entra pelo id", () => {
    const r = prepararParticipantes([{ clienteId: "cli_1", papel: "cliente" }]);
    expect(r).toEqual([
      { clienteId: "cli_1", nome: null, telefone: null, email: null, papel: "cliente", avisar: true },
    ]);
  });

  // Testemunha e acompanhante nao viram cadastro de cliente so para receber
  // um aviso.
  it("quem não e cliente entra pelo nome e contato", () => {
    const r = prepararParticipantes([
      { nome: "Maria Testemunha", telefone: "(11) 99999-0000", papel: "testemunha" },
    ]);
    expect(r[0]).toMatchObject({
      clienteId: null,
      nome: "Maria Testemunha",
      telefone: "5511999990000",
      papel: "testemunha",
    });
  });

  it("sem cliente e sem nome e recusado", () => {
    expect(() => prepararParticipantes([{ telefone: "11999990000" }])).toThrow(
      ParticipanteInvalido,
    );
  });

  // Copiar o nome deixaria os dois diferentes no dia em que alguem corrigisse
  // o cadastro.
  it("participante que e cliente não guarda cópia do nome", () => {
    const r = prepararParticipantes([{ clienteId: "cli_1", nome: "Nome Velho" }]);
    expect(r[0].nome).toBeNull();
  });
});

describe("não avisar duas vezes", () => {
  it("o mesmo cliente não entra duas vezes", () => {
    expect(() =>
      prepararParticipantes([{ clienteId: "cli_1" }, { clienteId: "cli_1" }]),
    ).toThrow(/duas vezes/i);
  });

  // "(11) 9 9999-0000" e "11999990000" sao a mesma pessoa.
  it("o mesmo telefone escrito de dois jeitos e a mesma pessoa", () => {
    expect(() =>
      prepararParticipantes([
        { nome: "Ana", telefone: "(11) 9 9999-0000" },
        { nome: "Ana Souza", telefone: "11999990000" },
      ]),
    ).toThrow(/duas vezes/i);
  });

  it("pessoas diferentes passam", () => {
    const r = prepararParticipantes([
      { clienteId: "cli_1" },
      { nome: "Maria", telefone: "11988887777" },
      { nome: "Jose", email: "jose@exemplo.com" },
    ]);
    expect(r).toHaveLength(3);
  });
});

describe("o que e recusado", () => {
  it("telefone que não e telefone", () => {
    expect(() => prepararParticipantes([{ nome: "Ana", telefone: "123" }])).toThrow(
      /Telefone inválido/,
    );
  });

  it("e-mail que nao e e-mail", () => {
    expect(() => prepararParticipantes([{ nome: "Ana", email: "ana@" }])).toThrow(
      /E-mail inválido/,
    );
  });

  it("lista que não e lista", () => {
    expect(() => prepararParticipantes("Ana" as never)).toThrow(ParticipanteInvalido);
  });

  it("gente demais", () => {
    const muitos = Array.from({ length: MAXIMO + 1 }, (_, i) => ({ nome: `P${i}` }));
    expect(() => prepararParticipantes(muitos)).toThrow(/No máximo/);
  });

  it("vazio e lista vazia, não erro", () => {
    expect(prepararParticipantes(null)).toEqual([]);
    expect(prepararParticipantes([])).toEqual([]);
  });
});

describe("quem da para avisar", () => {
  const lista = [
    { nomeNaTela: "Ana", avisar: true, telefone: "5511999990000", email: null },
    { nomeNaTela: "Bruno", avisar: true, telefone: null, email: "b@x.com" },
    { nomeNaTela: "Carla", avisar: false, telefone: "5511988887777", email: null },
    { nomeNaTela: "Davi", avisar: true, telefone: null, email: null },
  ];

  it("quem pediu para não ser avisado fica de fora", () => {
    expect(quemAvisar(lista).map((p) => p.nome)).toEqual(["Ana", "Bruno"]);
  });

  // Avisar sem destino nao e avisar. A tela precisa poder dizer isso em vez de
  // fingir que mandou.
  it("quem não tem contato nenhum e denunciado, não esquecido", () => {
    expect(semComoAvisar(lista)).toEqual(["Davi"]);
  });
});
