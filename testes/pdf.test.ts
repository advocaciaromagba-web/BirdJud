// A peca em PDF.
//
// O QUE ESTES TESTES PROTEGEM: o papel que vai para a mao do cliente. Aqui o
// erro nao da erro — ele sai impresso. Linha que passa da margem, justificado
// que estica meio palmo entre duas palavras, acento que virou quadrado, titulo
// que deixou de ser centralizado: nada disso lanca excecao, tudo isso aparece
// no documento assinado.
import { describe, expect, it } from "vitest";
import { estruturaDoDocumento, preencher } from "../src/lib/modelos";
import { LARGURA_UTIL, MARGEM, diagramar, montarPdf } from "../src/lib/pdf";
import { cepEmTexto, enderecoEmLinha } from "../src/lib/qualificacao";

/** Uma corrida de .docx, com ou sem negrito. */
function r(texto: string, negrito = false): string {
  return `<w:r>${negrito ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${texto}</w:t></w:r>`;
}
function p(alinhamento: string | null, ...corridas: string[]): string {
  const pPr = alinhamento ? `<w:pPr><w:jc w:val="${alinhamento}"/></w:pPr>` : "";
  return `<w:p>${pPr}${corridas.join("")}</w:p>`;
}
const doc = (...ps: string[]) =>
  `<?xml version="1.0"?><w:document><w:body>${ps.join("")}</w:body></w:document>`;

const CLAUSULA =
  "O CONTRATANTE pagara ao CONTRATADO, a titulo de honorarios advocaticios, " +
  "a quantia ajustada neste instrumento, que sera paga na forma e nos prazos " +
  "aqui previstos, servindo o presente como titulo executivo extrajudicial " +
  "nos termos do artigo 784, inciso III, do Codigo de Processo Civil.";

describe("ler a estrutura do documento", () => {
  it("le o alinhamento de cada paragrafo", () => {
    const ps = estruturaDoDocumento(
      doc(p("center", r("PROCURACAO")), p("both", r("Texto")), p(null, r("Fim"))),
    );
    expect(ps.map((x) => x.alinhamento)).toEqual([
      "CENTRO",
      "JUSTIFICADO",
      "ESQUERDA",
    ]);
  });

  it("le o negrito corrida por corrida, nao do paragrafo inteiro", () => {
    // "CLAUSULA PRIMEIRA" em negrito e o resto sem: marcar o paragrafo todo em
    // negrito deixaria a clausula inteira berrando na folha.
    const ps = estruturaDoDocumento(
      doc(p("both", r("CLAUSULA PRIMEIRA", true), r(" - do objeto do contrato"))),
    );
    const negritos = ps[0].pedacos.filter((x) => x.negrito).map((x) => x.texto);
    expect(negritos).toEqual(["CLAUSULA", "PRIMEIRA"]);
    expect(ps[0].pedacos.some((x) => !x.negrito && x.texto === "objeto")).toBe(true);
  });

  it("nao inventa espaco onde o Word partiu a palavra", () => {
    // O corretor ortografico do Word reparte a palavra em varias corridas. Se
    // cada corrida virasse uma palavra, "honorarios" sairia "hono rarios".
    const ps = estruturaDoDocumento(doc(p("both", r("hono"), r("rarios"), r(" devidos"))));
    expect(ps[0].pedacos.map((x) => x.texto)).toEqual(["honorarios", "devidos"]);
  });

  it("separa a palavra onde o negrito muda, e sem espaco entre as partes", () => {
    const ps = estruturaDoDocumento(doc(p("both", r("CLAUSULA", true), r(":"))));
    expect(ps[0].pedacos).toEqual([
      { texto: "CLAUSULA", negrito: true, espacos: 0 },
      { texto: ":", negrito: false, espacos: 0 },
    ]);
  });

  it("paragrafo sem texto vale uma linha em branco", () => {
    // E assim que o modelo separa as clausulas. Jogar fora juntaria o contrato
    // inteiro em um bloco so.
    const ps = estruturaDoDocumento(doc(p(null, r("Antes")), "<w:p/>", p(null, r("Depois"))));
    expect(ps.map((x) => x.vazio)).toEqual([false, true, false]);
  });
});

describe("colocar a peca na folha", () => {
  const direita = MARGEM.esquerda + LARGURA_UTIL;
  /** A direita de uma linha: onde termina o ultimo pedaco. */
  const fim = (l: { pedacos: Array<{ x: number; largura: number }> }) =>
    Math.max(...l.pedacos.map((x) => x.x + x.largura));

  it("nenhuma linha passa da margem direita", async () => {
    const { linhas } = await diagramar(
      estruturaDoDocumento(doc(p("both", r(CLAUSULA)), p("both", r(CLAUSULA)))),
    );
    expect(linhas.length).toBeGreaterThan(4);
    for (const l of linhas) {
      // Meio ponto de folga para o arredondamento da largura da fonte.
      expect(fim(l)).toBeLessThanOrEqual(direita + 0.5);
      expect(Math.min(...l.pedacos.map((x) => x.x))).toBeGreaterThanOrEqual(
        MARGEM.esquerda - 0.5,
      );
    }
  });

  it("justificado fecha na margem, menos na ultima linha do paragrafo", async () => {
    const { linhas } = await diagramar(estruturaDoDocumento(doc(p("both", r(CLAUSULA)))));
    for (const l of linhas.slice(0, -1)) {
      expect(fim(l)).toBeGreaterThan(direita - 1);
    }
    // A ultima linha fica onde o texto acaba: esticar a ultima linha de um
    // paragrafo e o erro classico de quem justifica no bracao.
    expect(fim(linhas[linhas.length - 1])).toBeLessThan(direita - 1);
  });

  it("justifica a linha que termina antes de uma palavra longa", async () => {
    // A ARMADILHA: uma linha comum de contrato que quebra antes de
    // "substabelecimento" precisa de quatro vezes o espaco normal entre as
    // palavras. Com um teto apertado ela saia alinhada a esquerda no meio de um
    // paragrafo justificado — e parecia defeito de formatacao na peca.
    const texto =
      "O total dos honorarios podera ser exigido se houver composicao, " +
      "substabelecimento ou desistencia por qualquer das partes litigantes, " +
      "dentro ou fora do processo.";
    const { linhas } = await diagramar(estruturaDoDocumento(doc(p("both", r(texto)))));
    expect(linhas.length).toBeGreaterThan(1);
    for (const l of linhas.slice(0, -1)) expect(fim(l)).toBeGreaterThan(direita - 1);
  });

  it("nao estica o justificado alem do razoavel", async () => {
    // Duas palavras esticadas de ponta a ponta da folha parecem defeito. Acima
    // do teto, alinha a esquerda.
    const enorme = "x".repeat(70);
    const { linhas } = await diagramar(
      estruturaDoDocumento(doc(p("both", r(`Item um ${enorme}`)))),
    );
    expect(linhas[0].pedacos[0].x).toBeCloseTo(MARGEM.esquerda, 5);
    expect(fim(linhas[0])).toBeLessThan(direita - 50);
  });

  it("centraliza o titulo", async () => {
    const { linhas } = await diagramar(
      estruturaDoDocumento(doc(p("center", r("INSTRUMENTO PARTICULAR DE PROCURACAO", true)))),
    );
    const sobra = direita - fim(linhas[0]);
    expect(linhas[0].pedacos[0].x - MARGEM.esquerda).toBeCloseTo(sobra, 1);
  });

  it("vira a pagina quando o texto nao cabe mais", async () => {
    const muitos = Array.from({ length: 40 }, () => p("both", r(CLAUSULA)));
    const { paginas, linhas } = await diagramar(estruturaDoDocumento(doc(...muitos)));
    expect(paginas).toBeGreaterThan(1);
    // Nenhuma linha abaixo da margem de baixo.
    for (const l of linhas) expect(l.y).toBeGreaterThanOrEqual(MARGEM.baixo);
  });

  it("reparte na forca a palavra maior que a folha, em vez de estourar a margem", async () => {
    const enorme = "a".repeat(400);
    const { linhas } = await diagramar(estruturaDoDocumento(doc(p("both", r(enorme)))));
    expect(linhas.length).toBeGreaterThan(1);
    for (const l of linhas) expect(fim(l)).toBeLessThanOrEqual(direita + 0.5);
  });

  it("escreve acento, cedilha e travessao sem reclamar", async () => {
    const { caracteresTrocados, linhas } = await diagramar(
      estruturaDoDocumento(doc(p("both", r("Declaração de hipossuficiência — ação, José, 5º")))),
    );
    expect(caracteresTrocados).toEqual([]);
    expect(linhas[0].pedacos.map((x) => x.texto).join(" ")).toContain("hipossuficiência");
  });

  it("avisa qual caractere a fonte do PDF nao escreve", async () => {
    // Texto copiado de outro programa traz caractere de outra tabela. Deixar
    // passar calado poria um quadrado no meio de uma clausula.
    const { caracteresTrocados, linhas } = await diagramar(
      estruturaDoDocumento(doc(p("both", r("prazo → 10 dias")))),
    );
    expect(caracteresTrocados).toEqual(["→"]);
    expect(linhas[0].pedacos.map((x) => x.texto)).toContain("?");
  });

  it("troca a tabulacao por espacos em vez de recusar a peca", async () => {
    const { caracteresTrocados } = await diagramar(
      estruturaDoDocumento(doc(p("both", r("Item\tvalor")))),
    );
    expect(caracteresTrocados).toEqual([]);
  });
});

describe("o arquivo PDF", () => {
  it("sai como PDF de verdade, com pelo menos uma folha", async () => {
    const pdf = await montarPdf(
      estruturaDoDocumento(doc(p("center", r("PROCURACAO", true)), p("both", r(CLAUSULA)))),
      { titulo: "Procuracao - Jose Cicero" },
    );
    expect(pdf.arquivo.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.paginas).toBe(1);
    expect(pdf.arquivo.byteLength).toBeGreaterThan(500);
  });

  it("peca vazia ainda sai com uma folha, nao com nenhuma", async () => {
    // PDF sem pagina nenhuma nao abre em visualizador algum.
    const pdf = await montarPdf([]);
    expect(pdf.paginas).toBe(1);
  });

  it("conta as folhas que a peca ocupa", async () => {
    const muitos = Array.from({ length: 40 }, () => p("both", r(CLAUSULA)));
    const pdf = await montarPdf(estruturaDoDocumento(doc(...muitos)));
    expect(pdf.paginas).toBeGreaterThan(1);
  });
});

describe("quebra de linha dentro do paragrafo", () => {
  it("as linhas de assinatura saem uma embaixo da outra", () => {
    // A ARMADILHA: o valor do campo vem com "\n" entre uma assinatura e a
    // outra. Um "\n" solto dentro de <w:t> nao quebra nada — o Word trata como
    // espaco — e os tres advogados assinariam na mesma linha, emendados.
    const xml = preencher(
      doc(p("center", r("{{advogados.assinaturas}}"))),
      {
        "advogados.assinaturas":
          "_____________\nJOSE LUCIANO\nOAB/SP 278877\n\n_____________\nANA PAULA\nOAB/BA 45678",
      },
    ).xml;
    expect(xml).toContain("<w:br/>");

    const linhas = estruturaDoDocumento(xml);
    const textos = linhas.map((l) => l.pedacos.map((x) => x.texto).join(" "));
    expect(textos).toEqual([
      "_____________",
      "JOSE LUCIANO",
      "OAB/SP 278877",
      "",
      "_____________",
      "ANA PAULA",
      "OAB/BA 45678",
    ]);
    expect(linhas.every((l) => l.alinhamento === "CENTRO")).toBe(true);
  });

  it("cada assinatura fica centralizada por si", async () => {
    const xml = preencher(doc(p("center", r("{{advogados.assinaturas}}"))), {
      "advogados.assinaturas": "_____________\nJOSE LUCIANO DA COSTA ROMA",
    }).xml;
    const { linhas } = await diagramar(estruturaDoDocumento(xml));
    expect(linhas).toHaveLength(2);
    const centro = (l: { pedacos: Array<{ x: number; largura: number }> }) => {
      const esquerda = Math.min(...l.pedacos.map((x) => x.x));
      const direitaDaLinha = Math.max(...l.pedacos.map((x) => x.x + x.largura));
      return (esquerda + direitaDaLinha) / 2;
    };
    expect(centro(linhas[0])).toBeCloseTo(centro(linhas[1]), 1);
  });
});

describe("linha de preencher a mao", () => {
  it("mantem os espacos seguidos que abrem o espaco da escrita", async () => {
    // "Nome:        CPF:" e um campo para preencher a caneta. Engolir os
    // espacos seguidos, como faz quem trata todo branco como um so, fecha o
    // espaco e o contrato sai sem onde escrever o nome da testemunha.
    const ps = estruturaDoDocumento(doc(p(null, r("Nome:          CPF:"))));
    expect(ps[0].pedacos.map((x) => x.espacos)).toEqual([0, 10]);

    const { linhas } = await diagramar(ps);
    const [nome, cpf] = linhas[0].pedacos;
    expect(cpf.x - (nome.x + nome.largura)).toBeGreaterThan(20);
  });
});

describe("o CEP na qualificacao", () => {
  it("sai como se escreve em documento, nao como esta no banco", () => {
    // O cadastro guarda so os digitos, que e o certo para buscar. Na peca, um
    // "47800000" no meio da qualificacao parece numero digitado errado.
    expect(cepEmTexto("47800000")).toBe("CEP 47800-000");
    expect(cepEmTexto("47800-000")).toBe("CEP 47800-000");
    // O que nao for um CEP sai como veio: inventar formato em cima de dado
    // torto esconde o erro de cadastro em vez de mostra-lo.
    expect(cepEmTexto("478")).toBe("478");
    expect(cepEmTexto(null)).toBe("");
  });

  it("entra na linha do endereco", () => {
    expect(
      enderecoEmLinha({
        logradouro: "Rua das Palmeiras",
        numero: "145",
        bairro: "Centro",
        cidade: "Barreiras",
        uf: "BA",
        cep: "47800000",
      }),
    ).toBe("Rua das Palmeiras, nº 145, Centro, Barreiras, BA, CEP 47800-000");
  });
});
