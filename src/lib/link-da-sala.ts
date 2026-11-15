// O link da sala de audiencia, como alguem o colou (11/11/2026, vindo do
// sistema da Advocacia Roma).
//
// O campo e colado a mao, porque quem define a sala e o tribunal. Ia cru para
// o href: colado sem "https://", o navegador le aquilo como caminho RELATIVO e
// manda o clique para dentro do proprio sistema — tela de erro, e parece que
// o link nao funciona quando ele nunca saiu daqui.
//
// Um normalizador so, usado na GRAVACAO e na LEITURA. Na leitura porque os
// compromissos ja cadastrados passam a funcionar sem mexer nos dados.
//
// So http e https passam: o campo vira href, e um "javascript:" ali
// executaria no clique.

export type LinkDaSala = {
  /** Endereco pronto para o href, ou nulo quando o texto nao e um link. */
  url: string | null;
  /** O que mostrar quando nao ha link ("sala 3 do forum"). Nulo se vazio. */
  texto: string | null;
};

// Dominio com ponto e final de 2+ letras: "meet.google.com/abc", "teams.microsoft.com/l/...".
const SEM_ESQUEMA = /(?:^|[\s<(:])((?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#][^\s<>"']*)?)/i;
const COM_ESQUEMA = /https?:\/\/[^\s<>"']+/i;

/** Tira o que encosta no fim da URL sem fazer parte dela: ponto final, virgula, parentese de fechamento sem par. */
function apararFim(url: string): string {
  let u = url;
  for (;;) {
    const antes = u;
    u = u.replace(/[.,;:!?>\]]+$/, "");
    if (u.endsWith(")") && !u.includes("(")) u = u.slice(0, -1);
    if (u === antes) return u;
  }
}

export function linkDaSala(bruto: string | null | undefined): LinkDaSala {
  const original = (bruto ?? "").trim();
  if (!original) return { url: null, texto: null };

  // Quebra de linha do copiar-e-colar de PDF parte a URL em duas: quando o
  // texto inteiro, sem os brancos, e um endereco so, junta de volta.
  // So junta quando o branco e QUEBRA DE LINHA: espaco comum separa o
  // endereco de um recado ("... (entrar 10 min antes)") e nao pode ser colado.
  const semQuebras = original.replace(/[ \t]*\r?\n[ \t]*/g, "");
  const candidato = /\n/.test(original) && !/\s/.test(semQuebras) ? semQuebras : original;

  // Qualquer outro esquema escrito (javascript:, data:, file:, mailto:) nao vira link.
  if (/^\s*<?\s*[a-z][a-z0-9+.-]*:/i.test(candidato) && !/^\s*<?\s*https?:\/\//i.test(candidato) && !/^\s*<?\s*link\s*:/i.test(candidato)) {
    return { url: null, texto: original };
  }

  const comEsquema = COM_ESQUEMA.exec(candidato)?.[0];
  const achado = comEsquema ?? SEM_ESQUEMA.exec(candidato)?.[1];
  if (!achado) return { url: null, texto: original };

  const url = apararFim(comEsquema ? achado : `https://${achado}`);
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return { url: null, texto: original };
    // "sala.3" ou "fls.12" nao sao enderecos: sem esquema, exige caminho ou www.
    if (!comEsquema && !/^www\./i.test(achado) && u.pathname === "/" && !u.search) {
      // Dominio puro (ex.: "meet.google.com") e raro como sala; aceita so os de final conhecido.
      if (!/\.(com|br|us|net|org|gov|jus|app|me|io)$/i.test(u.hostname)) return { url: null, texto: original };
    }
    return { url: u.toString(), texto: null };
  } catch {
    return { url: null, texto: original };
  }
}

/** Para gravar: o endereco limpo quando e link; o texto como veio quando nao e. */
export function linkParaGravar(bruto: string | null | undefined): string | null {
  const { url, texto } = linkDaSala(bruto);
  return url ?? texto;
}
