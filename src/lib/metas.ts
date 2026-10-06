// Meta de faturamento do ano, e se o escritorio esta no ritmo dela.
//
// "76% da meta" nao e informacao: em marco seria otimo, em dezembro seria um
// ano perdido. O que se quer saber e se da tempo — e isso e o ritmo, nao o
// percentual.
//
// Nao toca banco. So contas sobre dois numeros e uma data.

/** Dias do ano, contando bissexto. */
export function diasDoAno(ano: number): number {
  return (Date.UTC(ano + 1, 0, 1) - Date.UTC(ano, 0, 1)) / 86_400_000;
}

/** Quantos dias do ano ja passaram, contando o dia de hoje como vivido. */
export function diasVividos(ano: number, hojeISO: string): number {
  const inicio = Date.UTC(ano, 0, 1);
  const hoje = Date.parse(`${hojeISO}T00:00:00Z`);
  const passados = Math.floor((hoje - inicio) / 86_400_000) + 1;
  return Math.min(Math.max(passados, 0), diasDoAno(ano));
}

export type Situacao = "ADIANTADO" | "NO_RITMO" | "ATRASADO" | "CUMPRIDA";

export type Ritmo = {
  metaCentavos: number;
  realizadoCentavos: number;
  /** Quanto do ano ja passou, de 0 a 1. */
  fracaoDoAno: number;
  /** Quanto ja deveria ter entrado para estar no ritmo. */
  esperadoCentavos: number;
  /** Positivo e sobra; negativo e o que falta para estar no ritmo. */
  diferencaCentavos: number;
  /** Quanto da meta ja entrou, de 0 a 1. Pode passar de 1. */
  cumprido: number;
  situacao: Situacao;
  /** O que falta para fechar o ano. Zero quando a meta ja foi batida. */
  faltaCentavos: number;
  /** Por mes, no tempo que sobra, para fechar. null quando o ano acabou. */
  porMesRestanteCentavos: number | null;
  /** No ritmo de hoje, quanto o ano fecharia. */
  projecaoCentavos: number;
};

/**
 * Margem antes de dizer que o escritorio esta atrasado.
 *
 * Honorario nao entra em parcela diaria: entra em janeiro, nao entra em
 * fevereiro, entra em dobro em marco. Sem margem, o painel diria "ATRASADO"
 * quase toda semana e viraria um alarme que ninguem olha.
 */
export const MARGEM = 0.05;

/**
 * Onde o escritorio esta em relacao a meta do ano.
 *
 * O ritmo e por DIA corrido, nao por mes fechado: em 6 de outubro o ano nao
 * esta em 9/12, esta em 279/365. Dizer que a meta de outubro e 10/12 daria ao
 * escritorio um mes inteiro de folga que ele nao tem.
 */
export function ritmoDaMeta(
  metaCentavos: number,
  realizadoCentavos: number,
  ano: number,
  hojeISO: string,
): Ritmo | null {
  if (!Number.isFinite(metaCentavos) || metaCentavos <= 0) return null;

  const total = diasDoAno(ano);
  const vividos = diasVividos(ano, hojeISO);
  const fracaoDoAno = vividos / total;

  const esperadoCentavos = Math.round(metaCentavos * fracaoDoAno);
  const diferencaCentavos = realizadoCentavos - esperadoCentavos;
  const cumprido = realizadoCentavos / metaCentavos;
  const faltaCentavos = Math.max(0, metaCentavos - realizadoCentavos);

  const diasQueSobram = total - vividos;
  const porMesRestanteCentavos =
    faltaCentavos === 0
      ? 0
      : diasQueSobram > 0
        ? Math.round(faltaCentavos / (diasQueSobram / 30))
        : null;

  // Projecao so faz sentido depois que o ano comecou a andar: com tres dias
  // vividos, um unico recebimento projetaria cem vezes a meta.
  const projecaoCentavos =
    vividos > 0 ? Math.round(realizadoCentavos / fracaoDoAno) : 0;

  let situacao: Situacao;
  if (realizadoCentavos >= metaCentavos) situacao = "CUMPRIDA";
  else if (diferencaCentavos >= metaCentavos * MARGEM) situacao = "ADIANTADO";
  else if (diferencaCentavos <= -metaCentavos * MARGEM) situacao = "ATRASADO";
  else situacao = "NO_RITMO";

  return {
    metaCentavos,
    realizadoCentavos,
    fracaoDoAno,
    esperadoCentavos,
    diferencaCentavos,
    cumprido,
    situacao,
    faltaCentavos,
    porMesRestanteCentavos,
    projecaoCentavos,
  };
}

export const COMO_ESTA: Record<Situacao, string> = {
  CUMPRIDA: "Meta do ano cumprida",
  ADIANTADO: "Acima do ritmo",
  NO_RITMO: "No ritmo",
  ATRASADO: "Abaixo do ritmo",
};

/** O ano que a tela abre: o corrente, pelo relogio de Brasilia. */
export function anoDe(hojeISO: string): number {
  return Number(hojeISO.slice(0, 4));
}

/** Anos que a tela oferece: o passado, o corrente e o proximo. */
export function anosOferecidos(ano: number): number[] {
  return [ano - 1, ano, ano + 1];
}
