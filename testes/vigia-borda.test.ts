// O 429 da borda da Railway nao vira "fora do ar" (10/11/2026).
import { describe, expect, it } from "vitest";
import { enderecoInterno, soLimiteDaBorda } from "../src/lib/vigia-borda";

describe("limite da borda", () => {
  it("só 429 em todas as tentativas é limite da borda", () => {
    expect(soLimiteDaBorda(["tentativa 1: HTTP 429", "tentativa 2: HTTP 429", "tentativa 3: HTTP 429"])).toBe(true);
    expect(soLimiteDaBorda(["tentativa 1: HTTP 429", "tentativa 2: HTTP 502", "tentativa 3: HTTP 429"])).toBe(false);
    expect(soLimiteDaBorda(["tentativa 1: sem resposta em 15000 ms"])).toBe(false);
    expect(soLimiteDaBorda([])).toBe(false);
  });

  it("endereço interno pela rede privada, com troca por variável", () => {
    expect(enderecoInterno({})).toBe("http://aplicacao.railway.internal:8080/api/saude");
    expect(enderecoInterno({ APLICACAO_INTERNA: "app.railway.internal" })).toBe("http://app.railway.internal:8080/api/saude");
    expect(enderecoInterno({ VIGIA_ENDERECO_INTERNO: "http://x:1/s" })).toBe("http://x:1/s");
  });
});
