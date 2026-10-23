// Espera entre tentativas da fila (23/10/2026).
//
// O que protege: servico de fora caido (DJEN com 500) nao vira FALHOU em
// cinco minutos; a tentativa seguinte espera o tempo que o erro pediu. Erro
// comum continua com a espera crescente de sempre.
import { describe, expect, it } from "vitest";
import { FalhaTemporaria, esperaDaTentativa } from "../src/lib/fila";
import { djenIndisponivel } from "../src/lib/trabalhos";

describe("espera entre tentativas", () => {
  it("erro comum: 1, 4, 9 minutos", () => {
    expect(esperaDaTentativa(1, new Error("x"))).toBe(1);
    expect(esperaDaTentativa(2, new Error("x"))).toBe(4);
    expect(esperaDaTentativa(3, "texto")).toBe(9);
  });

  it("falha temporária: a espera que o erro pediu", () => {
    expect(esperaDaTentativa(1, new FalhaTemporaria("DJEN caiu", 90))).toBe(90);
  });

  it("reconhece o DJEN caído, e não confunde com dado errado", () => {
    expect(djenIndisponivel("O DJEN respondeu 500.")).toBe(true);
    expect(djenIndisponivel("O DJEN respondeu 503.")).toBe(true);
    expect(djenIndisponivel("fetch failed")).toBe(true);
    expect(djenIndisponivel("O DJEN respondeu 400.")).toBe(false);
    expect(djenIndisponivel("OAB inválida")).toBe(false);
  });
});
