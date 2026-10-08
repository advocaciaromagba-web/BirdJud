/**
 * A regra da entrevista de triagem.
 *
 * O que estes casos protegem: tela de roteiro nunca vazia, repetida nao
 * passar, e transcricao curta nao virar chamada paga que a IA preencheria
 * inventando.
 */
import { describe, expect, it } from "vitest";
import {
  MAXIMO_DE_PERGUNTAS,
  MINIMO_DA_TRANSCRICAO,
  ROTEIRO_BASICO,
  SITUACOES,
  TranscricaoCurta,
  arrumarRoteiro,
  situacaoDe,
  urgenciaDe,
} from "../src/lib/entrevista";

describe("roteiro de perguntas", () => {
  it("tira vazio, espaco repetido e corta no teto", () => {
    const bruto = [
      "  Quando   aconteceu?  ",
      "",
      "   ",
      ...Array.from({ length: 30 }, (_, i) => `Pergunta ${i}`),
    ];
    const limpo = arrumarRoteiro(bruto);
    expect(limpo[0]).toBe("Quando aconteceu?");
    expect(limpo.length).toBe(MAXIMO_DE_PERGUNTAS);
  });

  it("considera repetida a mesma pergunta com outra pontuacao ou caixa", () => {
    const limpo = arrumarRoteiro([
      "Quando aconteceu?",
      "QUANDO ACONTECEU",
      "quando aconteceu...",
      "Quem presenciou?",
    ]);
    expect(limpo).toEqual(["Quando aconteceu?", "Quem presenciou?"]);
  });

  it("nunca devolve lista vazia: a tela sem roteiro nao serve a ninguem", () => {
    expect(arrumarRoteiro([])).toEqual([...ROTEIRO_BASICO]);
    expect(arrumarRoteiro(null)).toEqual([...ROTEIRO_BASICO]);
    expect(arrumarRoteiro(["", "   "])).toEqual([...ROTEIRO_BASICO]);
    expect(arrumarRoteiro([1, 2, {}])).toEqual([...ROTEIRO_BASICO]);
  });

  it("o roteiro basico cobre data, documento, testemunha e prazo", () => {
    const tudo = ROTEIRO_BASICO.join(" ").toLowerCase();
    expect(tudo).toContain("quando");
    expect(tudo).toContain("documento");
    expect(tudo).toContain("presenciou");
    expect(tudo).toContain("prazo");
  });
});

describe("situacao da entrevista", () => {
  it("segue o que a entrevista tem, e nao o que alguem gravou", () => {
    expect(situacaoDe({})).toBe("RASCUNHO");
    expect(situacaoDe({ roteiro: ["a"] })).toBe("ROTEIRO");
    expect(situacaoDe({ roteiro: ["a"], transcricao: "contou tudo" })).toBe(
      "ANOTADA",
    );
    expect(
      situacaoDe({ transcricao: "contou tudo", analise: { area: "x" } }),
    ).toBe("ANALISADA");
  });

  it("roteiro vazio nao conta como roteiro", () => {
    expect(situacaoDe({ roteiro: [] })).toBe("RASCUNHO");
  });

  it("anotacao so com espaco nao conta como anotada", () => {
    expect(situacaoDe({ roteiro: ["a"], transcricao: "   " })).toBe("ROTEIRO");
  });

  it("arquivada vence tudo", () => {
    expect(
      situacaoDe({
        roteiro: ["a"],
        transcricao: "x",
        analise: {},
        arquivadaEm: new Date(),
      }),
    ).toBe("ARQUIVADA");
  });

  it("toda situacao devolvida existe na lista", () => {
    for (const caso of [
      {},
      { roteiro: ["a"] },
      { transcricao: "x" },
      { analise: {} },
      { arquivadaEm: new Date() },
    ]) {
      expect(SITUACOES).toContain(situacaoDe(caso));
    }
  });
});

describe("urgencia", () => {
  it("aceita as quatro e cai em MEDIA no resto", () => {
    expect(urgenciaDe("URGENTE")).toBe("URGENTE");
    expect(urgenciaDe("BAIXA")).toBe("BAIXA");
    expect(urgenciaDe("altissima")).toBe("MEDIA");
    expect(urgenciaDe(null)).toBe("MEDIA");
    expect(urgenciaDe(7)).toBe("MEDIA");
  });
});

describe("anotacao curta", () => {
  it("o erro diz o tamanho e o minimo, porque quem le precisa saber o quanto falta", () => {
    const erro = new TranscricaoCurta(40);
    expect(erro.status).toBe(422);
    expect(erro.message).toContain("40");
    expect(erro.message).toContain(String(MINIMO_DA_TRANSCRICAO));
  });
});
