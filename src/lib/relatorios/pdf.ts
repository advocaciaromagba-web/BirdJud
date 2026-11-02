// Desenha o relatorio em PDF (A4 deitado) com o pdf-lib que o sistema ja usa
// para as pecas. Nenhuma biblioteca nova: grafico no servidor costuma trazer
// navegador ou canvas junto, pesado demais para o mesmo conteiner.
//
// Regras do desenho:
// - pagina deitada, porque a tabela de cobrancas tem nove colunas;
// - cabecalho com o escritorio em toda pagina, cabecalho da tabela repetido
//   depois da quebra, rodape com a data de emissao e a numeracao;
// - grafico com escala que comeca no zero: barra que comeca no meio faz 5%
//   parecer o dobro.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type { Bloco, Relatorio } from "./dados";
import { reais } from "./dados";

const LARGURA = 841.89;
const ALTURA = 595.28;
const MARGEM = 36;
const UTIL = LARGURA - MARGEM * 2;

const COR = {
  texto: rgb(0.12, 0.13, 0.16),
  suave: rgb(0.42, 0.44, 0.48),
  linha: rgb(0.86, 0.87, 0.89),
  fundo: rgb(0.96, 0.97, 0.98),
  marca: rgb(0.06, 0.16, 0.32),
  bom: rgb(0.05, 0.47, 0.3),
  ruim: rgb(0.72, 0.11, 0.11),
  azul: rgb(0.16, 0.47, 0.84),
  verde: rgb(0.11, 0.62, 0.42),
  vermelho: rgb(0.85, 0.3, 0.2),
  dourado: rgb(0.83, 0.62, 0.15),
};

/** Fonte padrao do PDF so tem o alfabeto WinAnsi: o resto vira equivalente. */
function limpar(texto: string): string {
  return texto
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[→⇒]/g, "->")
    .replace(/[^\x20-\x7e -ÿ–—•€]/g, "");
}

type Ctx = {
  pdf: PDFDocument;
  pagina: PDFPage;
  y: number;
  normal: PDFFont;
  negrito: PDFFont;
  relatorio: Relatorio;
  paginas: PDFPage[];
};

function escrever(ctx: Ctx, texto: string, x: number, y: number, opc: { tam?: number; negrito?: boolean; cor?: RGB; largura?: number; direita?: boolean } = {}) {
  const fonte = opc.negrito ? ctx.negrito : ctx.normal;
  const tam = opc.tam ?? 9;
  let t = limpar(texto);
  // Nao cabe: corta e poe reticencias, sem passar da coluna.
  if (opc.largura && fonte.widthOfTextAtSize(t, tam) > opc.largura) {
    while (t.length > 1 && fonte.widthOfTextAtSize(`${t}...`, tam) > opc.largura) t = t.slice(0, -1);
    t = `${t.trimEnd()}...`;
  }
  const w = fonte.widthOfTextAtSize(t, tam);
  ctx.pagina.drawText(t, { x: opc.direita && opc.largura ? x + opc.largura - w : x, y, size: tam, font: fonte, color: opc.cor ?? COR.texto });
}

function novaPagina(ctx: Ctx) {
  ctx.pagina = ctx.pdf.addPage([LARGURA, ALTURA]);
  ctx.paginas.push(ctx.pagina);
  // Cabecalho: escritorio a esquerda, relatorio e periodo a direita.
  escrever(ctx, ctx.relatorio.escritorio, MARGEM, ALTURA - MARGEM - 4, { tam: 11, negrito: true, cor: COR.marca, largura: UTIL / 2 });
  const direita = `${ctx.relatorio.titulo} · ${ctx.relatorio.periodo.rotulo}`;
  escrever(ctx, direita, MARGEM + UTIL / 2, ALTURA - MARGEM - 4, { tam: 9, cor: COR.suave, largura: UTIL / 2, direita: true });
  ctx.pagina.drawLine({ start: { x: MARGEM, y: ALTURA - MARGEM - 12 }, end: { x: LARGURA - MARGEM, y: ALTURA - MARGEM - 12 }, thickness: 0.8, color: COR.marca });
  ctx.y = ALTURA - MARGEM - 30;
}

function garantir(ctx: Ctx, altura: number) {
  if (ctx.y - altura < MARGEM + 20) novaPagina(ctx);
}

function desenharResumo(ctx: Ctx, bloco: Extract<Bloco, { tipo: "resumo" }>) {
  const porLinha = Math.min(bloco.itens.length, 6);
  const largura = (UTIL - (porLinha - 1) * 8) / porLinha;
  const linhas = Math.ceil(bloco.itens.length / porLinha);
  garantir(ctx, linhas * 50);
  bloco.itens.forEach((item, i) => {
    const col = i % porLinha;
    const lin = Math.floor(i / porLinha);
    const x = MARGEM + col * (largura + 8);
    const topo = ctx.y - lin * 50;
    ctx.pagina.drawRectangle({ x, y: topo - 42, width: largura, height: 42, color: COR.fundo, borderColor: COR.linha, borderWidth: 0.6 });
    escrever(ctx, item.rotulo.toUpperCase(), x + 8, topo - 14, { tam: 7, negrito: true, cor: COR.suave, largura: largura - 16 });
    escrever(ctx, item.valor, x + 8, topo - 32, { tam: 13, negrito: true, cor: item.tom === "bom" ? COR.bom : item.tom === "ruim" ? COR.ruim : COR.texto, largura: largura - 16 });
  });
  ctx.y -= linhas * 50 + 8;
}

function desenharTexto(ctx: Ctx, texto: string) {
  const palavras = limpar(texto).split(/\s+/);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (ctx.normal.widthOfTextAtSize(tentativa, 8.5) > UTIL) {
      linhas.push(atual);
      atual = p;
    } else atual = tentativa;
  }
  if (atual) linhas.push(atual);
  garantir(ctx, linhas.length * 12 + 6);
  for (const l of linhas) {
    escrever(ctx, l, MARGEM, ctx.y, { tam: 8.5, cor: COR.suave });
    ctx.y -= 12;
  }
  ctx.y -= 6;
}

function rotuloDoEixo(valor: number, formato: "dinheiro" | "numero"): string {
  if (formato === "numero") return String(Math.round(valor));
  const r = valor / 100;
  if (Math.abs(r) >= 1_000_000) return `R$ ${(r / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(r) >= 1_000) return `R$ ${(r / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return reais(valor).replace(",00", "");
}

/** Um teto "redondo" para a escala: 1, 2 ou 5 vezes uma potencia de dez. */
function tetoRedondo(maximo: number): number {
  if (maximo <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(maximo));
  for (const m of [1, 2, 5, 10]) if (m * potencia >= maximo) return m * potencia;
  return 10 * potencia;
}

function desenharGrafico(ctx: Ctx, bloco: Extract<Bloco, { tipo: "grafico" }>) {
  const altura = 170;
  garantir(ctx, altura + 40);
  escrever(ctx, bloco.titulo, MARGEM, ctx.y, { tam: 10, negrito: true });
  // Legenda a direita do titulo.
  let xLeg = LARGURA - MARGEM;
  for (const s of [...bloco.series].reverse()) {
    const w = ctx.normal.widthOfTextAtSize(limpar(s.nome), 8);
    xLeg -= w;
    escrever(ctx, s.nome, xLeg, ctx.y, { tam: 8, cor: COR.suave });
    xLeg -= 12;
    ctx.pagina.drawRectangle({ x: xLeg, y: ctx.y - 1, width: 8, height: 8, color: COR[s.cor] });
    xLeg -= 12;
  }
  ctx.y -= 14;

  const eixoX = MARGEM + 60;
  const base = ctx.y - altura + 18;
  const topo = ctx.y - 6;
  const largura = LARGURA - MARGEM - eixoX;
  const minimo = Math.min(0, ...bloco.pontos.flatMap((p) => p.valores));
  const maximo = Math.max(0, ...bloco.pontos.flatMap((p) => p.valores));
  const teto = tetoRedondo(maximo);
  const piso = minimo < 0 ? -tetoRedondo(-minimo) : 0;
  const escala = (v: number) => base + ((v - piso) / (teto - piso || 1)) * (topo - base);

  for (let i = 0; i <= 4; i++) {
    const v = piso + ((teto - piso) * i) / 4;
    const y = escala(v);
    ctx.pagina.drawLine({ start: { x: eixoX, y }, end: { x: eixoX + largura, y }, thickness: v === 0 ? 0.9 : 0.4, color: v === 0 ? COR.suave : COR.linha });
    escrever(ctx, rotuloDoEixo(v, bloco.formato), MARGEM, y - 3, { tam: 7, cor: COR.suave, largura: 54, direita: true });
  }

  const n = Math.max(1, bloco.pontos.length);
  const passo = largura / n;
  const grupo = Math.min(passo * 0.7, 18 * bloco.series.length + 6);
  const barra = grupo / bloco.series.length;
  const zero = escala(0);
  bloco.pontos.forEach((p, i) => {
    const x0 = eixoX + i * passo + (passo - grupo) / 2;
    p.valores.forEach((v, j) => {
      const y = escala(v);
      if (v !== 0) {
        ctx.pagina.drawRectangle({
          x: x0 + j * barra,
          y: Math.min(y, zero),
          width: Math.max(1, barra - 1.5),
          height: Math.max(0.8, Math.abs(y - zero)),
          color: COR[bloco.series[j]?.cor ?? "azul"],
        });
      }
    });
    // Rotulo da categoria; com muitos pontos, um sim um nao.
    if (n <= 14 || i % Math.ceil(n / 14) === 0) {
      escrever(ctx, p.rotulo, eixoX + i * passo, base - 12, { tam: 7, cor: COR.suave, largura: Math.max(passo, 40) });
    }
  });
  ctx.y = base - 26;
}

function desenharTabela(ctx: Ctx, bloco: Extract<Bloco, { tipo: "tabela" }>) {
  const total = bloco.colunas.reduce((t, c) => t + c.largura, 0);
  const fator = total > UTIL ? UTIL / total : 1;
  const colunas = bloco.colunas.map((c) => ({ ...c, largura: c.largura * fator }));
  const alturaLinha = 14;

  const cabecalho = () => {
    ctx.pagina.drawRectangle({ x: MARGEM, y: ctx.y - 4, width: colunas.reduce((t, c) => t + c.largura, 0), height: alturaLinha, color: COR.marca });
    let x = MARGEM;
    for (const c of colunas) {
      escrever(ctx, c.titulo, x + 4, ctx.y, { tam: 7.5, negrito: true, cor: rgb(1, 1, 1), largura: c.largura - 8, direita: c.direita });
      x += c.largura;
    }
    ctx.y -= alturaLinha;
  };

  garantir(ctx, (bloco.titulo ? 18 : 0) + alturaLinha * 3);
  if (bloco.titulo) {
    escrever(ctx, bloco.titulo, MARGEM, ctx.y, { tam: 10, negrito: true });
    ctx.y -= 16;
  }
  cabecalho();
  if (!bloco.linhas.length) {
    escrever(ctx, bloco.vazio ?? "Nada no período.", MARGEM + 4, ctx.y, { tam: 8.5, cor: COR.suave });
    ctx.y -= alturaLinha + 8;
    return;
  }
  const alerta = new Set(bloco.alerta ?? []);
  bloco.linhas.forEach((linha, i) => {
    if (ctx.y - alturaLinha < MARGEM + 20) {
      novaPagina(ctx);
      // Depois da quebra, o cabecalho volta: tabela sem titulo nao se le.
      cabecalho();
    }
    if (i % 2 === 1) {
      ctx.pagina.drawRectangle({ x: MARGEM, y: ctx.y - 4, width: colunas.reduce((t, c) => t + c.largura, 0), height: alturaLinha, color: COR.fundo });
    }
    let x = MARGEM;
    linha.forEach((celula, j) => {
      const c = colunas[j];
      if (!c) return;
      escrever(ctx, celula, x + 4, ctx.y, { tam: 7.5, cor: alerta.has(i) ? COR.ruim : COR.texto, largura: c.largura - 8, direita: c.direita });
      x += c.largura;
    });
    ctx.y -= alturaLinha;
  });
  ctx.y -= 10;
}

export async function gerarPdfDoRelatorio(relatorio: Relatorio, emitidoEm = new Date()): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(limpar(`${relatorio.titulo} - ${relatorio.escritorio}`));
  pdf.setProducer("BirdJud");
  const ctx: Ctx = {
    pdf,
    pagina: undefined as unknown as PDFPage,
    y: 0,
    normal: await pdf.embedFont(StandardFonts.Helvetica),
    negrito: await pdf.embedFont(StandardFonts.HelveticaBold),
    relatorio,
    paginas: [],
  };
  novaPagina(ctx);
  escrever(ctx, relatorio.titulo, MARGEM, ctx.y, { tam: 16, negrito: true, cor: COR.marca });
  ctx.y -= 16;
  escrever(ctx, `${relatorio.subtitulo} · ${relatorio.periodo.rotulo}`, MARGEM, ctx.y, { tam: 9, cor: COR.suave, largura: UTIL });
  ctx.y -= 20;

  for (const bloco of relatorio.blocos) {
    if (bloco.tipo === "resumo") desenharResumo(ctx, bloco);
    else if (bloco.tipo === "texto") desenharTexto(ctx, bloco.texto);
    else if (bloco.tipo === "grafico") desenharGrafico(ctx, bloco);
    else desenharTabela(ctx, bloco);
  }

  const emitido = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(emitidoEm);
  ctx.paginas.forEach((p, i) => {
    ctx.pagina = p;
    escrever(ctx, `Emitido em ${emitido} pelo BirdJud`, MARGEM, MARGEM - 14, { tam: 7, cor: COR.suave });
    escrever(ctx, `Página ${i + 1} de ${ctx.paginas.length}`, LARGURA - MARGEM - 100, MARGEM - 14, { tam: 7, cor: COR.suave, largura: 100, direita: true });
  });
  return pdf.save();
}
