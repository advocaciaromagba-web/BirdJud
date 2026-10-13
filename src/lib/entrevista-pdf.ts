// O registro da entrevista em PDF — espelhado do sistema da Advocacia Roma.
// Vai para a pasta do cliente e serve de prova do que foi dito e anotado.
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import type { AnaliseDaEntrevista } from "./entrevista";

const MARGEM_X = 62;
const TOPO = 70;
const BASE = 60;
const LARGURA_A4 = 595.28;
const ALTURA_A4 = 841.89;

const NAVY = rgb(0.09, 0.14, 0.24);
const CINZA = rgb(0.42, 0.45, 0.5);
const OURO = rgb(0.69, 0.56, 0.21);

const ORIGEM_TEXTO: Record<string, string> = {
  LOCAL: "transcrição por voz processada no próprio computador do escritório",
  NUVEM: "transcrição por voz processada por serviço externo de reconhecimento de fala",
  DIGITADA: "conteúdo digitado manualmente durante o atendimento",
  AUDIO_ENVIADO: "gravação da conversa transcrita automaticamente a partir do áudio",
  AUDIO_GRAVADO: "conversa gravada no sistema e transcrita automaticamente pela OpenAI durante o atendimento",
};

export type DadosPdfEntrevista = {
  /** Nome do escritorio, no alto de cada pagina e no aviso final. */
  escritorio: string;
  titulo: string;
  nomeCliente: string;
  /** Como o PDF chama quem foi ouvido: Cliente, Testemunha, Entrevistado. */
  rotuloDoEntrevistado?: string;
  documentoCliente: string | null;
  nomeAdvogado: string;
  iniciadaEm: Date;
  encerradaEm: Date | null;
  origemTranscricao: string;
  transcricao: string;
  anotacoes: string;
  analise: AnaliseDaEntrevista | null;
  tipoAcao: string | null;
  perguntas: string[] | null;
};

function dataHoraBR(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(d);
}

/**
 * Quebra o texto em linhas que cabem na largura útil. A fonte padrão do PDF
 * não tem quebra automática, então é feito na mão.
 */
function quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const linhas: string[] = [];
  for (const paragrafo of texto.split("\n")) {
    if (!paragrafo.trim()) {
      linhas.push("");
      continue;
    }
    let atual = "";
    for (const palavra of paragrafo.split(/\s+/)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) {
        atual = tentativa;
      } else {
        if (atual) linhas.push(atual);
        atual = palavra;
      }
    }
    if (atual) linhas.push(atual);
  }
  return linhas;
}

/**
 * A fonte padrão do PDF (WinAnsi) não aceita alguns caracteres que o
 * reconhecimento de voz produz — aspas curvas, travessão longo, reticências.
 * Trocamos pelos equivalentes simples para não quebrar a geração.
 */
function limpar(texto: string): string {
  return texto
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\x00-\xFF]/g, "");
}

export async function gerarPdfEntrevista(dados: DadosPdfEntrevista): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italico = await pdf.embedFont(StandardFonts.HelveticaOblique);


  const largura = LARGURA_A4 - MARGEM_X * 2;
  // Atribuída em novaPagina(), chamada logo antes do primeiro uso.
  let pagina!: PDFPage;
  let y = 0;

  function novaPagina() {
    pagina = pdf.addPage([LARGURA_A4, ALTURA_A4]);
    pagina.drawText(limpar(dados.escritorio), { x: MARGEM_X, y: ALTURA_A4 - 40, size: 9, font: negrito, color: OURO });
    pagina.drawText("Documento sujeito a sigilo profissional", {
      x: MARGEM_X,
      y: 30,
      size: 7.5,
      font: italico,
      color: CINZA,
    });
    y = ALTURA_A4 - TOPO;
  }

  function espaco(altura: number) {
    if (y - altura < BASE) novaPagina();
  }

  function escrever(
    texto: string,
    opcoes: { fonte?: PDFFont; tamanho?: number; cor?: any; recuo?: number; espacoDepois?: number } = {}
  ) {
    const fonte = opcoes.fonte ?? normal;
    const tamanho = opcoes.tamanho ?? 10.5;
    const cor = opcoes.cor ?? NAVY;
    const recuo = opcoes.recuo ?? 0;
    const alturaLinha = tamanho * 1.45;

    for (const linha of quebrar(limpar(texto), fonte, tamanho, largura - recuo)) {
      espaco(alturaLinha);
      if (linha) {
        pagina.drawText(linha, { x: MARGEM_X + recuo, y, size: tamanho, font: fonte, color: cor });
      }
      y -= alturaLinha;
    }
    y -= opcoes.espacoDepois ?? 0;
  }

  function titulo(texto: string) {
    espaco(40);
    y -= 10;
    escrever(texto.toUpperCase(), { fonte: negrito, tamanho: 11, cor: OURO });
    espaco(6);
    pagina.drawLine({
      start: { x: MARGEM_X, y: y + 6 },
      end: { x: MARGEM_X + largura, y: y + 6 },
      thickness: 0.6,
      color: OURO,
    });
    y -= 8;
  }

  function lista(itens: string[], vazio = "Nada registrado.") {
    if (itens.length === 0) {
      escrever(vazio, { fonte: italico, tamanho: 10, cor: CINZA, espacoDepois: 4 });
      return;
    }
    for (const item of itens) {
      escrever(`•  ${item}`, { recuo: 8, espacoDepois: 2 });
    }
    y -= 4;
  }

  novaPagina();

  // --- Cabeçalho ---
  escrever(dados.titulo, { fonte: negrito, tamanho: 15 });
  escrever("Registro de entrevista de triagem", { fonte: normal, tamanho: 10.5, cor: CINZA, espacoDepois: 12 });

  const encerrada = dados.encerradaEm ?? new Date();
  const ficha: [string, string][] = [
    [dados.rotuloDoEntrevistado ?? "Cliente", dados.nomeCliente],
    ["CPF/CNPJ", dados.documentoCliente || "não informado"],
    ["Atendimento por", dados.nomeAdvogado],
    ["Início", dataHoraBR(dados.iniciadaEm)],
    ["Encerramento", dataHoraBR(encerrada)],
  ];
  for (const [rotulo, valor] of ficha) {
    espaco(16);
    pagina.drawText(limpar(rotulo) + ":", { x: MARGEM_X, y, size: 10, font: negrito, color: NAVY });
    pagina.drawText(limpar(valor), { x: MARGEM_X + 105, y, size: 10, font: normal, color: NAVY });
    y -= 15;
  }
  y -= 8;

  // --- Roteiro de perguntas sugeridas ---
  if (dados.perguntas && dados.perguntas.length > 0) {
    titulo(`Roteiro de perguntas${dados.tipoAcao ? ` — ${dados.tipoAcao}` : ""}`);
    for (const [i, pergunta] of dados.perguntas.entries()) {
      escrever(`${i + 1}. ${pergunta}`, { recuo: 8, espacoDepois: 2 });
    }
    escrever("Sugestão da IA para orientar a entrevista — o advogado decide o que perguntar de fato.", {
      fonte: italico,
      tamanho: 8.5,
      cor: CINZA,
      espacoDepois: 8,
    });
  }

  // --- Análise organizada ---
  const a = dados.analise;
  if (a) {
    titulo("Resumo do caso");
    escrever(`Área: ${a.area}    |    Urgência indicada: ${a.urgencia}`, {
      fonte: negrito,
      tamanho: 10,
      espacoDepois: 4,
    });
    if (a.valorEnvolvido) escrever(`Valor mencionado: ${a.valorEnvolvido}`, { tamanho: 10, espacoDepois: 4 });
    escrever(a.resumo, { espacoDepois: 4 });

    titulo("Fatos relatados");
    lista(a.fatos);

    titulo("O que o cliente pretende");
    lista(a.pretensoes);

    titulo("Documentos que o cliente possui");
    lista(a.documentosCitados, "Nenhum documento mencionado.");

    titulo("Documentos a solicitar");
    lista(a.documentosQueFaltam, "Nenhum documento pendente identificado.");

    titulo("Testemunhas mencionadas");
    lista(a.testemunhas, "Nenhuma testemunha mencionada.");

    titulo("Pontos de atenção — a verificar pelo advogado");
    lista(a.pontosDeAtencao, "Nenhum ponto sinalizado.");

    titulo("Perguntas em aberto");
    lista(a.perguntasEmAberto, "Nenhuma pergunta pendente.");
  }

  // --- Anotações ---
  if (dados.anotacoes.trim()) {
    titulo("Anotações do advogado");
    escrever(dados.anotacoes.trim(), { espacoDepois: 4 });
  }

  // --- Transcrição na íntegra ---
  if (dados.transcricao.trim()) {
    novaPagina();
    titulo("Transcrição da entrevista");
    escrever(
      `Origem: ${ORIGEM_TEXTO[dados.origemTranscricao] ?? dados.origemTranscricao}. ` +
        "Texto reproduzido como capturado, sem correção — pode conter erros de reconhecimento.",
      { fonte: italico, tamanho: 9, cor: CINZA, espacoDepois: 8 }
    );
    escrever(dados.transcricao.trim(), { tamanho: 10 });
  }

  // --- Aviso final ---
  espaco(60);
  y -= 14;
  escrever(
    `Documento gerado automaticamente pelo sistema do escritório ${dados.escritorio} a partir da entrevista de ` +
      "triagem. O resumo e a organização por tópicos foram produzidos com auxílio de inteligência artificial " +
      "e constituem apoio ao atendimento, não parecer jurídico. O conteúdo deve ser conferido pelo " +
      "advogado responsável. Documento sujeito a sigilo profissional (art. 7º, II, da Lei 8.906/94).",
    { fonte: italico, tamanho: 8.5, cor: CINZA }
  );

  return pdf.save();
}

/** Nome de arquivo seguro para Windows e para o servidor de rede. */
export function nomeArquivoEntrevista(nomeCliente: string, data: Date): string {
  const limpo = limpar(nomeCliente)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  const iso = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(data);
  return `Entrevista ${iso} - ${limpo}.pdf`;
}

/** Pasta do cliente dentro da pasta raiz escolhida pelo usuário. */
export function nomePastaCliente(nomeCliente: string, documento: string | null): string {
  const limpo = limpar(nomeCliente)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);
  const doc = (documento ?? "").replace(/\D/g, "");
  return doc ? `${limpo} - ${doc}` : limpo;
}
