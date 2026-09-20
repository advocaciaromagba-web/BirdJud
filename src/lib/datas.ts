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
