// Planos de assinatura.
//
// O que se prova: o pacote sai mais barato que a soma; quem monta o proprio
// conjunto nunca paga mais do que o plano pronto que ja lhe daria aquilo; e o
// plano Completo contem mesmo tudo que a plataforma cobra — senao existiria
// um modulo que nenhum plano entrega e a tabela mentiria.
import { describe, expect, it } from "vitest";
import { FAIXAS, LIMITES, MODULOS, rotuloDoTamanho } from "../src/lib/catalogo";
import {
  FRANQUIA,
  PRECO_DA_FAIXA,
  PRECO_DO_MODULO,
  franquiaDoModulo,
  precoDoModulo,
} from "../src/lib/precos";
import {
  contaDoPlano,
  contaMontada,
  modulosDoPlano,
  MODULOS_COBRAVEIS,
  PLANO,
  PLANOS,
  planoExato,
} from "../src/lib/planos";
import { MODULO_DA_METRICA, type Metrica } from "../src/lib/catalogo";

describe("planos", () => {
  it("o Completo entrega todo modulo que a plataforma cobra", () => {
    const completo = new Set(modulosDoPlano("COMPLETO"));
    for (const modulo of MODULOS_COBRAVEIS) {
      expect(completo.has(modulo), `${modulo} fora do plano Completo`).toBe(
        true,
      );
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
      const totais = PLANOS.map(
        (plano) => contaDoPlano(plano, faixa).totalCentavos,
      );
      for (let i = 1; i < totais.length; i++) {
        expect(totais[i]).toBeGreaterThan(totais[i - 1]);
      }
    }
  });

  it("o pacote sai mais barato que a soma dos mesmos modulos avulsos", () => {
    // Em TODA faixa. Quando os modulos nao acompanhavam o tamanho do
    // escritorio, a soma avulsa passava por baixo do pacote nas faixas
    // maiores e o preco de tabela do plano deixava de valer.
    for (const faixa of FAIXAS) {
      for (const plano of PLANOS) {
        const conta = contaDoPlano(plano, faixa);
        const avulso =
          PRECO_DA_FAIXA[faixa] +
          modulosDoPlano(plano).reduce(
            (t, m) => t + precoDoModulo(m, faixa),
            0,
          );
        if (modulosDoPlano(plano).length > 0) {
          expect(conta.totalCentavos, `${plano} em ${faixa}`).toBeLessThan(
            avulso,
          );
        } else {
          expect(conta.totalCentavos).toBe(avulso);
        }
      }
    }
  });

  it("a tabela fica presa entre o piso de 199 e o teto de 299 no solo", () => {
    // Os dois numeros que amarram o produto: R$ 199 e o sistema simples, sem
    // IA, e R$ 299 e o Completo — que e o que o mercado brasileiro cobra por
    // sistema "completo" para escritorio pequeno. Este teste nao e sobre
    // codigo: e para a tabela nao andar sozinha, aos poucos, para fora do
    // preco que se pode praticar.
    expect(contaDoPlano("ESSENCIAL", "ATE_1").totalCentavos).toBe(19_900);
    expect(contaDoPlano("COMPLETO", "ATE_1").totalCentavos).toBe(29_900);

    // E nenhum plano escapa do intervalo na faixa de entrada.
    for (const plano of PLANOS) {
      const total = contaDoPlano(plano, "ATE_1").totalCentavos;
      expect(total, plano).toBeGreaterThanOrEqual(19_900);
      expect(total, plano).toBeLessThanOrEqual(29_900);
    }
  });

  it("quem monta o proprio conjunto nunca paga mais que o plano que o cobre", () => {
    // IA sozinha: avulsa custa 59; o Completo, com desconto, pode sair mais
    // barato — e entao e o Completo que vale, com o resto de brinde.
    for (const faixa of FAIXAS) {
      for (const plano of PLANOS) {
        const doPlano = contaDoPlano(plano, faixa);
        const montada = contaMontada(modulosDoPlano(plano), faixa);
        expect(montada.totalCentavos).toBeLessThanOrEqual(
          doPlano.totalCentavos,
        );
      }
    }
  });

  it("conjunto que nenhum plano cobre e cobrado avulso", () => {
    // E pelo preco do modulo NAQUELA faixa, nao pelo preco de tabela da faixa
    // menor: no escritorio maior o modulo custa mais.
    const conta = contaMontada(["IA"], "ATE_3");
    expect(conta.totalCentavos).toBe(
      PRECO_DA_FAIXA.ATE_3 + precoDoModulo("IA", "ATE_3"),
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
    expect(planoExato(["NUCLEO", ...modulosDoPlano("AVANCADO")])).toBe(
      "AVANCADO",
    );
    expect(planoExato(["IA"])).toBeNull();
  });

  it("o nucleo esta em todo plano e nao e cobrado a parte", () => {
    expect(PRECO_DO_MODULO.NUCLEO).toBeUndefined();
    expect(MODULOS).toContain("NUCLEO");
    for (const plano of PLANOS) {
      expect(modulosDoPlano(plano)).not.toContain("NUCLEO");
    }
  });

  it("todo modulo com preco tem franquia em toda faixa", () => {
    // Franquia nula e consumo ilimitado: consumoDoMes nao gera excedente
    // nenhum. Modulo cobrado sem franquia e conta aberta para a plataforma.
    for (const modulo of MODULOS_COBRAVEIS) {
      const temMetrica = Object.values(MODULO_DA_METRICA).includes(modulo);
      if (!temMetrica) continue;
      for (const faixa of FAIXAS) {
        expect(
          franquiaDoModulo(modulo, faixa),
          `${modulo} em ${faixa}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("a franquia cresce com o tamanho do escritorio", () => {
    for (const [metrica, porFaixa] of Object.entries(FRANQUIA)) {
      if (!porFaixa) continue;
      const valores = FAIXAS.map((faixa) => porFaixa[faixa]);
      for (let i = 1; i < valores.length; i++) {
        expect(valores[i], `${metrica}`).toBeGreaterThan(valores[i - 1]);
      }
    }
    // Metrica de acompanhamento nao tem franquia — e nao e cobrada.
    const semCobranca: Metrica[] = ["REGISTROS", "USUARIOS_ATIVOS"];
    for (const metrica of semCobranca) expect(FRANQUIA[metrica]).toBeNull();
  });
});

describe("faixa de entrada", () => {
  it("o sistema comeca no advogado sozinho", () => {
    // A primeira faixa e de UM advogado, e e dela que sai o piso de R$ 199.
    // Escritorio novo entra por aqui e so sobe quando tiver gente para isso.
    const primeira = FAIXAS[0];
    expect(primeira).toBe("ATE_1");
    expect(LIMITES[primeira].advogados).toBe(1);
    expect(rotuloDoTamanho(primeira)).toBe("1 advogado");
    expect(contaDoPlano("ESSENCIAL", primeira).totalCentavos).toBe(19_900);
  });

  it("advogado sozinho tem onde por a secretaria", () => {
    // Quem advoga sozinho quase nunca trabalha sozinho: a vaga de apoio e
    // separada da de advogado, e sem ela a faixa nao serviria a ninguem.
    expect(LIMITES.ATE_1.apoio).toBeGreaterThan(0);
  });

  it("a faixa cresce em advogados e em apoio, sem degrau para tras", () => {
    for (let i = 1; i < FAIXAS.length; i++) {
      expect(LIMITES[FAIXAS[i]].advogados).toBeGreaterThan(
        LIMITES[FAIXAS[i - 1]].advogados,
      );
      expect(LIMITES[FAIXAS[i]].apoio).toBeGreaterThanOrEqual(
        LIMITES[FAIXAS[i - 1]].apoio,
      );
    }
  });

  it("o rotulo da faixa fala de tamanho, nao de plano", () => {
    // "Essencial" e "Completo" sao nomes de plano. Enquanto a faixa tambem se
    // chamava assim, a mesma palavra queria dizer duas coisas na mesma tela.
    const nomesDePlano = new Set(PLANOS.map((p) => PLANO[p].rotulo));
    for (const faixa of FAIXAS) {
      expect(
        nomesDePlano.has(LIMITES[faixa].rotulo),
        LIMITES[faixa].rotulo,
      ).toBe(false);
    }
  });
});
