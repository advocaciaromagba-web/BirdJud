// O dominio da plataforma.
//
// O que se prova: variavel VAZIA cai no padrao. Nao e teste de estilo — com
// `??`, variavel vazia passa direto, e foi assim que o robots.txt publicado
// saiu anunciando "Sitemap: https:///sitemap.xml", sem dominio no meio.
import { afterEach, describe, expect, it } from "vitest";
import { dominioDaPlataforma, DOMINIO_PADRAO } from "../src/lib/dominio";
import { slugDoHost } from "../src/lib/subdominio";

const original = process.env.DOMINIO_PLATAFORMA;

afterEach(() => {
  if (original === undefined) delete process.env.DOMINIO_PLATAFORMA;
  else process.env.DOMINIO_PLATAFORMA = original;
});

describe("dominio da plataforma", () => {
  it("variavel vazia cai no padrao", () => {
    process.env.DOMINIO_PLATAFORMA = "";
    expect(dominioDaPlataforma()).toBe(DOMINIO_PADRAO);
  });

  it("variavel so com espacos tambem cai no padrao", () => {
    process.env.DOMINIO_PLATAFORMA = "   ";
    expect(dominioDaPlataforma()).toBe(DOMINIO_PADRAO);
  });

  it("variavel ausente cai no padrao", () => {
    delete process.env.DOMINIO_PLATAFORMA;
    expect(dominioDaPlataforma()).toBe(DOMINIO_PADRAO);
  });

  it("valor definido manda, sem espaco em volta", () => {
    process.env.DOMINIO_PLATAFORMA = "  outro.com.br  ";
    expect(dominioDaPlataforma()).toBe("outro.com.br");
  });

  it("o resolvedor de subdominio tambem nao se perde com valor vazio", () => {
    process.env.DOMINIO_PLATAFORMA = "";
    expect(slugDoHost("escritorio.birdjud.com.br")).toBe("escritorio");
    expect(slugDoHost("app.birdjud.com.br")).toBeNull();
  });
});
