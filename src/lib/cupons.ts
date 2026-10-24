// Cupons de desconto da plataforma.
//
// O cupom da desconto na MENSALIDADE (ou na fatura do periodo, no trimestral
// e no anual), nunca no excedente de consumo: excedente e uso, nao assinatura.
// Percentual ou valor fixo por mes; por N meses de fatura, contados do mes
// em que o teste acaba (nulo = enquanto durar a assinatura). Conta em meses
// de competencia, nao em dias: a fatura sai no comeco do mes, e um prazo em
// dias (20/10 a 20/11) pegaria a fatura de 01/11 e daria um mes a mais. Validade e limite de usos valem
// para APLICAR; cupom ja aplicado segue ate o fim do prazo dele, mesmo que
// o cupom seja desativado depois.
import { prismaPlataforma } from "./prisma";
import { somar, type ItemDaFatura } from "./precos";

export type CupomNaConta = {
  codigo: string;
  percentual: number | null;
  valorCentavos: number | null;
  /** Meses da fatura que o cupom cobre; ausente = todos. */
  cobertos?: number;
};

export class CupomInvalido extends Error {
  readonly status = 400;
  constructor(motivo: string) {
    super(motivo);
    this.name = "CupomInvalido";
  }
}

/** Codigo como fica gravado: maiusculo, sem espaco. "boas vindas" -> "BOASVINDAS". */
export function normalizarCodigo(codigo: string): string {
  return codigo.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

/**
 * A linha de desconto do cupom sobre a mensalidade (ou o periodo de `meses`
 * meses). `cobertos` e quantos desses meses o cupom ainda alcanca: um cupom
 * de 1 mes numa fatura anual desconta 1/12 do ano, nao o ano inteiro. Nunca
 * deixa a fatura negativa: valor fixo maior que ela zera, nao credita.
 */
export function linhaDoCupom(
  cupom: CupomNaConta,
  base: ItemDaFatura[],
  meses = 1,
  cobertos = meses,
): ItemDaFatura | null {
  const total = somar(base);
  const n = Math.max(0, Math.min(meses, cobertos));
  if (total <= 0 || n === 0) return null;
  const desconto =
    cupom.percentual != null
      ? Math.round((total * cupom.percentual * n) / (100 * meses))
      : Math.min(total, (cupom.valorCentavos ?? 0) * n);
  if (desconto <= 0) return null;
  const como = cupom.percentual != null ? `${cupom.percentual}%` : "valor fixo";
  const parte = n < meses ? `, ${n} de ${meses} meses` : "";
  return { descricao: `Cupom ${cupom.codigo} (${como}${parte})`, valorCentavos: -desconto };
}

/** O cupom aplicado ainda vale nesta data? */
export function cupomValeEm(cupomAte: Date | null | undefined, agora: Date): boolean {
  return !cupomAte || cupomAte > agora;
}

/** Fim do cupom: o primeiro dia do mes que vem N meses depois do mes de `inicio`. */
export function fimDoCupom(inicio: Date, meses: number): Date {
  return new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + meses, 1));
}

/** O ultimo mes de fatura com desconto, "11/2026". */
export function ultimoMesDoCupom(cupomAte: Date): string {
  const d = new Date(Date.UTC(cupomAte.getUTCFullYear(), cupomAte.getUTCMonth() - 1, 1));
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

/** Quantos dos `meses` da fatura emitida em `agora` o cupom ainda cobre. */
export function mesesCobertos(cupomAte: Date | null | undefined, agora: Date, meses: number): number {
  if (!cupomAte) return meses;
  const restam =
    cupomAte.getUTCFullYear() * 12 + cupomAte.getUTCMonth() - (agora.getUTCFullYear() * 12 + agora.getUTCMonth());
  return Math.max(0, Math.min(meses, restam));
}

export type NovoCupom = {
  codigo: string;
  descricao?: string | null;
  percentual?: number | null;
  valorCentavos?: number | null;
  meses?: number | null;
  validoAte?: Date | null;
  maxUsos?: number | null;
};

export async function criarCupom(dados: NovoCupom, quem: string) {
  const codigo = normalizarCodigo(dados.codigo);
  if (codigo.length < 3 || codigo.length > 30) throw new CupomInvalido("O código tem de ter de 3 a 30 letras ou números.");
  const pct = dados.percentual ?? null;
  const valor = dados.valorCentavos ?? null;
  if ((pct == null) === (valor == null)) throw new CupomInvalido("Escolha percentual OU valor fixo, um dos dois.");
  if (pct != null && (!Number.isInteger(pct) || pct < 1 || pct > 100)) throw new CupomInvalido("Percentual de 1 a 100.");
  if (valor != null && (!Number.isInteger(valor) || valor < 1)) throw new CupomInvalido("Valor fixo maior que zero.");
  if (dados.meses != null && (!Number.isInteger(dados.meses) || dados.meses < 1 || dados.meses > 120)) {
    throw new CupomInvalido("Duração de 1 a 120 meses (ou em branco, para sempre).");
  }
  if (dados.maxUsos != null && (!Number.isInteger(dados.maxUsos) || dados.maxUsos < 1)) {
    throw new CupomInvalido("Limite de usos maior que zero (ou em branco, sem limite).");
  }
  const ja = await prismaPlataforma().cupom.findUnique({ where: { codigo }, select: { id: true } });
  if (ja) throw new CupomInvalido(`Já existe o cupom ${codigo}.`);
  return prismaPlataforma().cupom.create({
    data: {
      codigo,
      descricao: dados.descricao?.trim() || null,
      percentual: pct,
      valorCentavos: valor,
      meses: dados.meses ?? null,
      validoAte: dados.validoAte ?? null,
      maxUsos: dados.maxUsos ?? null,
      criadoPor: quem,
    },
  });
}

/** O cupom pode ser APLICADO agora? Devolve-o, ou diz por que nao. */
export async function conferirCupom(codigoDigitado: string, agora = new Date()) {
  const codigo = normalizarCodigo(codigoDigitado);
  const cupom = codigo ? await prismaPlataforma().cupom.findUnique({ where: { codigo } }) : null;
  if (!cupom || !cupom.ativo) throw new CupomInvalido("Cupom não encontrado ou desativado.");
  if (cupom.validoAte && cupom.validoAte < agora) throw new CupomInvalido("Este cupom já venceu.");
  if (cupom.maxUsos != null && cupom.usos >= cupom.maxUsos) throw new CupomInvalido("Este cupom já foi usado o número máximo de vezes.");
  return cupom;
}

/**
 * Aplica o cupom na assinatura do escritorio. O uso e contado de forma
 * atomica: dois cadastros juntos nunca passam do limite. O prazo do desconto
 * conta do fim do teste (ou de hoje, se o teste ja acabou).
 */
export async function aplicarCupom(escritorioId: string, codigoDigitado: string, agora = new Date()) {
  const cupom = await conferirCupom(codigoDigitado, agora);
  const assinatura = await prismaPlataforma().assinatura.findUnique({ where: { escritorioId } });
  if (!assinatura) throw new CupomInvalido("Escritório sem assinatura.");
  if (assinatura.cupomId === cupom.id) throw new CupomInvalido("Este cupom já está aplicado neste escritório.");

  const contou = await prismaPlataforma().cupom.updateMany({
    where: {
      id: cupom.id,
      ativo: true,
      ...(cupom.maxUsos != null ? { usos: { lt: cupom.maxUsos } } : {}),
    },
    data: { usos: { increment: 1 } },
  });
  if (contou.count !== 1) throw new CupomInvalido("Este cupom já foi usado o número máximo de vezes.");

  const inicio = assinatura.fimDoTeste > agora ? assinatura.fimDoTeste : agora;
  await prismaPlataforma().assinatura.update({
    where: { escritorioId },
    data: {
      cupomId: cupom.id,
      cupomAplicadoEm: agora,
      cupomAte: cupom.meses ? fimDoCupom(inicio, cupom.meses) : null,
    },
  });
  return cupom;
}

export async function removerCupom(escritorioId: string) {
  await prismaPlataforma().assinatura.update({
    where: { escritorioId },
    data: { cupomId: null, cupomAte: null, cupomAplicadoEm: null },
  });
}

export async function ativarCupom(id: string, ativo: boolean) {
  await prismaPlataforma().cupom.update({ where: { id }, data: { ativo } });
}
