// Cadastro repetido e publicacao repetida.
//
// O QUE ESTES TESTES PROTEGEM: um prazo. Juntar dois atos diferentes porque o
// texto se parecia esconde uma intimacao, e o escritorio so descobre quando o
// prazo ja passou. Deixar uma repeticao na tela custa um cartao a mais. Os
// dois erros nao tem o mesmo tamanho, e o codigo tem de tratar disso.
import { describe, expect, it } from "vitest";
import {
  CERTEZA,
  PARECIDO,
  acharRepeticoes,
  compararPublicacoes,
  conflitoDeCliente,
  contencao,
  mensagemDoConflito,
  normalizarNome,
  normalizarTexto,
  type Existente,
} from "../src/lib/duplicados";

const EXISTENTES: Existente[] = [
  { id: "c1", nome: "Jose Cicero dos Santos", documento: "529.982.247-25" },
  { id: "c2", nome: "AURORA COMERCIO LTDA", documento: "11222333000181" },
];

describe("cliente repetido", () => {
  it("nome compara sem acento, sem caixa e sem espaco a mais", () => {
    expect(normalizarNome("  José   Cícero  dos Santos ")).toBe("JOSE CICERO DOS SANTOS");
  });

  // Documento igual e a mesma pessoa, sem duvida.
  it("documento igual barra, escrito de qualquer jeito", () => {
    expect(conflitoDeCliente({ nome: "Outro Nome", documento: "52998224725" }, EXISTENTES))
      .toMatchObject({ motivo: "DOCUMENTO", existente: { id: "c1" } });
    expect(conflitoDeCliente({ nome: "X", documento: "529.982.247-25" }, EXISTENTES))
      .toMatchObject({ motivo: "DOCUMENTO" });
  });

  it("nome igual avisa, com quem ja existe", () => {
    const c = conflitoDeCliente({ nome: "jose cicero DOS santos" }, EXISTENTES)!;
    expect(c.motivo).toBe("NOME");
    expect(mensagemDoConflito(c)).toContain("confirme para cadastrar assim mesmo");
  });

  // Num sistema de muitos escritorios ha bancas com milhares de clientes, e
  // dois "Jose Silva" diferentes sao questao de tempo.
  it("a mensagem de nome mostra o documento de quem ja existe, para dar como decidir", () => {
    const c = conflitoDeCliente({ nome: "AURORA COMERCIO LTDA" }, EXISTENTES)!;
    expect(mensagemDoConflito(c)).toContain("11222333000181");
  });

  it("documento ganha de nome quando os dois batem", () => {
    expect(
      conflitoDeCliente(
        { nome: "Jose Cicero dos Santos", documento: "52998224725" },
        EXISTENTES,
      )!.motivo,
    ).toBe("DOCUMENTO");
  });

  it("gente diferente passa", () => {
    expect(conflitoDeCliente({ nome: "Maria Souza", documento: "11144477735" }, EXISTENTES)).toBeNull();
    expect(conflitoDeCliente({ nome: "Maria Souza" }, EXISTENTES)).toBeNull();
  });

  it("sem documento no cadastro existente, documento novo nao casa com nada", () => {
    const semDoc: Existente[] = [{ id: "c9", nome: "Alguem", documento: null }];
    expect(conflitoDeCliente({ nome: "Outro", documento: "52998224725" }, semDoc)).toBeNull();
  });
});

describe("contencao", () => {
  // O mesmo ato com cabecalho a mais tem textos de tamanhos bem diferentes, e
  // qualquer medida simetrica diria que sao pouco parecidos — justamente no
  // caso que mais importa pegar.
  it("mede quanto do menor esta no maior", () => {
    expect(contencao("a b c", "a b c")).toBe(1);
    expect(contencao("a b c", "cabecalho a b c rodape")).toBe(1);
    expect(contencao("a b c d", "a b")).toBe(1);
    expect(contencao("a b c d", "a x y z")).toBe(0.25);
    expect(contencao("", "a b")).toBe(0);
  });

  it("texto normaliza tirando marcacao, acento e pontuacao", () => {
    expect(normalizarTexto("<p>Intime-se o <b>Réu</b>.</p>")).toBe("intime se o reu");
  });
});

const PUB = (over: Partial<{ id: string; numeroProcesso: string | null; dia: string; texto: string }> = {}) => ({
  id: "p1",
  numeroProcesso: "1000123-45.2026.8.26.0100",
  dia: "2026-10-01",
  texto: "Intimem-se as partes para manifestacao no prazo de 15 dias, nos termos do artigo 437 do CPC.",
  ...over,
});

describe("publicacao repetida", () => {
  // O mesmo despacho publicado uma vez por parte: texto igual, so muda o
  // "Intimado(s)" do fim. Cada uma vem com id proprio do diario.
  it("mesmo despacho por parte e repeticao", () => {
    const a = PUB();
    const b = PUB({
      id: "p2",
      texto: a.texto + " Intimado(s): ANA SOUZA, advogada OAB/SP 111.111.",
    });
    const r = compararPublicacoes(a, b);
    expect(r.veredito).toBe("REPETIDA");
    expect(r.contencao).toBeGreaterThanOrEqual(CERTEZA);
  });

  it("processo diferente nunca e repeticao, por mais parecido que seja", () => {
    const a = PUB();
    const b = PUB({ id: "p2", numeroProcesso: "9999999-99.2026.8.26.0100" });
    expect(compararPublicacoes(a, b).veredito).toBe("DIFERENTE");
  });

  // Sem o processo, dois textos parecidos podem ser dois despachos padrao de
  // processos que nada tem a ver.
  it("publicacao sem processo nao se compara com nada", () => {
    expect(compararPublicacoes(PUB({ numeroProcesso: null }), PUB({ id: "p2" })).veredito).toBe(
      "DIFERENTE",
    );
  });

  it("longe no tempo nao e repeticao", () => {
    expect(
      compararPublicacoes(PUB(), PUB({ id: "p2", dia: "2026-10-20" })).veredito,
    ).toBe("DIFERENTE");
    // Dentro da janela, o mesmo texto e repeticao.
    expect(
      compararPublicacoes(PUB(), PUB({ id: "p2", dia: "2026-10-03" })).veredito,
    ).toBe("REPETIDA");
  });

  // Na duvida, NAO e duplicata: a faixa do meio fica visivel para uma pessoa
  // decidir, em vez de sumir sozinha da tela.
  it("a faixa do meio nao decide sozinha", () => {
    const a = PUB({ texto: "um dois tres quatro cinco seis sete oito nove dez" });
    const b = PUB({ id: "p2", texto: "um dois tres quatro cinco seis sete xxx yyy zzz" });
    const r = compararPublicacoes(a, b);
    expect(r.contencao).toBeGreaterThanOrEqual(PARECIDO);
    expect(r.contencao).toBeLessThan(CERTEZA);
    expect(r.veredito).toBe("PARECE_REPETIDA");
  });

  it("texto bem diferente e diferente", () => {
    expect(
      compararPublicacoes(PUB(), PUB({ id: "p2", texto: "Designo audiencia de conciliacao para o dia 20." }))
        .veredito,
    ).toBe("DIFERENTE");
  });
});

describe("achar as repeticoes de um lote", () => {
  // A primeira e a que fica: ja pode ter sido lida, vinculada a um processo ou
  // virado prazo. Apontar para a mais nova faria o trabalho ja feito sumir.
  it("aponta sempre para a mais antiga", () => {
    const base = PUB().texto;
    const lote = [
      PUB({ id: "nova", dia: "2026-10-03", texto: `${base} Intimado(s): B.` }),
      PUB({ id: "velha", dia: "2026-10-01", texto: base }),
      PUB({ id: "media", dia: "2026-10-02", texto: `${base} Intimado(s): A.` }),
    ];
    const r = acharRepeticoes(lote);
    expect(r.map((m) => m.id).sort()).toEqual(["media", "nova"]);
    expect(r.every((m) => m.duplicataDe === "velha")).toBe(true);
  });

  it("ato diferente no mesmo processo nao e marcado", () => {
    const r = acharRepeticoes([
      PUB({ id: "a" }),
      PUB({ id: "b", dia: "2026-10-02", texto: "Designo pericia medica para 10 de novembro." }),
    ]);
    expect(r).toEqual([]);
  });

  it("lote sem nada repetido nao marca nada", () => {
    expect(acharRepeticoes([PUB()])).toEqual([]);
    expect(acharRepeticoes([])).toEqual([]);
  });
});
