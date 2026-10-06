// Honorarios: o contrato que vira cobranca.
//
// Quando o contrato ja diz valor, forma e quantas parcelas, nao ha nada para
// alguem digitar todo mes — e digitar todo mes e onde nasce a parcela
// esquecida e a parcela em dobro. Aqui so se calcula: o plano de parcelas, a
// proxima que falta e se ela ja chegou perto do vencimento.
//
// Nada neste arquivo toca banco nem provedor. Por isso da para testar cada
// regra sozinha, que e o que se quer de um modulo que decide valor a cobrar.

/** Dinheiro em centavos, sempre. Nenhuma conta de honorario em ponto flutuante. */
export const TIPOS = ["VALOR", "PERCENTUAL", "MISTO"] as const;
export type TipoDeHonorario = (typeof TIPOS)[number];

/** Quantos dias antes do vencimento a parcela seguinte e emitida. */
export const ANTECEDENCIA_DIAS = 10;

/** Teto de parcelas. Acima disso quase sempre e erro de digitacao. */
export const MAXIMO_DE_PARCELAS = 60;

export type Contrato = {
  tipo: TipoDeHonorario;
  /** Parte fixa, em centavos. Entrada, no MISTO. */
  valorCentavos: number | null;
  /** Percentual de exito em centesimos: 30% = 3000. */
  percentualBp: number | null;
  parcelas: number;
  /** Dia do primeiro vencimento, "AAAA-MM-DD". */
  primeiroVencimento: string | null;
  descricao: string | null;
  ativo: boolean;
};

export type Parcela = {
  numero: number;
  total: number;
  valorCentavos: number;
  /** "AAAA-MM-DD". */
  vencimento: string;
  descricao: string;
};

export type Plano =
  | { emiteSozinho: false; motivo: string; parcelas: [] }
  | { emiteSozinho: true; motivo: null; parcelas: Parcela[] };

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * O mesmo dia do mes, N meses adiante, preso ao ultimo dia do mes curto.
 *
 * Somar 30 dias a cada parcela — o jeito obvio — faz o vencimento andar para
 * tras: dia 31/01 vira 02/03, depois 01/04. Quem contratou "todo dia 10"
 * espera dia 10. Fevereiro e quem obriga o limite: 31/01 + 1 mes e 28/02,
 * nao 03/03.
 */
export function mesesAdiante(diaISO: string, meses: number): string {
  const [a, m, d] = diaISO.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

/**
 * Divide o total em N parcelas inteiras em centavos.
 *
 * A sobra vai na ULTIMA: 100,00 em 3 da 33,33 + 33,33 + 33,34. A soma das
 * parcelas tem de bater com o total ate o ultimo centavo — se nao bater, o
 * cliente paga a mais ou a menos e ninguem percebe.
 */
export function dividir(totalCentavos: number, quantidade: number): number[] {
  const porParcela = Math.floor(totalCentavos / quantidade);
  const partes = Array.from({ length: quantidade }, () => porParcela);
  partes[quantidade - 1] = totalCentavos - porParcela * (quantidade - 1);
  return partes;
}

/**
 * Monta as parcelas do contrato, ou diz por que nao monta.
 *
 * PERCENTUAL nao gera parcela: o valor so existe quando a acao termina, e
 * quanto e depende do resultado. MISTO gera so a entrada, pela mesma razao —
 * o exito vira cobranca a mao, na hora certa.
 */
export function planoDoContrato(contrato: Contrato): Plano {
  const recusa = (motivo: string): Plano => ({ emiteSozinho: false, motivo, parcelas: [] });

  if (!contrato.ativo) return recusa("O contrato esta encerrado.");
  if (contrato.tipo === "PERCENTUAL") {
    return recusa("Honorario so por exito nao tem parcela fixa: a cobranca sai quando a acao terminar.");
  }

  const total = contrato.valorCentavos ?? 0;
  if (total <= 0) return recusa("O contrato esta sem valor.");

  const quantidade = Math.round(contrato.parcelas);
  if (!Number.isFinite(quantidade) || quantidade < 1) return recusa("O contrato nao diz em quantas parcelas.");
  if (quantidade > MAXIMO_DE_PARCELAS) {
    return recusa(`Mais de ${MAXIMO_DE_PARCELAS} parcelas: confira o contrato.`);
  }
  if (quantidade > total) {
    // 10 parcelas de R$ 0,50 ate existem; 200 parcelas de R$ 1,00 total nao.
    return recusa("Sao mais parcelas que centavos: o valor ou a quantidade esta errada.");
  }

  const primeiro = contrato.primeiroVencimento;
  if (!primeiro || !DIA.test(primeiro)) return recusa("Falta a data do primeiro vencimento.");

  const base = contrato.descricao?.trim()
    ? `Honorarios advocaticios — ${contrato.descricao.trim()}`
    : "Honorarios advocaticios";
  const rotulo = contrato.tipo === "MISTO" ? `${base} (entrada)` : base;

  const valores = dividir(total, quantidade);
  const parcelas = valores.map((valorCentavos, i) => ({
    numero: i + 1,
    total: quantidade,
    valorCentavos,
    vencimento: mesesAdiante(primeiro, i),
    descricao: quantidade > 1 ? `${rotulo} — parcela ${i + 1}/${quantidade}` : rotulo,
  }));

  return { emiteSozinho: true, motivo: null, parcelas };
}

/** A primeira parcela do plano que ainda nao virou cobranca. */
export function proximaParcela(plano: Plano, jaGeradas: number[]): Parcela | null {
  if (!plano.emiteSozinho) return null;
  const feitas = new Set(jaGeradas);
  return plano.parcelas.find((p) => !feitas.has(p.numero)) ?? null;
}

/**
 * A parcela ja entrou na janela de emissao?
 *
 * Uma parcela por vez, perto do vencimento, e nao as doze de uma so: assim da
 * para corrigir valor ou encerrar o contrato no meio sem deixar boleto vivo na
 * rua, que e cobranca que o escritorio nao consegue mais desfazer sozinho.
 */
export function naJanela(
  vencimentoISO: string,
  hojeISO: string,
  antecedencia = ANTECEDENCIA_DIAS,
): boolean {
  const limite = new Date(`${hojeISO}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + antecedencia);
  return vencimentoISO <= limite.toISOString().slice(0, 10);
}

/**
 * O vencimento ja passou?
 *
 * Parcela atrasada nao sai sozinha. O provedor recusa boleto com vencimento no
 * passado, e emitir com a data de hoje mudaria caladamente o que o contrato
 * diz. Entao ela fica na tela, dizendo que atrasou, e quem olha decide com que
 * data cobrar.
 */
export function vencida(vencimentoISO: string, hojeISO: string): boolean {
  return vencimentoISO < hojeISO;
}

/** O que falta no cadastro do cliente para a cobranca sair no provedor. */
export function impedimentos(cliente: { nome: string; documento: string | null }): string[] {
  const faltas: string[] = [];
  if (!cliente.nome?.trim()) faltas.push("cliente sem nome");
  const doc = (cliente.documento ?? "").replace(/\D/g, "");
  if (doc.length !== 11 && doc.length !== 14) faltas.push("cliente sem CPF ou CNPJ valido");
  return faltas;
}

/** Como o percentual aparece na tela: 3000 -> "30%", 1250 -> "12,5%". */
export function percentualEmTexto(bp: number): string {
  return `${(bp / 100).toFixed(2).replace(/\.?0+$/, "").replace(".", ",")}%`;
}
