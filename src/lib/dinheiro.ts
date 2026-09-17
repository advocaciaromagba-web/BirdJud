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
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    centavos / 100
  );
}
