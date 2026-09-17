// Tabela de precos da plataforma.
//
// ATENCAO: os valores abaixo sao PROVISORIOS. O plano de projeto e explicito
// em que eles so podem ser fechados depois de levantar os custos reais de
// servidor, IA, mensagens e e-mail, e de conferir os precos dos concorrentes.
// Trocar aqui nao mexe em contrato ja assinado: o valor combinado com cada
// escritorio fica gravado em Assinatura.valorCentavos.
import type { Faixa } from "./faixas";
import type { Modulo } from "./modulos";
import type { Metrica } from "./consumo";

/** Mensalidade da faixa, em centavos. Inclui o nucleo. */
export const PRECO_DA_FAIXA: Record<Faixa, number> = {
  ATE_3: 29_900,
  ATE_10: 59_900,
  ATE_25: 119_900,
  ATE_50: 199_900,
};

/** Acrescimo mensal por modulo contratado, em centavos. */
export const PRECO_DO_MODULO: Partial<Record<Modulo, number>> = {
  PUBLICACOES_DJEN: 9_900,
  PUBLICACOES_AASP: 4_900,
  WHATSAPP: 7_900,
  EMAIL: 2_900,
  NFSE: 4_900,
  COBRANCAS: 4_900,
  FINANCEIRO: 3_900,
  ASSINATURA: 3_900,
  IA: 14_900,
  NUVEM: 1_900,
};

/** Preco unitario do que passar da franquia, em centavos. */
export const PRECO_DO_EXCEDENTE: Partial<Record<Metrica, number>> = {
  WHATSAPP_MSG: 12,
  EMAIL_ENVIADO: 2,
  NFSE_EMITIDA: 90,
  OAB_MONITORADA: 490,
  IA_TOKENS: 1,
};

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
    if (preco) itens.push({ descricao: `Modulo ${modulo}`, valorCentavos: preco });
  }
  return itens;
}

/** Excedentes do mes, a partir do consumo ja apurado. */
export function excedentes(
  linhas: { metrica: Metrica; excedente: number }[]
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
