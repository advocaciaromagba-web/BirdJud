/**
 * Algumas comunicações do DJEN vêm com o texto em HTML cru (tags e
 * entidades) em vez de texto puro — o mesmo conteúdo que em outras
 * comunicações já chega limpo. Isso deixa a publicação ilegível na tela e
 * atrapalha a própria IA na hora de analisar (resumo, prazo, parte, vara).
 * Esta função detecta esse caso e converte para texto simples e legível,
 * preservando quebras de linha onde faziam sentido (parágrafo, linha de
 * tabela) — sem mexer em textos que já chegam limpos.
 */

/** Entidades nomeadas mais comuns em texto jurídico em português. */
const ENTIDADES_NOMEADAS: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  aacute: "á",
  Aacute: "Á",
  agrave: "à",
  Agrave: "À",
  acirc: "â",
  Acirc: "Â",
  atilde: "ã",
  Atilde: "Ã",
  auml: "ä",
  Auml: "Ä",
  eacute: "é",
  Eacute: "É",
  egrave: "è",
  Egrave: "È",
  ecirc: "ê",
  Ecirc: "Ê",
  euml: "ë",
  Euml: "Ë",
  iacute: "í",
  Iacute: "Í",
  igrave: "ì",
  Igrave: "Ì",
  icirc: "î",
  Icirc: "Î",
  iuml: "ï",
  Iuml: "Ï",
  oacute: "ó",
  Oacute: "Ó",
  ograve: "ò",
  Ograve: "Ò",
  ocirc: "ô",
  Ocirc: "Ô",
  otilde: "õ",
  Otilde: "Õ",
  ouml: "ö",
  Ouml: "Ö",
  uacute: "ú",
  Uacute: "Ú",
  ugrave: "ù",
  Ugrave: "Ù",
  ucirc: "û",
  Ucirc: "Û",
  uuml: "ü",
  Uuml: "Ü",
  ccedil: "ç",
  Ccedil: "Ç",
  ntilde: "ñ",
  Ntilde: "Ñ",
  ordm: "º",
  ordf: "ª",
  deg: "°",
  sect: "§",
  para: "¶",
  middot: "·",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  lsquo: "'",
  rsquo: "'",
  ldquo: '"',
  rdquo: '"',
};

function decodificarEntidades(texto: string): string {
  return texto
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, nome) => ENTIDADES_NOMEADAS[nome] ?? m);
}

/** true quando o texto tem cara de HTML (tag de verdade, não só um "<" solto num número de processo). */
function pareceHtml(texto: string): boolean {
  return /<\s*(html|head|body|section|table|tr|td|th|p|div|span|br|header|footer|article|b|strong)[\s>]/i.test(
    texto
  );
}

export function limparTextoHtml(textoOriginal: string): string {
  if (!textoOriginal) return textoOriginal;
  if (!pareceHtml(textoOriginal)) return textoOriginal;

  let t = textoOriginal;

  // Remove o que nunca é conteúdo visível.
  t = t.replace(/<style[\s\S]*?<\/style>/gi, "");
  t = t.replace(/<script[\s\S]*?<\/script>/gi, "");

  // Tags que marcam fim de bloco viram quebra de linha, para o texto não
  // virar um parágrafo só, ilegível.
  t = t.replace(/<\s*(br)\s*\/?>/gi, "\n");
  t = t.replace(/<\/\s*(p|div|section|tr|header|footer|article|table|h[1-6])\s*>/gi, "\n");

  // Célula de tabela vira só um espaço (o conteúdo de cada <td> já costuma
  // vir com ": " no início da segunda célula, então não precisa separador).
  t = t.replace(/<\/\s*(td|th)\s*>/gi, " ");

  // Todo o resto de marcação (abertura de tag, tags sem conteúdo relevante).
  t = t.replace(/<[^>]+>/g, "");

  t = decodificarEntidades(t);

  // Colapsa espaços/linhas em branco repetidos, sem perder os parágrafos.
  // O espaço que sobra de "<td>RÓTULO</td><td>: valor</td>" (virou
  // "RÓTULO : valor") fica melhor como "RÓTULO: valor".
  t = t
    .split("\n")
    .map((linha) => linha.replace(/[ \t]+/g, " ").replace(/ +:/g, ":").trim())
    .filter((linha, i, arr) => linha || (i > 0 && arr[i - 1]))
    .join("\n")
    .trim();

  return t;
}
