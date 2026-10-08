/**
 * Como o sistema escreve o nome de uma pessoa em espaco curto.
 *
 * Nada aqui toca banco nem React: e so texto, e por isso da para testar.
 */

/** "da", "de", "dos"... Nao viram inicial: JD nao diz nada a ninguem. */
const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e"]);

/**
 * As duas iniciais do nome, para o circulo do menu.
 *
 * Primeiro e ULTIMO pedaco, nao os dois primeiros: "Jose Luciano da Costa
 * Roma" e conhecido como Roma, e JL nao o identifica.
 */
export function iniciaisDe(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((pedaco) => pedaco && !PARTICULAS.has(pedaco.toLowerCase()));
  if (partes.length === 0) return "?";
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}
