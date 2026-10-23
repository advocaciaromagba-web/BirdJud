// Planos de assinatura.
//
// A regra comercial em uma frase: o escritorio monta o que quer, e nunca paga
// mais do que o plano pronto que ja lhe daria aquilo.
//
// Por que existe plano pronto se da para montar? Porque escolher entre nove
// modulos e trabalho, e porque o pacote sai mais barato que a soma — e esse
// desconto e o que paga a escolha de levar o conjunto.
//
// ATENCAO: como a tabela de precos, os descontos aqui sao PROVISORIOS ate o
// levantamento de custo real. O valor fechado com cada escritorio fica
// gravado em Assinatura.valorCentavos: mexer aqui nao altera contrato
// assinado.
//
// So constantes e funcoes puras. NAO importar Prisma: este arquivo e usado
// tambem pela tela de simulacao, no navegador.
import { MODULOS, type Faixa, type Modulo, LIMITES } from "./catalogo";
import {
  PRECO_DO_MODULO,
  TABELA_PADRAO,
  precoDoModulo,
  type TabelaDePrecos,
} from "./precos";

export const PLANOS = [
  "ESSENCIAL",
  "PROFISSIONAL",
  "AVANCADO",
  "COMPLETO",
] as const;
export type Plano = (typeof PLANOS)[number];

export type DescricaoDoPlano = {
  rotulo: string;
  chamada: string;
  /** Modulos alem do nucleo. O nucleo esta em todo plano. */
  modulos: Modulo[];
};

export const PLANO: Record<Plano, DescricaoDoPlano> = {
  ESSENCIAL: {
    rotulo: "Essencial",
    chamada:
      "O escritório organizado: clientes, processos, agenda e prazos. Cadastro preenchido a mão.",
    modulos: [],
  },
  PROFISSIONAL: {
    rotulo: "Profissional",
    chamada:
      "O dia a dia do contencioso: publicações do DJEN chegando sozinhas, arquivos do escritório e aviso por e-mail.",
    modulos: ["PUBLICACOES_DJEN", "NUVEM", "EMAIL"],
  },
  AVANCADO: {
    rotulo: "Avançado",
    chamada:
      "O escritório inteiro, inclusive o caixa: cobrança com boleto e Pix, nota fiscal de serviço e financeiro.",
    modulos: [
      "PUBLICACOES_DJEN",
      "NUVEM",
      "EMAIL",
      "COBRANCAS",
      "FINANCEIRO",
      "NFSE",
    ],
  },
  COMPLETO: {
    rotulo: "Completo",
    chamada:
      "Tudo que o sistema faz, com inteligência artificial lendo documento, resumindo publicação e rascunhando peça, e aviso por WhatsApp.",
    modulos: [
      "PUBLICACOES_DJEN",
      "NUVEM",
      "EMAIL",
      "COBRANCAS",
      "FINANCEIRO",
      "NFSE",
      "IA",
      "WHATSAPP",
      "ASSINATURA",
    ],
  },
};

/** Todo modulo que tem preco — o que o plano Completo precisa conter. */
export const MODULOS_COBRAVEIS: Modulo[] = MODULOS.filter(
  (modulo) => (PRECO_DO_MODULO[modulo] ?? 0) > 0,
);

export type Conta = {
  faixa: Faixa;
  /** Mensalidade da faixa, que ja inclui o nucleo. */
  faixaCentavos: number;
  modulos: { modulo: Modulo; valorCentavos: number }[];
  /** Soma dos modulos antes do desconto. */
  modulosCentavos: number;
  descontoCentavos: number;
  totalCentavos: number;
  /** O plano pronto que esta conta usou, quando usou. */
  plano: Plano | null;
};

function somaDos(modulos: Modulo[], faixa: Faixa, tabela: TabelaDePrecos): number {
  return modulos.reduce(
    (total, modulo) => total + precoDoModulo(modulo, faixa, tabela),
    0,
  );
}

/** O conjunto de modulos de um plano, sem repetidos e sem o nucleo. */
export function modulosDoPlano(plano: Plano): Modulo[] {
  return [...new Set(PLANO[plano].modulos)];
}

export function contaDoPlano(plano: Plano, faixa: Faixa, tabela: TabelaDePrecos = TABELA_PADRAO): Conta {
  const modulos = modulosDoPlano(plano);
  const modulosCentavos = somaDos(modulos, faixa, tabela);
  const total = tabela.plano[plano][faixa];

  // O preco do pacote e fechado na tabela, e o desconto e o que ele economiza
  // em relacao a comprar os mesmos modulos avulsos. Nessa ordem, e nao ao
  // contrario: pacote se anuncia por numero redondo, nao por percentual.
  return {
    faixa,
    faixaCentavos: tabela.faixa[faixa],
    modulos: modulos.map((modulo) => ({
      modulo,
      valorCentavos: precoDoModulo(modulo, faixa, tabela),
    })),
    modulosCentavos,
    descontoCentavos: Math.max(
      0,
      tabela.faixa[faixa] + modulosCentavos - total,
    ),
    totalCentavos: total,
    plano,
  };
}

/** Os planos prontos que contem todos estes modulos, do mais barato ao mais caro. */
function planosQueCobrem(modulos: Modulo[], faixa: Faixa, tabela: TabelaDePrecos): Plano[] {
  const pedidos = new Set(modulos);
  return PLANOS.filter((plano) => {
    const doPlano = new Set(modulosDoPlano(plano));
    return [...pedidos].every((modulo) => doPlano.has(modulo));
  }).sort(
    (a, b) =>
      contaDoPlano(a, faixa, tabela).totalCentavos -
      contaDoPlano(b, faixa, tabela).totalCentavos,
  );
}

/**
 * A conta de um conjunto montado pelo escritorio.
 *
 * Se algum plano pronto contem tudo que foi pedido e sai mais barato que a
 * soma avulsa, e esse plano que vale — e o escritorio leva os modulos a mais
 * de brinde. Cobrar a soma quando existe pacote mais barato cobrindo o mesmo
 * seria ganhar do cliente por ele nao conhecer a tabela.
 */
export function contaMontada(modulos: Modulo[], faixa: Faixa, tabela: TabelaDePrecos = TABELA_PADRAO): Conta {
  const pedidos = [...new Set(modulos)].filter((modulo) => modulo !== "NUCLEO");
  const avulso: Conta = {
    faixa,
    faixaCentavos: tabela.faixa[faixa],
    modulos: pedidos.map((modulo) => ({
      modulo,
      valorCentavos: precoDoModulo(modulo, faixa, tabela),
    })),
    modulosCentavos: somaDos(pedidos, faixa, tabela),
    descontoCentavos: 0,
    totalCentavos: tabela.faixa[faixa] + somaDos(pedidos, faixa, tabela),
    plano: null,
  };

  const melhor = planosQueCobrem(pedidos, faixa, tabela)[0];
  if (!melhor) return avulso;

  const doPlano = contaDoPlano(melhor, faixa, tabela);
  return doPlano.totalCentavos < avulso.totalCentavos ? doPlano : avulso;
}

/** O plano cujo conjunto de modulos e exatamente este. */
export function planoExato(modulos: Modulo[]): Plano | null {
  const pedidos = new Set<Modulo>(
    modulos.filter((modulo) => modulo !== "NUCLEO"),
  );
  return (
    PLANOS.find((plano) => {
      const doPlano = modulosDoPlano(plano);
      return (
        doPlano.length === pedidos.size &&
        doPlano.every((modulo) => pedidos.has(modulo))
      );
    }) ?? null
  );
}

export function ehPlano(valor: string): valor is Plano {
  return (PLANOS as readonly string[]).includes(valor);
}

/** Quanto o pacote economiza em relacao a comprar modulo a modulo. */
export function economiaDoPlano(plano: Plano, faixa: Faixa, tabela: TabelaDePrecos = TABELA_PADRAO): number {
  return contaDoPlano(plano, faixa, tabela).descontoCentavos;
}

export function rotuloDaFaixa(faixa: Faixa): string {
  return LIMITES[faixa].rotulo;
}
