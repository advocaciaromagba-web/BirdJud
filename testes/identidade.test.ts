// Identidade visual por escritorio.
//
// Dois riscos aqui, e os dois tem teste: cor que nao e cor virando CSS de
// verdade no <body>, e cor legitima que deixa o sistema ilegivel.
import { describe, expect, it } from "vitest";
import {
  CorInvalida,
  avisoSobreContraste,
  contraste,
  corDoTextoSobre,
  exigirCor,
  luminancia,
  normalizarCor,
  paletaDe,
  variaveisDaPaleta,
} from "@/lib/identidade";

describe("normalizacao da cor", () => {
  it("aceita as formas usuais e devolve sempre #RRGGBB", () => {
    expect(normalizarCor("#0b1f3b")).toBe("#0B1F3B");
    expect(normalizarCor("0B1F3B")).toBe("#0B1F3B");
    expect(normalizarCor("  #abc  ")).toBe("#AABBCC");
  });

  // O navegador nao distingue "cor" de "resto de CSS" numa propriedade
  // personalizada: sem esta recusa, o valor abaixo viraria regra de verdade.
  it("recusa qualquer coisa que nao seja hexadecimal", () => {
    for (const ruim of [
      "red",
      "rgb(0,0,0)",
      "#0B1F3B; position:fixed; inset:0",
      "var(--outra)",
      "url(http://mal.example/x.png)",
      "#12345",
      "#GGGGGG",
      "",
      "   ",
    ]) {
      expect(normalizarCor(ruim)).toBeNull();
    }
  });

  it("exigirCor levanta com mensagem util", () => {
    expect(() => exigirCor("azul", "principal")).toThrow(CorInvalida);
    expect(() => exigirCor("azul", "principal")).toThrow(/principal/);
  });
});

describe("luminancia e contraste", () => {
  it("branco e preto sao os extremos", () => {
    expect(luminancia("#FFFFFF")).toBeCloseTo(1, 5);
    expect(luminancia("#000000")).toBeCloseTo(0, 5);
    expect(contraste("#FFFFFF", "#000000")).toBeCloseTo(21, 1);
  });

  it("cor igual nao tem contraste", () => {
    expect(contraste("#123456", "#123456")).toBeCloseTo(1, 5);
  });

  // O olho enxerga muito mais o verde que o azul. Usando a media dos canais,
  // estas duas dariam quase o mesmo valor — e nao dao.
  it("pesa os canais como o olho, nao pela media", () => {
    expect(luminancia("#00FF00")).toBeGreaterThan(luminancia("#0000FF") * 5);
  });
});

describe("texto sobre a cor da marca", () => {
  it("branco sobre escuro, preto sobre claro", () => {
    expect(corDoTextoSobre("#0B1F3B")).toBe("#FFFFFF");
    expect(corDoTextoSobre("#FFE066")).toBe("#111111");
    expect(corDoTextoSobre("#FFFFFF")).toBe("#111111");
    expect(corDoTextoSobre("#000000")).toBe("#FFFFFF");
  });

  // O escritorio pode escolher amarelo. O sistema nao pode ficar ilegivel por
  // causa disso.
  it("a escolha sempre fecha contraste de leitura", () => {
    for (const cor of ["#0B1F3B", "#FFE066", "#7F7F7F", "#C9A227", "#2F5233"]) {
      expect(contraste(cor, corDoTextoSobre(cor))).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("paleta derivada", () => {
  const paleta = paletaDe("#0B1F3B", "#D4AF7C");

  it("mantem as duas cores escolhidas", () => {
    expect(paleta.primaria).toBe("#0B1F3B");
    expect(paleta.secundaria).toBe("#D4AF7C");
  });

  it("a escura e mais escura e a clara e quase branca", () => {
    expect(luminancia(paleta.primariaEscura)).toBeLessThan(
      luminancia(paleta.primaria),
    );
    expect(luminancia(paleta.primariaClara)).toBeGreaterThan(0.8);
  });

  it("recusa a paleta inteira quando uma das cores nao e cor", () => {
    expect(() => paletaDe("#0B1F3B", "javascript:alert(1)")).toThrow(CorInvalida);
    expect(() => paletaDe("nao e cor", "#D4AF7C")).toThrow(CorInvalida);
  });

  it("toda variavel gerada e uma cor hexadecimal", () => {
    for (const valor of Object.values(variaveisDaPaleta(paleta))) {
      expect(valor).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe("aviso de contraste", () => {
  // A pergunta e se a cor serve para ESCREVER sobre branco — etiqueta, link,
  // titulo. Sobre a cor, preto ou branco e escolhido automaticamente, entao
  // aquele lado nunca quebra.
  it("cala quando a cor escreve bem sobre branco", () => {
    expect(avisoSobreContraste("#0B1F3B")).toBeNull();
    expect(avisoSobreContraste("#2F5233")).toBeNull();
    expect(avisoSobreContraste("#111111")).toBeNull();
  });

  it("avisa nas cores claras, onde a etiqueta sumiria no fundo", () => {
    expect(avisoSobreContraste("#FFE066")).toContain("clara demais");
    expect(avisoSobreContraste("#D4AF7C")).toContain("clara demais");
    expect(avisoSobreContraste("#FFFFFF")).toContain("clara demais");
    expect(avisoSobreContraste("#808080")).toContain("clara demais");
  });
});
