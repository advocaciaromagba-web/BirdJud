// Cabecalhos de seguranca: o que e fechado, e o que PRECISA ficar aberto.
//
// Em 13/10/2026 descobriu-se que "microphone=()" bloqueava toda gravacao da
// entrevista em producao, sem o navegador nem perguntar. Este teste segura
// as duas pontas: microfone so para o proprio site; camera e localizacao fechadas.
import { describe, expect, it } from "vitest";
import { CABECALHOS_DE_SEGURANCA } from "../src/lib/csp";

describe("Permissions-Policy", () => {
  const politica = new Map(CABECALHOS_DE_SEGURANCA).get("Permissions-Policy") ?? "";

  it("libera o microfone para o proprio site (a entrevista grava)", () => {
    expect(politica).toContain("microphone=(self)");
  });

  it("camera e localizacao continuam fechadas", () => {
    expect(politica).toContain("camera=()");
    expect(politica).toContain("geolocation=()");
  });
});
