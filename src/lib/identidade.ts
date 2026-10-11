// A identidade visual de cada escritorio.
//
// O sistema e branco: quem abre advocaciaroma.birdjud.com.br ve o escritorio,
// nao a plataforma. Isso ja valia para o nome e o logotipo; aqui as cores
// entram junto.
//
// DUAS DECISOES QUE VALEM PARA O ARQUIVO INTEIRO
//
// 1. A cor vira ESTILO INLINE no <body>. Valor que nao seja exatamente uma cor
//    hexadecimal e recusado — nao por paranoia, mas porque o navegador nao
//    distingue "cor" de "resto de CSS" numa propriedade personalizada: um
//    valor como `red; position:fixed; inset:0` viraria regra de verdade. A
//    unica defesa que funciona e nao deixar entrar.
//
// 2. O escritorio escolhe DUAS cores; o resto da paleta e derivado. Pedir seis
//    cores a um advogado produz combinacao ilegivel — e ilegivel num sistema
//    que se le oito horas por dia e custo, nao gosto. O que ele escolhe e a
//    identidade; a legibilidade e nossa.

export class CorInvalida extends Error {
  readonly status = 400;
  constructor(qual: string) {
    super(
      `A cor ${qual} precisa estar no formato #RRGGBB (por exemplo, #0B1F3B).`,
    );
    this.name = "CorInvalida";
  }
}

/** Aceita #RGB e #RRGGBB, com ou sem sustenido, e devolve sempre #RRGGBB. */
export function normalizarCor(bruto: string): string | null {
  const texto = bruto.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(texto)) {
    const [r, g, b] = texto;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(texto)) return `#${texto.toUpperCase()}`;
  return null;
}

export function exigirCor(bruto: string, qual: string): string {
  const cor = normalizarCor(bruto);
  if (!cor) throw new CorInvalida(qual);
  return cor;
}

type Rgb = { r: number; g: number; b: number };

export function paraRgb(cor: string): Rgb {
  const hex = cor.replace("#", "");
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function paraHex({ r, g, b }: Rgb): string {
  const dois = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${dois(r)}${dois(g)}${dois(b)}`;
}

/**
 * Luminancia relativa, na definicao da WCAG.
 *
 * Nao e a media dos canais: o olho enxerga o verde muito mais que o azul, e
 * usar a media faz texto branco sobre azul parecer legivel na conta e nao ser
 * na tela.
 */
export function luminancia(cor: string): number {
  const { r, g, b } = paraRgb(cor);
  const canal = (v: number) => {
    const n = v / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Razao de contraste entre duas cores, de 1 (igual) a 21 (preto e branco). */
export function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const [claro, escuro] = la > lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (escuro + 0.05);
}

/**
 * Preto ou branco sobre esta cor — o que for mais legivel.
 *
 * Existe porque o escritorio pode escolher amarelo. Texto branco sobre amarelo
 * e ilegivel, e o sistema nao pode ficar ilegivel porque alguem gosta de
 * amarelo: a cor e dele, a legibilidade e nossa.
 */
export function corDoTextoSobre(fundo: string): string {
  return contraste(fundo, "#FFFFFF") >= contraste(fundo, "#111111")
    ? "#FFFFFF"
    : "#111111";
}

function misturar(cor: string, alvo: string, proporcao: number): string {
  const a = paraRgb(cor);
  const b = paraRgb(alvo);
  return paraHex({
    r: a.r + (b.r - a.r) * proporcao,
    g: a.g + (b.g - a.g) * proporcao,
    b: a.b + (b.b - a.b) * proporcao,
  });
}

export type Paleta = {
  primaria: string;
  secundaria: string;
  /** Texto legivel sobre a primaria (botao, menu, faixa). */
  sobrePrimaria: string;
  sobreSecundaria: string;
  /** Primaria mais escura, para o estado de clique. */
  primariaEscura: string;
  /** Fundo levissimo da mesma familia, para cartao em destaque. */
  primariaClara: string;
  /** Borda e separador na familia da marca, em vez de cinza generico. */
  primariaSuave: string;
  /**
   * A cor de destaque escurecida ate ser LIDA sobre fundo claro (4,5:1).
   * Ouro puro sobre branco fica em 2:1: serve para filete e selo, nao para
   * letra. O sobretitulo usa esta.
   */
  secundariaTexto: string;

  /* --- O menu lateral escuro ------------------------------------------ */

  /** Fundo da barra lateral. */
  menuFundo: string;
  /** Fundo do item sob o cursor, um degrau acima do fundo. */
  menuRealce: string;
  /** Separador entre os blocos da barra. */
  menuBorda: string;
  /** Texto dos itens em repouso: legivel, sem competir com o item atual. */
  menuTexto: string;
  /** Texto de apoio (o cargo, embaixo do nome). */
  menuTextoFraco: string;
  /** Fundo do item atual. */
  menuAtivo: string;
  /** Texto sobre o item atual. */
  menuSobreAtivo: string;
};

/** Quase preto com um fio de azul, para onde toda cor de marca e puxada. */
const FUNDO_DO_MENU = "#0B1220";

/**
 * O item atual precisa saltar do fundo escuro.
 *
 * A cor de destaque do escritorio e a primeira escolha — e dele, e e o que a
 * foto de referencia faz com o dourado. Mas um escritorio de marca escura
 * (marinho sobre marinho, grafite sobre grafite) produziria uma pilula
 * invisivel: o "estou aqui" sumiria exatamente na barra onde ele mais
 * importa. Quando isso acontece, a mesma cor e clareada ate destacar, o que
 * preserva a identidade sem custar a orientacao.
 *
 * O 3.0 nao e o limiar de texto (4.5): aqui o que precisa ser percebido e um
 * BLOCO de cor, nao uma letra. O texto sobre o bloco e escolhido depois, por
 * corDoTextoSobre, e esse sim fecha contraste de leitura.
 */
/**
 * A mesma cor, puxada para o preto ate fechar 4,5:1 sobre TODOS os fundos
 * claros do sistema (branco do cartao e off-white da pagina). Continua da
 * familia — ouro vira bronze —, so que legivel.
 */
export function textoLegivelSobre(cor: string, fundos: string[] = ["#FFFFFF", "#F6F7F8"]): string {
  let candidata = cor;
  for (let passo = 0; passo < 20 && fundos.some((f) => contraste(candidata, f) < 4.5); passo += 1) {
    candidata = misturar(candidata, "#000000", 0.08);
  }
  return candidata;
}

function destaqueVisivelSobre(cor: string, fundo: string): string {
  let candidata = cor;
  for (let passo = 0; passo < 8 && contraste(candidata, fundo) < 3; passo += 1) {
    candidata = misturar(candidata, "#FFFFFF", 0.18);
  }
  return candidata;
}

/**
 * A paleta inteira a partir das duas cores escolhidas.
 *
 * Derivar em vez de perguntar e o que faz o resultado parecer desenhado: as
 * variacoes ficam na mesma familia, os contrastes fecham, e nenhum escritorio
 * consegue produzir a combinacao que ninguem le.
 */
export function paletaDe(primaria: string, secundaria: string): Paleta {
  const p = exigirCor(primaria, "principal");
  const s = exigirCor(secundaria, "de destaque");
  return {
    primaria: p,
    secundaria: s,
    sobrePrimaria: corDoTextoSobre(p),
    sobreSecundaria: corDoTextoSobre(s),
    primariaEscura: misturar(p, "#000000", 0.18),
    primariaClara: misturar(p, "#FFFFFF", 0.94),
    primariaSuave: misturar(p, "#FFFFFF", 0.78),
    secundariaTexto: textoLegivelSobre(s),
    ...menuDe(p, s),
  };
}

/**
 * O menu escuro, derivado das duas cores do escritorio.
 *
 * Nao e azul-marinho fixo: a barra puxa a cor PRINCIPAL do escritorio para
 * perto do preto, e o resultado tem o tom da marca sem deixar de ser escuro.
 * Um escritorio verde ganha uma barra quase preta esverdeada; um vermelho,
 * quase preta avermelhada. 88% de preto e bastante: sobra o suficiente para
 * reconhecer a familia da cor e nao o bastante para a barra brigar com o
 * conteudo.
 *
 * O item atual usa a cor de DESTAQUE, como na referencia — e o papel dela no
 * sistema, e e o que separa o menu de um bloco cinza qualquer.
 */
function menuDe(primaria: string, secundaria: string) {
  const fundo = misturar(primaria, FUNDO_DO_MENU, 0.88);
  const ativo = destaqueVisivelSobre(secundaria, fundo);
  return {
    menuFundo: fundo,
    menuRealce: misturar(fundo, "#FFFFFF", 0.1),
    menuBorda: misturar(fundo, "#FFFFFF", 0.16),
    menuTexto: misturar(fundo, "#FFFFFF", 0.78),
    menuTextoFraco: misturar(fundo, "#FFFFFF", 0.52),
    menuAtivo: ativo,
    menuSobreAtivo: corDoTextoSobre(ativo),
  };
}

/**
 * As variaveis CSS que o <body> recebe. Chave e valor, nada de texto solto.
 *
 * `--marca-contraste` era branco fixo no CSS, o que quebrava para escritorio
 * de cor clara: botao branco sobre fundo claro nao se le. Agora ela e
 * calculada, e todo lugar que ja a usava passou a funcionar sozinho.
 */
export function variaveisDaPaleta(paleta: Paleta): Record<string, string> {
  return {
    "--marca-primaria": paleta.primaria,
    "--marca-secundaria": paleta.secundaria,
    "--marca-contraste": paleta.sobrePrimaria,
    "--marca-contraste-secundaria": paleta.sobreSecundaria,
    "--marca-primaria-escura": paleta.primariaEscura,
    "--marca-primaria-clara": paleta.primariaClara,
    "--marca-primaria-suave": paleta.primariaSuave,
    "--marca-secundaria-texto": paleta.secundariaTexto,
    "--menu-fundo": paleta.menuFundo,
    "--menu-realce": paleta.menuRealce,
    "--menu-borda": paleta.menuBorda,
    "--menu-texto": paleta.menuTexto,
    "--menu-texto-fraco": paleta.menuTextoFraco,
    "--menu-ativo": paleta.menuAtivo,
    "--menu-sobre-ativo": paleta.menuSobreAtivo,
  };
}

/**
 * A cor principal serve para ESCREVER sobre fundo branco?
 *
 * Esta e a pergunta certa, e nao "da para ler texto sobre ela": sobre a cor a
 * gente escolhe preto ou branco automaticamente, entao esse lado nunca
 * quebra. O que quebra e o outro — a cor da marca tambem aparece como TEXTO
 * em fundo claro (etiqueta, link, titulo de secao), e ai nao ha escolha a
 * fazer: se a cor for clara demais, esse texto some.
 *
 * Nao recusa; a cor e do escritorio. Avisa, porque quem escolhe um bege do
 * catalogo da identidade impressa nao esta pedindo etiqueta ilegivel.
 */
export function avisoSobreContraste(cor: string): string | null {
  if (contraste(cor, "#FFFFFF") >= 4.5) return null;
  return (
    "Esta cor e clara demais para escrever sobre fundo branco: etiquetas e " +
    "links nela ficam dificeis de ler. Uma versao mais escura da mesma cor " +
    "resolve, e mantem a identidade."
  );
}

/**
 * Nome fixo do logotipo no volume do escritorio.
 *
 * Fixo de proposito: um escritorio tem um logotipo, e substituir apaga o
 * anterior. Guardar historico de logotipo seria lixo crescendo para sempre.
 */
export const ID_DO_LOGO = "logotipo";

/** Tipos de imagem aceitos como logotipo, e o teto. */
export const TIPOS_DE_LOGO = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
export const LOGO_MAXIMO_BYTES = 1024 * 1024;
