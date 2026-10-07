// A peca em PDF.
//
// POR QUE ESTE ARQUIVO EXISTE: o .docx e o documento do escritorio — o papel
// dele, a fonte dele, o timbre dele. Mas quem recebe um contrato para assinar
// quase sempre recebe um PDF: e o que nao muda de lugar quando abre em outro
// computador, e o que se imprime igual, e o que a assinatura eletronica quer.
//
// O QUE ESTE PDF E: o MESMO TEXTO da peca, com os mesmos valores, desenhado
// pelo BirdJud em A4 com as margens do modelo. O que ele NAO e: uma conversao
// fiel do .docx. Nao existe Word aqui dentro. Timbre em imagem, tabela, recuo
// especial e fonte propria do escritorio nao atravessam — e por isso a tela
// diz isso em voz alta antes de alguem clicar.
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { Alinhamento, ParagrafoLido } from "./modelos";

/** A4 em pontos, que e a unidade do PDF. */
export const PAGINA = { largura: 595.28, altura: 841.89 };

/**
 * As mesmas margens do modelo que o sistema gera (ver docx.ts), convertidas de
 * twips para pontos: 1 ponto = 20 twips. Peca que sai do .docx e peca que sai
 * do PDF tem de cair no mesmo lugar da folha.
 */
export const MARGEM = {
  topo: 1418 / 20,
  direita: 1134 / 20,
  baixo: 1134 / 20,
  esquerda: 1701 / 20,
};

/** A faixa de texto da folha: o que sobra entre as margens. */
export const LARGURA_UTIL = PAGINA.largura - MARGEM.esquerda - MARGEM.direita;

const TAMANHO = 12;
/** Entrelinha de 1,5 — como se le um contrato, nao como se le um bilhete. */
const ENTRELINHA = TAMANHO * 1.5;
/**
 * Quanto o espaco entre palavras pode esticar antes de o justificado feiar.
 *
 * O Word nao tem limite: ele estica o que precisar. Aqui ha um, porque uma
 * linha com duas palavras esticadas de ponta a ponta da folha parece defeito.
 * Mas o limite tem de ser FOLGADO: uma linha comum de contrato, antes de uma
 * palavra longa como "substabelecimento", precisa de quatro vezes o espaco
 * normal — e cortar ali deixava uma linha alinhada a esquerda no meio de um
 * paragrafo justificado, que parece defeito do mesmo jeito.
 */
const ESTICAMENTO_MAXIMO = 5;

/**
 * Caracteres que o PDF com fonte padrao nao escreve, e o que escrever no lugar.
 *
 * As fontes padrao do PDF usam WinAnsi, que e Latin-1 com acrescimos: todo o
 * portugues cabe. O que nao cabe e o que entra por copiar e colar de outro
 * programa — espaco fino, travessao de outra tabela, aspas de outra familia.
 * Trocar por um equivalente e melhor que recusar a peca, e MUITO melhor que
 * deixar um quadrado preto no meio de uma clausula.
 */
const EQUIVALENTE: Record<string, string> = {
  "\t": "    ",
  " ": " ", // espaco sem quebra
  " ": " ",
  " ": " ",
  " ": " ",
  "​": "",
  "‑": "-", // hifen sem quebra
  "‒": "-",
  "−": "-", // sinal de menos
  "ʼ": "'",
  "′": "'",
  "″": '"',
  "­": "", // hifen condicional
  "﻿": "",
};

/**
 * O texto que a fonte consegue escrever, e o que teve de ser trocado.
 *
 * Pergunta a propria fonte, caractere por caractere, em vez de carregar uma
 * tabela que um dia discorda da biblioteca. O resultado fica guardado porque a
 * mesma letra aparece milhares de vezes em um contrato.
 */
function criarPeneira(fonte: PDFFont) {
  const sabido = new Map<string, boolean>();
  const cabe = (c: string): boolean => {
    const guardado = sabido.get(c);
    if (guardado !== undefined) return guardado;
    let ok = true;
    try {
      fonte.widthOfTextAtSize(c, TAMANHO);
    } catch {
      ok = false;
    }
    sabido.set(c, ok);
    return ok;
  };

  return function peneirar(texto: string, trocados: Set<string>): string {
    let saida = "";
    for (const c of texto) {
      const trocado = EQUIVALENTE[c];
      if (trocado !== undefined) {
        saida += trocado;
        continue;
      }
      if (cabe(c)) {
        saida += c;
        continue;
      }
      // Fica a marca de que algo foi retirado: a tela avisa qual, e quem
      // confere decide se aquilo importava.
      trocados.add(c);
      saida += "?";
    }
    return saida;
  };
}

/** Um grupo de pedacos colados, que a quebra de linha nao separa. */
type Unidade = {
  pedacos: Array<{ texto: string; negrito: boolean }>;
  largura: number;
  /** Quantos espacos vem antes desta unidade. */
  espacos: number;
};

type Fontes = { normal: PDFFont; negrito: PDFFont };

function larguraDe(pedaco: { texto: string; negrito: boolean }, f: Fontes): number {
  return (pedaco.negrito ? f.negrito : f.normal).widthOfTextAtSize(pedaco.texto, TAMANHO);
}

/**
 * Os pedacos do paragrafo agrupados no que nao se separa.
 *
 * `espacos: 0` quer dizer colado no anterior — e o caso de "CLAUSULA" em
 * negrito seguido de ":" sem negrito. Quebrar a linha ali deixaria os dois
 * pontos sozinhos no comeco da linha de baixo.
 */
function unidadesDe(
  pedacos: Array<{ texto: string; negrito: boolean; espacos: number }>,
  f: Fontes,
): Unidade[] {
  const unidades: Unidade[] = [];
  for (const p of pedacos) {
    if (unidades.length === 0 || p.espacos > 0) {
      unidades.push({ pedacos: [p], largura: larguraDe(p, f), espacos: p.espacos });
    } else {
      const atual = unidades[unidades.length - 1];
      atual.pedacos.push(p);
      atual.largura += larguraDe(p, f);
    }
  }
  return unidades;
}

/** Palavra mais larga que a linha: reparte na forca, sem hifen inventado. */
function repartirLarga(u: Unidade, limite: number, f: Fontes): Unidade[] {
  const partes: Unidade[] = [];
  for (const pedaco of u.pedacos) {
    let atual = "";
    for (const c of pedaco.texto) {
      const tentativa = atual + c;
      const largura = larguraDe({ texto: tentativa, negrito: pedaco.negrito }, f);
      if (largura > limite && atual !== "") {
        partes.push({
          pedacos: [{ texto: atual, negrito: pedaco.negrito }],
          largura: larguraDe({ texto: atual, negrito: pedaco.negrito }, f),
          espacos: partes.length === 0 ? u.espacos : 0,
        });
        atual = c;
      } else {
        atual = tentativa;
      }
    }
    if (atual !== "") {
      partes.push({
        pedacos: [{ texto: atual, negrito: pedaco.negrito }],
        largura: larguraDe({ texto: atual, negrito: pedaco.negrito }, f),
        espacos: partes.length === 0 ? u.espacos : 0,
      });
    }
  }
  return partes.length > 0 ? partes : [u];
}

type Linha = { unidades: Unidade[]; ultima: boolean };

/** As linhas de um paragrafo, dentro da largura util. */
function quebrar(unidades: Unidade[], limite: number, f: Fontes): Linha[] {
  const espaco = f.normal.widthOfTextAtSize(" ", TAMANHO);
  const linhas: Linha[] = [];
  let atual: Unidade[] = [];
  let largura = 0;

  const fechar = () => {
    if (atual.length > 0) linhas.push({ unidades: atual, ultima: false });
    atual = [];
    largura = 0;
  };

  for (const bruta of unidades) {
    const pedacos = bruta.largura > limite ? repartirLarga(bruta, limite, f) : [bruta];
    for (const u of pedacos) {
      const acrescimo = (atual.length > 0 ? espaco * u.espacos : 0) + u.largura;
      if (atual.length > 0 && largura + acrescimo > limite) fechar();
      atual.push(u);
      largura += atual.length === 1 ? u.largura : acrescimo;
    }
  }
  fechar();
  if (linhas.length > 0) linhas[linhas.length - 1].ultima = true;
  return linhas;
}

/** Um pedaco ja colocado na folha: onde comeca, quanto ocupa. */
export type PedacoPosto = {
  texto: string;
  negrito: boolean;
  x: number;
  largura: number;
};

export type LinhaPosta = {
  pedacos: PedacoPosto[];
  /** A pagina, de 1 em diante. */
  pagina: number;
  y: number;
};

/** Onde cada pedaco da linha comeca, conforme o alinhamento. */
function posicionar(
  linha: Linha,
  alinhamento: Alinhamento,
  f: Fontes,
): PedacoPosto[] {
  const espaco = f.normal.widthOfTextAtSize(" ", TAMANHO);
  const somaPalavras = linha.unidades.reduce((t, u) => t + u.largura, 0);
  // Os vaos sao contados em ESPACOS, nao em palavras: "Nome:      CPF:" tem um
  // vao de seis espacos, e esticar os seis como se fosse um fecharia a linha de
  // preencher a mao.
  const vaos = linha.unidades.slice(1).reduce((t, u) => t + u.espacos, 0);

  let x = MARGEM.esquerda;
  let entrePalavras = espaco;

  if (alinhamento === "JUSTIFICADO" && !linha.ultima && vaos > 0) {
    const preciso = (LARGURA_UTIL - somaPalavras) / vaos;
    // Linha curta demais para justificar — tres palavras na largura da folha
    // viram tres palavras com um palmo entre elas. Melhor alinhar a esquerda.
    entrePalavras =
      preciso > espaco * ESTICAMENTO_MAXIMO ? espaco : Math.max(preciso, espaco);
  } else if (alinhamento === "CENTRO") {
    x = MARGEM.esquerda + (LARGURA_UTIL - somaPalavras - vaos * espaco) / 2;
  } else if (alinhamento === "DIREITA") {
    x = MARGEM.esquerda + (LARGURA_UTIL - somaPalavras - vaos * espaco);
  }

  const postos: PedacoPosto[] = [];
  for (let i = 0; i < linha.unidades.length; i++) {
    if (i > 0) x += entrePalavras * linha.unidades[i].espacos;
    for (const p of linha.unidades[i].pedacos) {
      const largura = larguraDe(p, f);
      postos.push({ texto: p.texto, negrito: p.negrito, x, largura });
      x += largura;
    }
  }
  return postos;
}

export type Diagramacao = {
  linhas: LinhaPosta[];
  paginas: number;
  caracteresTrocados: string[];
};

/**
 * Onde cada palavra da peca cai na folha — sem desenhar nada.
 *
 * Separado do desenho de proposito: e esta conta que erra calada. Linha que
 * passa da margem, justificado que estica alem do razoavel e palavra maior que
 * a folha nao dao erro nenhum, so saem feios no papel do cliente. Separada,
 * da para medir em teste.
 */
export async function diagramar(paragrafos: ParagrafoLido[]): Promise<Diagramacao> {
  const pdf = await PDFDocument.create();
  const fontes: Fontes = {
    normal: await pdf.embedFont(StandardFonts.TimesRoman),
    negrito: await pdf.embedFont(StandardFonts.TimesRomanBold),
  };
  return diagramarCom(paragrafos, fontes, criarPeneira(fontes.normal));
}

function diagramarCom(
  paragrafos: ParagrafoLido[],
  fontes: Fontes,
  peneirar: (texto: string, trocados: Set<string>) => string,
): Diagramacao {
  const trocados = new Set<string>();
  const linhas: LinhaPosta[] = [];
  let pagina = 1;
  let y = PAGINA.altura - MARGEM.topo - TAMANHO;

  const descer = () => {
    y -= ENTRELINHA;
    if (y < MARGEM.baixo) {
      pagina += 1;
      y = PAGINA.altura - MARGEM.topo - TAMANHO;
    }
  };

  for (const p of paragrafos) {
    if (p.vazio) {
      descer();
      continue;
    }
    const limpos = p.pedacos.map((pd) => ({
      texto: peneirar(pd.texto, trocados),
      negrito: pd.negrito,
      espacos: pd.espacos,
    }));
    for (const linha of quebrar(unidadesDe(limpos, fontes), LARGURA_UTIL, fontes)) {
      linhas.push({ pedacos: posicionar(linha, p.alinhamento, fontes), pagina, y });
      descer();
    }
  }

  return { linhas, paginas: pagina, caracteresTrocados: [...trocados].sort() };
}

export type PdfPronto = {
  arquivo: Buffer;
  paginas: number;
  /** Caracteres que a fonte do PDF nao escreve e sairam como "?". */
  caracteresTrocados: string[];
};

/**
 * Desenha a peca em PDF.
 *
 * Paragrafo vazio vale uma linha em branco: e assim que o modelo separa as
 * clausulas, e engolir isso juntaria o contrato inteiro em um bloco.
 */
export async function montarPdf(
  paragrafos: ParagrafoLido[],
  meta: { titulo?: string } = {},
): Promise<PdfPronto> {
  const pdf = await PDFDocument.create();
  const fontes: Fontes = {
    normal: await pdf.embedFont(StandardFonts.TimesRoman),
    negrito: await pdf.embedFont(StandardFonts.TimesRomanBold),
  };
  const peneirar = criarPeneira(fontes.normal);
  const trocados = new Set<string>();

  pdf.setProducer("BirdJud");
  pdf.setCreator("BirdJud");
  if (meta.titulo) pdf.setTitle(peneirar(meta.titulo, trocados));

  const conta = diagramarCom(paragrafos, fontes, peneirar);

  // Uma pagina para cada uma que a conta pediu, inclusive quando a peca cabe em
  // menos de uma: documento sem folha nenhuma nao abre em visualizador algum.
  const folhas: PDFPage[] = [];
  for (let i = 0; i < Math.max(conta.paginas, 1); i++) {
    folhas.push(pdf.addPage([PAGINA.largura, PAGINA.altura]));
  }

  for (const linha of conta.linhas) {
    const folha = folhas[linha.pagina - 1];
    for (const p of linha.pedacos) {
      folha.drawText(p.texto, {
        x: p.x,
        y: linha.y,
        size: TAMANHO,
        font: p.negrito ? fontes.negrito : fontes.normal,
      });
    }
  }

  const bytes = await pdf.save();
  return {
    arquivo: Buffer.from(bytes),
    paginas: pdf.getPageCount(),
    caracteresTrocados: [...new Set([...trocados, ...conta.caracteresTrocados])].sort(),
  };
}
