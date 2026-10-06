// Como a data aparece para o escritorio.
//
// O servidor roda em UTC (Railway, CI, container) e o escritorio nao. Sem
// fuso fixo, uma audiencia das 22h aparece no dia seguinte, e o compromisso
// das 2h da manha aparece no dia anterior — erro que so se descobre quando
// alguem perde a hora.
//
// O fuso e de Brasilia, fixo, e nao o do navegador: a tela e o e-mail tem de
// dizer a mesma hora, e o e-mail e montado no servidor.
const FUSO = "America/Sao_Paulo";

export const dataHoraBR = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: FUSO,
});

export const dataBR = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: FUSO,
});

export const horaBR = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: FUSO,
});

/**
 * Uma coluna que guarda DIA, nao momento, escrita como "02/10/2026".
 *
 * Dia de extrato e dia de prazo sao gravados como meia-noite em UTC: sao data
 * do calendario, nao hora de nada. Formatar isso em Brasilia volta tres horas
 * e mostra o dia anterior — um Pix do dia 1o apareceria como dia 30. Por isso
 * se le de volta em UTC, o mesmo fuso em que foi gravado.
 */
export function diaBR(data: Date): string {
  return data.toISOString().slice(0, 10).split("-").reverse().join("/");
}

/** Cabecalho de dia na agenda, como "quinta-feira, 25 de setembro". */
export const diaPorExtensoBR = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  timeZone: FUSO,
});

/** O dia de uma data em Brasilia, como "2026-09-20". */
export function diaEmBrasilia(data: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(data);
}

export function ehMesmoDiaEmBrasilia(a: Date, b: Date): boolean {
  return diaEmBrasilia(a) === diaEmBrasilia(b);
}
