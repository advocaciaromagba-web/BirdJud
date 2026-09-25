// Planos de assinatura.
//
// O que se prova: o pacote sai mais barato que a soma; quem monta o proprio
// conjunto nunca paga mais do que o plano pronto que ja lhe daria aquilo; e o
// plano Completo contem mesmo tudo que a plataforma cobra — senao existiria
// um modulo que nenhum plano entrega e a tabela mentiria.
import { describe, expect, it } from "vitest";
import { FAIXAS, MODULOS } from "../src/lib/catalogo";
import { PRECO_DA_FAIXA, PRECO_DO_MODULO } from "../src/lib/precos";
import {
  contaDoPlano,
  contaMontada,
  modulosDoPlano,
  MODULOS_COBRAVEIS,
  PLANO,
  PLANOS,
  planoExato,
} from "../src/lib/planos";

describe("planos", () => {
  it("o Completo entrega todo modulo que a plataforma cobra", () => {
    const completo = new Set(modulosDoPlano("COMPLETO"));
    for (const modulo of MODULOS_COBRAVEIS) {
      expect(completo.has(modulo), `${modulo} fora do plano Completo`).toBe(true);
    }
  });

  it("cada plano contem o anterior: a escada nao tem degrau para tras", () => {
    for (let i = 1; i < PLANOS.length; i++) {
      const menor = new Set(modulosDoPlano(PLANOS[i - 1]));
      const maior = new Set(modulosDoPlano(PLANOS[i]));
      for (const modulo of menor) {
        expect(maior.has(modulo), `${modulo} sumiu no ${PLANOS[i]}`).toBe(true);
      }
    }
  });

  it("quanto mais completo, mais caro", () => {
    for (const faixa of FAIXAS) {
      const totais = PLANOS.map((plano) => contaDoPlano(plano, faixa).totalCentavos);
      for (let i = 1; i < totais.length; i++) {
        expect(totais[i]).toBeGreaterThan(totais[i - 1]);
      }
    }
  });

  it("o pacote sai mais barato que a soma dos mesmos modulos avulsos", () => {
    for (const plano of PLANOS) {
      const conta = contaDoPlano(plano, "ATE_10");
      const avulso =
        PRECO_DA_FAIXA.ATE_10 +
        modulosDoPlano(plano).reduce((t, m) => t + (PRECO_DO_MODULO[m] ?? 0), 0);
      if (PLANO[plano].descontoPorCento > 0) {
        expect(conta.totalCentavos).toBeLessThan(avulso);
      } else {
        expect(conta.totalCentavos).toBe(avulso);
      }
    }
  });

  it("quem monta o proprio conjunto nunca paga mais que o plano que o cobre", () => {
    // IA sozinha: avulsa custa 149; o Completo, com desconto, pode sair mais
    // barato — e entao e o Completo que vale, com o resto de brinde.
    for (const faixa of FAIXAS) {
      for (const plano of PLANOS) {
        const doPlano = contaDoPlano(plano, faixa);
        const montada = contaMontada(modulosDoPlano(plano), faixa);
        expect(montada.totalCentavos).toBeLessThanOrEqual(doPlano.totalCentavos);
      }
    }
  });

  it("conjunto que nenhum plano cobre e cobrado avulso", () => {
    const conta = contaMontada(["IA"], "ATE_3");
    expect(conta.totalCentavos).toBeLessThanOrEqual(
      PRECO_DA_FAIXA.ATE_3 + (PRECO_DO_MODULO.IA ?? 0)
    );
  });

  it("acrescentar modulo nunca barateia a conta montada", () => {
    const crescente = [...MODULOS_COBRAVEIS];
    let anterior = contaMontada([], "ATE_25").totalCentavos;
    const levados: typeof crescente = [];
    for (const modulo of crescente) {
      levados.push(modulo);
      const agora = contaMontada(levados, "ATE_25").totalCentavos;
      expect(agora).toBeGreaterThanOrEqual(anterior);
      anterior = agora;
    }
  });

  it("so o nucleo e o Essencial, e o conjunto completo e o Completo", () => {
    expect(planoExato([])).toBe("ESSENCIAL");
    expect(planoExato(modulosDoPlano("COMPLETO"))).toBe("COMPLETO");
    expect(planoExato(["NUCLEO", ...modulosDoPlano("AVANCADO")])).toBe("AVANCADO");
    expect(planoExato(["IA"])).toBeNull();
  });

  it("o nucleo esta em todo plano e nao e cobrado a parte", () => {
    expect(PRECO_DO_MODULO.NUCLEO).toBeUndefined();
    expect(MODULOS).toContain("NUCLEO");
    for (const plano of PLANOS) {
      expect(modulosDoPlano(plano)).not.toContain("NUCLEO");
    }
  });
});
