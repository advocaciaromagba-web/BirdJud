// Tabela de precos da plataforma.
//
// Dois numeros amarram esta tabela, e o resto se acomoda entre eles:
//
//   R$ 199 — o piso: o sistema simples, sem IA. Abaixo disso a conta nao
//            fecha, porque o escritorio pequeno usa o mesmo servidor, o
//            mesmo banco isolado e o mesmo suporte do grande;
//   R$ 299 — o Completo para escritorio pequeno, que e o que o mercado
//            brasileiro cobra por sistema "completo" nessa faixa. Cobrar o
//            dobro por ser melhor nao vende: o escritorio compara a primeira
//            linha da tabela, nao a lista de recursos.
//
// Os cem reais entre um e outro sao curtos de proposito. Quem chega pelo piso
// e ve que a IA, a cobranca e a nota fiscal cabem em mais cem, sobe — e e no
// Completo que o produto se defende.
//
// Os numeros continuam a ser revistos quando houver custo real medido de
// servidor, IA e mensagens. Trocar aqui nao mexe em contrato ja assinado: o
// valor combinado com cada escritorio fica gravado em
// Assinatura.valorCentavos.
import type { Faixa } from "./faixas";
import type { Modulo } from "./modulos";
import { MODULO_DA_METRICA, type Metrica } from "./catalogo";
import type { Plano } from "./planos";

/**
 * Mensalidade da faixa, em centavos. Inclui o nucleo — e o plano Essencial.
 *
 * O que a faixa cobra e tamanho de escritorio, contado em advogados e em
 * equipe de apoio ativos.
 */
export const PRECO_DA_FAIXA: Record<Faixa, number> = {
  ATE_1: 19_900,
  ATE_3: 27_900,
  ATE_10: 44_900,
  ATE_25: 74_900,
  ATE_50: 109_900,
};

/**
 * Preco fechado de cada plano, por faixa, em centavos.
 *
 * Preco de pacote e numero redondo, nao conta de percentual: o escritorio
 * precisa olhar e entender. O desconto do pacote e o que sobra da soma
 * avulsa — calculado em planos.ts, mostrado na tela.
 */
export const PRECO_DO_PLANO: Record<Plano, Record<Faixa, number>> = {
  ESSENCIAL: {
    ATE_1: 19_900,
    ATE_3: 27_900,
    ATE_10: 44_900,
    ATE_25: 74_900,
    ATE_50: 109_900,
  },
  PROFISSIONAL: {
    ATE_1: 23_900,
    ATE_3: 31_900,
    ATE_10: 51_900,
    ATE_25: 84_900,
    ATE_50: 124_900,
  },
  AVANCADO: {
    ATE_1: 26_900,
    ATE_3: 35_900,
    ATE_10: 57_900,
    ATE_25: 94_900,
    ATE_50: 137_900,
  },
  COMPLETO: {
    ATE_1: 29_900,
    ATE_3: 39_900,
    ATE_10: 64_900,
    ATE_25: 104_900,
    ATE_50: 149_900,
  },
};

/**
 * Acrescimo mensal por modulo avulso na faixa menor, em centavos.
 *
 * Avulso e mais caro por modulo do que dentro do pacote — e isso e proposital
 * e visivel na tela: quem leva o conjunto paga menos por peca. Use
 * `precoDoModulo(modulo, faixa)`, nunca este mapa direto: em escritorio maior
 * o modulo custa mais, pela mesma razao que a faixa custa mais.
 */
export const PRECO_DO_MODULO: Partial<Record<Modulo, number>> = {
  PUBLICACOES_DJEN: 4_900,
  WHATSAPP: 2_900,
  EMAIL: 900,
  NFSE: 2_500,
  COBRANCAS: 1_900,
  FINANCEIRO: 1_900,
  ASSINATURA: 1_900,
  IA: 5_900,
  NUVEM: 900,
};

/**
 * Quanto o modulo acompanha o tamanho do escritorio.
 *
 * Sem isto, o modulo avulso ficaria barato demais no escritorio grande: a
 * soma avulsa passaria por baixo do plano pronto, e o pacote — que deveria
 * ser o caminho mais barato — viraria o mais caro. Como `contaMontada` sempre
 * cobra o menor dos dois, o preco de pacote da tabela deixaria de valer.
 */
export const FATOR_DA_FAIXA: Record<Faixa, number> = {
  ATE_1: 1,
  ATE_3: 1.5,
  ATE_10: 2.6,
  ATE_25: 4.4,
  ATE_50: 6.5,
};

/** O preco do modulo avulso naquela faixa, arredondado ao real. */
export function precoDoModulo(modulo: Modulo, faixa: Faixa): number {
  const base = PRECO_DO_MODULO[modulo];
  if (!base) return 0;
  return Math.round((base * FATOR_DA_FAIXA[faixa]) / 100) * 100;
}

/** Preco unitario do que passar da franquia, em centavos. */
export const PRECO_DO_EXCEDENTE: Partial<Record<Metrica, number>> = {
  WHATSAPP_MSG: 12,
  EMAIL_ENVIADO: 2,
  NFSE_EMITIDA: 90,
  // Por cobranca EMITIDA. O que o Asaas cobra por boleto/Pix pago e outra
  // conta, direto entre o escritorio e o Asaas: nao passa pela plataforma.
  COBRANCA_EMITIDA: 40,
  // Por MB guardado alem da franquia, no retrato do mes.
  ARMAZENAMENTO_MB: 1,
  OAB_MONITORADA: 490,
  // Por MILHAR de tokens. O custo do modelo hoje fica na casa de 3 centavos
  // por milhar; este numero, como toda esta tabela, e provisorio.
  IA_MIL_TOKENS: 9,
};

/**
 * Franquia mensal de cada metrica, por faixa.
 *
 * Isto nao e detalhe de faturamento: sem franquia gravada, `consumoDoMes`
 * trata o consumo como ilimitado e NADA vira excedente. Com IA a R$ 59, um
 * escritorio lendo mil documentos por mes custaria a plataforma varias vezes
 * a mensalidade — e ninguem perceberia.
 *
 * Os numeros sao por mes e crescem com a faixa, porque escritorio maior
 * consome mais do mesmo.
 */
export const FRANQUIA: Record<Metrica, Record<Faixa, number> | null> = {
  // Em milhares de tokens. Uma leitura de documento digitalizado gasta entre
  // 5 e 20; 60 mil por mes dao algo como tres a doze leituras por semana para
  // quem advoga sozinho.
  IA_MIL_TOKENS: {
    ATE_1: 60,
    ATE_3: 150,
    ATE_10: 500,
    ATE_25: 1_200,
    ATE_50: 2_400,
  },
  WHATSAPP_MSG: {
    ATE_1: 80,
    ATE_3: 200,
    ATE_10: 600,
    ATE_25: 1_500,
    ATE_50: 3_000,
  },
  EMAIL_ENVIADO: {
    ATE_1: 400,
    ATE_3: 1_000,
    ATE_10: 3_000,
    ATE_25: 8_000,
    ATE_50: 15_000,
  },
  NFSE_EMITIDA: { ATE_1: 10, ATE_3: 20, ATE_10: 60, ATE_25: 150, ATE_50: 300 },
  COBRANCA_EMITIDA: {
    ATE_1: 15,
    ATE_3: 30,
    ATE_10: 100,
    ATE_25: 250,
    ATE_50: 500,
  },
  // Uma OAB por advogado da faixa.
  OAB_MONITORADA: { ATE_1: 1, ATE_3: 3, ATE_10: 10, ATE_25: 25, ATE_50: 50 },
  // Em MB. 2 GB para quem advoga sozinho, 5 GB para o escritorio pequeno.
  ARMAZENAMENTO_MB: {
    ATE_1: 2_000,
    ATE_3: 5_000,
    ATE_10: 20_000,
    ATE_25: 50_000,
    ATE_50: 100_000,
  },
  // Metricas de acompanhamento, sem cobranca por excedente.
  REGISTROS: null,
  USUARIOS_ATIVOS: null,
};

/** A franquia do modulo naquela faixa, ou null quando a metrica nao e cobrada. */
export function franquiaDoModulo(modulo: Modulo, faixa: Faixa): number | null {
  const entrada = Object.entries(FRANQUIA).find(
    ([metrica]) => MODULO_DA_METRICA[metrica as Metrica] === modulo,
  );
  if (!entrada) return null;
  const porFaixa = entrada[1];
  return porFaixa ? porFaixa[faixa] : null;
}

export const DIAS_DE_TESTE = 14;

/**
 * Prazo minimo entre emitir a fatura e o vencimento.
 *
 * Sem isso, um escritorio cujo teste acaba depois do dia de vencimento receberia
 * a primeira fatura ja vencida — e a regua o marcaria como inadimplente no mesmo
 * instante, sem ele ter tido um dia sequer para pagar.
 */
export const PRAZO_MINIMO_DIAS = 5;

/** Dias de atraso ate cada consequencia. */
export const REGUA = {
  inadimplente: 5,
  suspenso: 15,
};

export type ItemDaFatura = {
  descricao: string;
  valorCentavos: number;
};

/** Mensalidade fixa: faixa + modulos contratados. */
export function mensalidade(faixa: Faixa, modulos: Modulo[]): ItemDaFatura[] {
  const itens: ItemDaFatura[] = [
    { descricao: `Faixa ${faixa}`, valorCentavos: PRECO_DA_FAIXA[faixa] },
  ];
  for (const modulo of modulos) {
    const preco = PRECO_DO_MODULO[modulo];
    if (preco)
      itens.push({ descricao: `Modulo ${modulo}`, valorCentavos: preco });
  }
  return itens;
}

/** Excedentes do mes, a partir do consumo ja apurado. */
export function excedentes(
  linhas: { metrica: Metrica; excedente: number }[],
): ItemDaFatura[] {
  return linhas
    .filter((linha) => linha.excedente > 0 && PRECO_DO_EXCEDENTE[linha.metrica])
    .map((linha) => ({
      descricao: `Excedente ${linha.metrica} (${linha.excedente})`,
      valorCentavos: linha.excedente * (PRECO_DO_EXCEDENTE[linha.metrica] ?? 0),
    }));
}

export function somar(itens: ItemDaFatura[]): number {
  return itens.reduce((total, item) => total + item.valorCentavos, 0);
}
