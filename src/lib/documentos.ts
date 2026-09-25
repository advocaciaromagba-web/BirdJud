/**
 * CPF e CNPJ: digitos, validacao e mascara.
 *
 * A leitura de documento por IA erra numero — foto torta, carimbo por cima,
 * digito borrado. Conferir o digito verificador aqui e o que separa "a IA
 * leu" de "o numero existe": campo que nao fecha vai para a tela marcado
 * para conferencia, em vez de entrar no cadastro como se fosse certo.
 */

export function digitosDe(valor: string): string {
  return valor.replace(/\D/g, "");
}

function somaPonderada(digitos: string, pesos: number[]): number {
  return pesos.reduce(
    (total, peso, indice) => total + peso * Number(digitos[indice]),
    0,
  );
}

function digitoDoResto(soma: number): number {
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cpfValido(valor: string): boolean {
  const d = digitosDe(valor);
  if (d.length !== 11) return false;
  // 111.111.111-11 e parentes passam na conta dos digitos e nao existem.
  if (/^(\d)\1{10}$/.test(d)) return false;

  const primeiro = digitoDoResto(
    somaPonderada(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]),
  );
  const segundo = digitoDoResto(
    somaPonderada(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]),
  );
  return primeiro === Number(d[9]) && segundo === Number(d[10]);
}

export function cnpjValido(valor: string): boolean {
  const d = digitosDe(valor);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;

  const primeiro = digitoDoResto(
    somaPonderada(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]),
  );
  const segundo = digitoDoResto(
    somaPonderada(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]),
  );
  return primeiro === Number(d[12]) && segundo === Number(d[13]);
}

export function documentoValido(valor: string): boolean {
  const d = digitosDe(valor);
  if (d.length === 11) return cpfValido(d);
  if (d.length === 14) return cnpjValido(d);
  return false;
}

/** Com mascara, do jeito que o escritorio le. Sem tamanho conhecido, devolve o que veio. */
export function formatarDocumento(valor: string): string {
  const d = digitosDe(valor);
  if (d.length === 11)
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return valor.trim();
}
