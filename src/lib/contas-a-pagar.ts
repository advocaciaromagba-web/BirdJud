// Contas a pagar: o que vence, quando, e quando avisar.
//
// Duas coisas que custam dinheiro de verdade e que este arquivo existe para
// impedir: a despesa fixa que continua sendo gerada depois do contrato acabar
// (o escritorio paga aluguel de sala que devolveu), e a conta que vence sem
// ninguem lembrar (juros e multa, ou servico cortado).
//
// Nao toca banco. Cada regra abaixo da para testar sozinha.

/** Mesma regua dos prazos processuais: nao se inventa um segundo jeito de avisar. */
export const AVISOS_EM_DIAS = [3, 1, 0] as const;

export type Urgencia = "ATRASADA" | "HOJE" | "AMANHA" | "EM_3_DIAS" | null;

/**
 * Quantos dias inteiros faltam, contando dia de calendario.
 *
 * Em dias, nao em horas: uma conta que vence amanha as 08h nao "vence em 0
 * dias" porque agora sao 23h de hoje.
 */
export function diasAte(vencimentoISO: string, hojeISO: string): number {
  const a = Date.parse(`${hojeISO}T00:00:00Z`);
  const b = Date.parse(`${vencimentoISO}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Em que ponto da regua a conta esta — ou null, quando ainda nao e hora. */
export function urgencia(vencimentoISO: string, hojeISO: string): Urgencia {
  const dias = diasAte(vencimentoISO, hojeISO);
  if (dias < 0) return "ATRASADA";
  if (dias === 0) return "HOJE";
  if (dias === 1) return "AMANHA";
  if (dias === 3) return "EM_3_DIAS";
  // 2 dias e 4 dias nao avisam: a regua e 3, 1, hoje e atrasado, e avisar
  // todo dia e o jeito certo de o aviso virar ruido que ninguem le.
  return null;
}

export function comoTexto(u: Exclude<Urgencia, null>, dias: number): string {
  if (u === "ATRASADA") {
    const n = Math.abs(dias);
    return `venceu ha ${n} dia${n === 1 ? "" : "s"}`;
  }
  if (u === "HOJE") return "vence hoje";
  if (u === "AMANHA") return "vence amanha";
  return "vence em 3 dias";
}

export type Vigencia = {
  /** Primeiro dia em que a despesa existe, "AAAA-MM-DD". */
  inicioEm: string | null;
  /** Ultimo dia, quando o contrato tem fim. */
  fimEm: string | null;
  ativo: boolean;
};

/**
 * A despesa fixa vale nesta competencia?
 *
 * A pergunta parece boba ate o escritorio devolver a sala em junho e continuar
 * recebendo a conta do aluguel em julho, agosto e setembro — e alguem pagar
 * uma delas por distracao. Contrato que comecou em marco tambem nao gera
 * janeiro e fevereiro quando e cadastrado depois.
 *
 * `competencia` e "AAAA-MM". Compara-se o MES, nao o dia: uma despesa que
 * comecou dia 20 de marco e despesa de marco.
 */
export function vigenteNaCompetencia(v: Vigencia, competencia: string): boolean {
  if (!v.ativo) return false;
  if (!/^\d{4}-\d{2}$/.test(competencia)) return false;
  if (v.inicioEm && v.inicioEm.slice(0, 7) > competencia) return false;
  if (v.fimEm && v.fimEm.slice(0, 7) < competencia) return false;
  return true;
}

/** O fim nao pode vir antes do comeco. */
export function vigenciaCoerente(inicioEm: string | null, fimEm: string | null): boolean {
  if (!inicioEm || !fimEm) return true;
  return fimEm >= inicioEm;
}

/**
 * O limite de busca das contas que podem precisar de aviso hoje.
 *
 * QUATRO dias, e nao tres, embora a regua avise com tres: o vencimento e
 * gravado ao meio-dia, entao um limite em "hoje + 3 as 00h" deixaria a conta
 * do terceiro dia de fora por doze horas — e o aviso de tres dias antes
 * simplesmente nunca sairia, sem erro nenhum na tela. Buscar um dia a mais nao
 * cria aviso a mais: quem decide e `urgencia`, que nao fala em 4 dias.
 */
export function limiteDaBusca(hojeISO: string): Date {
  const d = new Date(`${hojeISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(...AVISOS_EM_DIAS) + 1);
  return d;
}
