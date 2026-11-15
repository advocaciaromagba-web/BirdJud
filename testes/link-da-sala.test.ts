// O link da sala de audiencia: colado de qualquer jeito, tem de abrir — e so
// endereco de verdade vira clique.
import { describe, expect, it } from "vitest";
import { linkDaSala, linkParaGravar } from "../src/lib/link-da-sala";

const url = (t: string | null) => linkDaSala(t).url;

describe("link da sala", () => {
  it("sem https:// deixava o clique dentro do próprio sistema", () => {
    expect(url("meet.google.com/abc-defg-hij")).toBe("https://meet.google.com/abc-defg-hij");
    expect(url("www.tjba.jus.br/sala/123")).toBe("https://www.tjba.jus.br/sala/123");
    expect(url("teams.microsoft.com/l/meetup-join/19%3ameeting_x?context=%7b%22Tid%22%7d")).toBe(
      "https://teams.microsoft.com/l/meetup-join/19%3ameeting_x?context=%7b%22Tid%22%7d",
    );
  });

  it("o que já está certo não muda", () => {
    expect(url("https://zoom.us/j/123456?pwd=AbC")).toBe("https://zoom.us/j/123456?pwd=AbC");
    expect(url("http://sala.tribunal.jus.br/x")).toBe("http://sala.tribunal.jus.br/x");
  });

  it("tira o que veio colado junto: espaço, ponto final, <>, texto em volta", () => {
    expect(url("  https://meet.google.com/abc-defg-hij.  ")).toBe("https://meet.google.com/abc-defg-hij");
    expect(url("<https://meet.google.com/abc>")).toBe("https://meet.google.com/abc");
    expect(url("Link: https://meet.google.com/abc")).toBe("https://meet.google.com/abc");
    expect(url("https://meet.google.com/abc (entrar 10 min antes)")).toBe("https://meet.google.com/abc");
    expect(url("Sala virtual em meet.google.com/abc, com 10 minutos de antecedência")).toBe("https://meet.google.com/abc");
  });

  it("quebra de linha do copiar-e-colar de PDF", () => {
    expect(url("https://teams.microsoft.com/l/meetup-join/\n19%3ameeting_abc")).toBe("https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc");
  });

  it("o que não é link aparece como texto, não como clique que falha", () => {
    expect(linkDaSala("sala 3 do fórum")).toEqual({ url: null, texto: "sala 3 do fórum" });
    expect(linkDaSala("fls. 12")).toEqual({ url: null, texto: "fls. 12" });
    expect(linkDaSala("")).toEqual({ url: null, texto: null });
    expect(linkDaSala(null)).toEqual({ url: null, texto: null });
  });

  it("só http e https viram clique", () => {
    for (const perigo of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", " javascript:alert(document.cookie)", "data:text/html,<script>x</script>", "file:///etc/passwd", "vbscript:x"]) {
      expect(url(perigo), perigo).toBeNull();
    }
  });

  it("grava o endereço limpo; texto que não é link fica como veio", () => {
    expect(linkParaGravar("meet.google.com/abc.")).toBe("https://meet.google.com/abc");
    expect(linkParaGravar("sala 3")).toBe("sala 3");
    expect(linkParaGravar("   ")).toBeNull();
    // Normalizar de novo o que ja foi normalizado nao muda nada.
    expect(linkParaGravar(linkParaGravar("meet.google.com/abc"))).toBe("https://meet.google.com/abc");
  });
});
