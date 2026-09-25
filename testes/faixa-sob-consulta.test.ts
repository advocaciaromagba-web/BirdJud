// A faixa grande fica fora da vitrine.
//
// O que se prova: a tabela publica vai ate 25 advogados, mas o preco da faixa
// maior continua existindo no sistema e continua obedecendo a escada — e
// referencia interna de quem monta proposta, nao numero solto.
import { describe, expect, it } from "vitest";
import {
  FAIXAS,
  FAIXAS_PUBLICADAS,
  FAIXA_SOB_CONSULTA,
  faixaPublicada,
} from "../src/lib/catalogo";
import { contaDoPlano, PLANOS } from "../src/lib/planos";

describe("faixa sob consulta", () => {
  it("a vitrine vai ate 25 advogados", () => {
    expect(FAIXAS_PUBLICADAS).toEqual(["ATE_3", "ATE_10", "ATE_25"]);
    expect(faixaPublicada(FAIXA_SOB_CONSULTA)).toBe(false);
  });

  it("toda faixa ou e publicada ou e a de consulta — nenhuma fica esquecida", () => {
    for (const faixa of FAIXAS) {
      expect(faixaPublicada(faixa) || faixa === FAIXA_SOB_CONSULTA).toBe(true);
    }
  });

  it("a faixa de consulta mantem preco de referencia, acima da ultima publicada", () => {
    const ultima = FAIXAS_PUBLICADAS[FAIXAS_PUBLICADAS.length - 1];
    for (const plano of PLANOS) {
      expect(contaDoPlano(plano, FAIXA_SOB_CONSULTA).totalCentavos).toBeGreaterThan(
        contaDoPlano(plano, ultima).totalCentavos
      );
    }
  });
});
