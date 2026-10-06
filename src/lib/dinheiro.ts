// Dinheiro sempre em centavos (inteiro). Ponto flutuante nao entra em valor.

/** "1.234,56", "1234.56" ou "R$ 10" -> centavos. null quando nao e valor. */
export function paraCentavos(valor: string): number | null {
  const limpo = valor.trim().replace(/\s|R\$/g, "");
  if (!limpo) return null;
  // Com virgula, o ponto e separador de milhar: "1.234,56".
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  const numero = Number(normalizado);
  if (!Number.isFinite(numero) || numero < 0) return null;
  return Math.round(numero * 100);
}

export function emReais(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

// ---------------------------------------------------------------------------
// Valor por extenso.
//
// No contrato, o valor escrito por extenso e o que prevalece quando ele e o
// numero discordam. Entao ele nao e enfeite: e o valor.
// ---------------------------------------------------------------------------

const ATE_VINTE = [
  "zero", "um", "dois", "tres", "quatro", "cinco", "seis", "sete", "oito",
  "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis",
  "dezessete", "dezoito", "dezenove",
];
const DEZENAS = [
  "", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta",
  "oitenta", "noventa",
];
const CENTENAS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
  "seiscentos", "setecentos", "oitocentos", "novecentos",
];

/** Um grupo de ate tres digitos, por extenso. */
function ateNovecentos(n: number): string {
  if (n === 100) return "cem"; // "cento" so existe acompanhado: cento e um.
  const partes: string[] = [];
  const c = Math.floor(n / 100);
  const resto = n % 100;
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) {
    if (resto < 20) partes.push(ATE_VINTE[resto]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u > 0 ? `${DEZENAS[d]} e ${ATE_VINTE[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(" e ");
}

const GRUPOS: Array<[string, string]> = [
  ["", ""],
  ["mil", "mil"],
  ["milhao", "milhoes"],
  ["bilhao", "bilhoes"],
];

/** Numero inteiro por extenso, sem unidade. */
export function numeroPorExtenso(valor: number): string {
  const n = Math.floor(Math.abs(valor));
  if (n === 0) return "zero";
  if (n >= 1_000_000_000_000) return String(n);

  const grupos: number[] = [];
  let resto = n;
  while (resto > 0) {
    grupos.push(resto % 1000);
    resto = Math.floor(resto / 1000);
  }

  const ditos: string[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (g === 0) continue;
    if (i === 0) ditos.push(ateNovecentos(g));
    else if (i === 1) ditos.push(g === 1 ? "mil" : `${ateNovecentos(g)} mil`);
    else ditos.push(`${ateNovecentos(g)} ${g === 1 ? GRUPOS[i][0] : GRUPOS[i][1]}`);
  }

  // "e" antes do ultimo grupo quando ele e menor que cem ou e centena redonda:
  // mil e quinhentos, dois mil e trinta — mas mil duzentos e trinta.
  const ultimo = grupos[0];
  if (ditos.length > 1 && ultimo > 0 && (ultimo < 100 || ultimo % 100 === 0)) {
    const fim = ditos.pop()!;
    return `${ditos.join(", ")} e ${fim}`;
  }
  return ditos.join(" ");
}

/** "mil e quinhentos reais e trinta centavos". */
export function porExtenso(centavos: number): string {
  const inteiros = Math.floor(Math.abs(centavos) / 100);
  const resto = Math.abs(centavos) % 100;

  const parteReais =
    inteiros === 0
      ? null
      : `${numeroPorExtenso(inteiros)} ${inteiros === 1 ? "real" : "reais"}`;
  const parteCentavos =
    resto === 0
      ? null
      : `${numeroPorExtenso(resto)} ${resto === 1 ? "centavo" : "centavos"}`;

  if (parteReais && parteCentavos) return `${parteReais} e ${parteCentavos}`;
  return parteReais ?? parteCentavos ?? "zero real";
}
