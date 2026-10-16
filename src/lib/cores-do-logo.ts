// As cores do sistema a partir do logotipo (decidido em 16/10/2026).
//
// Todo logotipo novo redefine a cor principal e a de destaque do escritorio,
// sozinho. O escritorio pode ajustar depois, na mesma tela; o que ele nao
// precisa mais e acertar no olho o codigo de cor do proprio logo.
//
// COMO ESCOLHE
//
// 1. Reduz a imagem (96 px) e conta as cores dos pixels opacos, agrupando as
//    vizinhas — antisserrilhado e compressao produzem dezenas de quase-iguais.
// 2. Descarta o fundo claro (branco, creme, cinza claro): e papel, nao marca.
// 3. Principal: a cor ESCURA mais presente — e a que vai em botao e faixa,
//    com texto em cima. Sem nenhuma escura (logo todo amarelo, por exemplo),
//    a mais viva, escurecida ate o texto ler sobre ela.
// 4. Destaque: entre as que sobram e sao bem diferentes da principal, a mais
//    viva (presenca x saturacao). Logo de uma cor so nao tem destaque: fica o
//    que o escritorio ja tinha.
//
// A legibilidade continua sendo de paletaDe (identidade.ts): aqui so se
// escolhe a identidade.
import { luminancia, normalizarCor, textoLegivelSobre } from "./identidade";

export type CoresDoLogo = {
  primaria: string;
  /** null quando o logo tem uma cor so. */
  secundaria: string | null;
};

type Grupo = { r: number; g: number; b: number; n: number };

const LADO = 96;
/** Menos que isso da imagem e detalhe (sombra, borda), nao cor da marca. */
const PRESENCA_MINIMA = 0.01;
/** Distancia (RGB) abaixo da qual duas cores sao a mesma, com ruido. */
const MESMA_COR = 48;
/** Distancia minima entre principal e destaque para valer a pena. */
const DESTAQUE_DISTINTO = 80;

const hex = (g: Grupo) =>
  normalizarCor(
    [g.r, g.g, g.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""),
  )!;

const distancia = (a: Grupo, b: Grupo) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

/** Saturacao aproximada (0 a 1): cinza e 0, cor pura e 1. */
const vivacidade = (g: Grupo) => (Math.max(g.r, g.g, g.b) - Math.min(g.r, g.g, g.b)) / 255;

/** Matiz em graus (0 a 360); so faz sentido para cor com vivacidade. */
function matiz(g: Grupo): number {
  const [r, gg, b] = [g.r / 255, g.g / 255, g.b / 255];
  const max = Math.max(r, gg, b);
  const d = max - Math.min(r, gg, b);
  if (!d) return 0;
  const h = max === r ? ((gg - b) / d) % 6 : max === gg ? (b - r) / d + 2 : (r - gg) / d + 4;
  return (h * 60 + 360) % 360;
}

const mesmoMatiz = (a: Grupo, b: Grupo) => {
  const d = Math.abs(matiz(a) - matiz(b));
  return Math.min(d, 360 - d) <= 25;
};

/**
 * A familia de uma cor viva: os tons do mesmo matiz, na media ponderada.
 * Degrade (o ouro que vai do bronze ao champanhe) chega em varios grupos;
 * a marca e a familia, nao o tom mais escuro dela.
 */
function familia(cor: Grupo, grupos: Grupo[]): Grupo {
  const tons = grupos.filter((g) => vivacidade(g) >= 0.15 && mesmoMatiz(g, cor));
  const n = tons.reduce((t, g) => t + g.n, 0);
  return {
    r: tons.reduce((t, g) => t + g.r * g.n, 0) / n,
    g: tons.reduce((t, g) => t + g.g * g.n, 0) / n,
    b: tons.reduce((t, g) => t + g.b * g.n, 0) / n,
    n,
  };
}

/** Os grupos de cor da imagem, do mais presente ao menos. */
export async function gruposDeCor(conteudo: Buffer): Promise<Grupo[]> {
  // Importado aqui, nao no topo: se o sharp faltar no servidor, perde-se o
  // ajuste automatico das cores (coresDoLogo devolve null), nao o envio do
  // logotipo inteiro.
  const { default: sharp } = await import("sharp");
  const { data, info } = await sharp(conteudo, { limitInputPixels: 40_000_000 })
    .resize(LADO, LADO, { fit: "inside", withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Primeiro em caixas de 16 niveis por canal, depois juntando as vizinhas.
  const caixas = new Map<number, Grupo>();
  let opacos = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] < 200) continue;
    opacos += 1;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const chave = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const c = caixas.get(chave) ?? { r: 0, g: 0, b: 0, n: 0 };
    c.r += r; c.g += g; c.b += b; c.n += 1;
    caixas.set(chave, c);
  }
  if (!opacos) return [];

  const grupos: Grupo[] = [];
  const ordenadas = [...caixas.values()]
    .map((c) => ({ r: c.r / c.n, g: c.g / c.n, b: c.b / c.n, n: c.n }))
    .sort((a, b) => b.n - a.n);
  for (const c of ordenadas) {
    const perto = grupos.find((g) => distancia(g, c) < MESMA_COR);
    if (perto) {
      const total = perto.n + c.n;
      perto.r = (perto.r * perto.n + c.r * c.n) / total;
      perto.g = (perto.g * perto.n + c.g * c.n) / total;
      perto.b = (perto.b * perto.n + c.b * c.n) / total;
      perto.n = total;
    } else {
      grupos.push({ ...c });
    }
  }
  return grupos
    .filter((g) => g.n / opacos >= PRESENCA_MINIMA)
    .sort((a, b) => b.n - a.n);
}

/**
 * A cor principal e a de destaque que o logotipo sugere. null quando a
 * imagem nao abre ou nao tem cor de marca (so fundo claro, por exemplo) —
 * nesse caso as cores do escritorio ficam como estao.
 */
export async function coresDoLogo(conteudo: Buffer): Promise<CoresDoLogo | null> {
  let grupos: Grupo[];
  try {
    grupos = await gruposDeCor(conteudo);
  } catch {
    return null;
  }
  // Fundo claro e papel, nao marca.
  const marca = grupos.filter((g) => luminancia(hex(g)) <= 0.8);
  if (!marca.length) return null;

  // Entre as escuras, presenca pesada pela escuridao: com duas de tamanho
  // parecido, a mais escura e a que segura botao e faixa.
  const escuras = marca
    .filter((g) => luminancia(hex(g)) <= 0.3)
    .sort((a, b) => b.n * (1 - 2 * luminancia(hex(b))) - a.n * (1 - 2 * luminancia(hex(a))));
  const base = escuras.length
    ? escuras[0]
    : [...marca].sort((a, b) => vivacidade(b) * b.n - vivacidade(a) * a.n)[0];
  const primaria = escuras.length ? hex(base) : textoLegivelSobre(hex(base));

  const candidatas = marca.filter((g) => g !== base && distancia(g, base) >= DESTAQUE_DISTINTO);
  const escolhida = candidatas.sort(
    (a, b) => b.n * (0.25 + vivacidade(b)) - a.n * (0.25 + vivacidade(a)),
  )[0];
  const destaque = escolhida && vivacidade(escolhida) >= 0.15 ? familia(escolhida, candidatas) : escolhida;

  return { primaria, secundaria: destaque ? hex(destaque) : null };
}
