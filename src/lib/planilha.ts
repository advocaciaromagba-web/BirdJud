// Leitura de planilha: .xlsx e .csv, sem biblioteca de planilha.
//
// Por que nao uma biblioteca: a mais usada para .xlsx esta sem versao nova
// desde 2024 e arrasta dependencias velhas; a que le .xls tem falhas
// conhecidas na versao publicada no npm. E um .xlsx e so um ZIP de XML — o
// projeto ja tem o ZIP (jszip) e o XML de planilha e regular.
//
// O que esta leitura PRESERVA, e que importa na migracao:
//   - se a celula veio como NUMERO: e o sinal de que o Excel pode ter comido
//     o zero da frente de um CPF ou de um CEP;
//   - se o numero veio em notacao cientifica (1,23E+19): o digito se perdeu e
//     nao ha como recuperar;
//   - datas formatadas como data viram AAAA-MM-DD, nao o numero de serie.
//
// .xls (o formato binario antigo) e recusado com a instrucao de salvar como
// .xlsx: e um clique no Excel, e evita ler formato binario de terceiro.
import JSZip from "jszip";

export type Celula = {
  texto: string;
  /** A celula era numero na planilha. */
  numero: boolean;
  /** Numero em notacao cientifica: digitos perdidos. */
  cientifica: boolean;
  /** Celula formatada como data (ja convertida para AAAA-MM-DD). */
  data: boolean;
};

export type Planilha = {
  formato: "XLSX" | "CSV";
  linhas: Celula[][];
  /** Nome da aba lida, no .xlsx (a primeira). */
  aba: string | null;
};

export class PlanilhaInvalida extends Error {
  readonly status = 422;
  constructor(motivo: string) {
    super(motivo);
    this.name = "PlanilhaInvalida";
  }
}

/** Texto do XML descompactado que aceitamos ler: uma planilha de clientes nao chega perto. */
const LIMITE_DO_XML = 60 * 1024 * 1024;

const vazia = (): Celula => ({ texto: "", numero: false, cientifica: false, data: false });

export async function lerPlanilha(conteudo: Buffer): Promise<Planilha> {
  if (conteudo.byteLength === 0) throw new PlanilhaInvalida("O arquivo esta vazio.");
  const b = conteudo;
  if (b[0] === 0x50 && b[1] === 0x4b) return lerXlsx(conteudo);
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) {
    throw new PlanilhaInvalida(
      "Este e o formato antigo do Excel (.xls). Abra no Excel e use Salvar como > Pasta de Trabalho do Excel (.xlsx), ou CSV.",
    );
  }
  return lerCsv(conteudo);
}

// ------------------------------------------------------------------- XML

export function desfazerEntidades(texto: string): string {
  return texto
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function atributo(tag: string, nome: string): string | null {
  const m = new RegExp(`\\s${nome}="([^"]*)"`).exec(tag);
  return m ? desfazerEntidades(m[1]) : null;
}

/** Todo o texto dos <t> de um trecho, sem a guia fonetica (<rPh>). */
function textoDosT(xml: string): string {
  const semFonetica = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let saida = "";
  for (const m of semFonetica.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) saida += m[1];
  return desfazerEntidades(saida);
}

/** "AB" -> 27 (A=1). */
export function indiceDaColuna(letras: string): number {
  let n = 0;
  for (const c of letras.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
}

const DATAS_EMBUTIDAS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/** Formato com d, m ou y fora de aspas e colchetes e de data. */
export function formatoEhData(codigo: string): boolean {
  const limpo = codigo.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
  return /[dy]/i.test(limpo) || /m/i.test(limpo.replace(/[hs]+:?m+|m+:?s+/gi, ""));
}

/** Numero de serie do Excel -> AAAA-MM-DD. */
export function serieParaData(serie: number, base1904 = false): string | null {
  if (!Number.isFinite(serie) || serie < 1) return null;
  const dias = Math.floor(serie) + (base1904 ? 1462 : 0);
  // 25569 = 1970-01-01. O bug do 29/02/1900 do Excel faz a conta bater a
  // partir de marco de 1900, que e o que importa para cadastro.
  const ms = (dias - 25569) * 86400000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function lerXlsx(conteudo: Buffer): Promise<Planilha> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(conteudo);
  } catch {
    throw new PlanilhaInvalida("O arquivo nao abriu como planilha .xlsx.");
  }
  const texto = async (caminho: string) => {
    const f = zip.file(caminho);
    if (!f) return null;
    const t = await f.async("string");
    if (t.length > LIMITE_DO_XML) throw new PlanilhaInvalida("A planilha e grande demais para importar de uma vez.");
    return t;
  };

  const workbook = await texto("xl/workbook.xml");
  if (!workbook) throw new PlanilhaInvalida("O arquivo nao e uma planilha do Excel (.xlsx).");
  const base1904 = /<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(workbook);
  const primeira = /<sheet\b[^>]*>/.exec(workbook)?.[0];
  if (!primeira) throw new PlanilhaInvalida("A planilha nao tem nenhuma aba.");
  const aba = atributo(primeira, "name");
  const rid = atributo(primeira, "r:id");

  let caminho = "xl/worksheets/sheet1.xml";
  const rels = await texto("xl/_rels/workbook.xml.rels");
  if (rels && rid) {
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      if (atributo(m[0], "Id") === rid) {
        const alvo = atributo(m[0], "Target") ?? "";
        caminho = alvo.startsWith("/") ? alvo.slice(1) : `xl/${alvo.replace(/^\.\//, "")}`;
      }
    }
  }
  const folha = await texto(caminho);
  if (!folha) throw new PlanilhaInvalida("Nao achei a primeira aba dentro do arquivo.");

  const compartilhados: string[] = [];
  const sst = await texto("xl/sharedStrings.xml");
  if (sst) for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) compartilhados.push(textoDosT(m[1]));

  // Estilos: qual indice de estilo (atributo s) e data.
  const estiloEhData: boolean[] = [];
  const estilos = await texto("xl/styles.xml");
  if (estilos) {
    const proprios = new Map<number, string>();
    for (const m of estilos.matchAll(/<numFmt\b[^>]*>/g)) {
      const id = Number(atributo(m[0], "numFmtId"));
      proprios.set(id, atributo(m[0], "formatCode") ?? "");
    }
    const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(estilos)?.[1] ?? "";
    for (const m of xfs.matchAll(/<xf\b[^>]*\/?>/g)) {
      const id = Number(atributo(m[0], "numFmtId") ?? 0);
      estiloEhData.push(DATAS_EMBUTIDAS.has(id) || (proprios.has(id) && formatoEhData(proprios.get(id)!)));
    }
  }

  const linhas: Celula[][] = [];
  for (const r of folha.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const numeroDaLinha = Number(atributo(`<row${r[1]}>`, "r") ?? linhas.length + 1);
    while (linhas.length < numeroDaLinha - 1) linhas.push([]);
    const linha: Celula[] = [];
    let proxima = 1;
    for (const c of (r[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = `<c${c[1]}>`;
      const ref = atributo(tag, "r");
      const coluna = ref ? indiceDaColuna(ref.replace(/\d+/g, "")) : proxima;
      proxima = coluna + 1;
      const tipo = atributo(tag, "t");
      const estilo = Number(atributo(tag, "s") ?? 0);
      const corpo = c[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1];
      let cel = vazia();
      if (tipo === "s" && v !== undefined) cel.texto = compartilhados[Number(v)] ?? "";
      else if (tipo === "inlineStr") cel.texto = textoDosT(corpo);
      else if (tipo === "str") cel.texto = desfazerEntidades(v ?? "");
      else if (tipo === "b") cel.texto = v === "1" ? "VERDADEIRO" : "FALSO";
      else if (tipo === "e") cel.texto = "";
      else if (v !== undefined) {
        const bruto = desfazerEntidades(v).trim();
        const cientifica = /e/i.test(bruto);
        const ehData = estiloEhData[estilo] === true && !cientifica;
        const data = ehData ? serieParaData(Number(bruto), base1904) : null;
        cel = data
          ? { texto: data, numero: true, cientifica: false, data: true }
          : { texto: bruto, numero: true, cientifica, data: false };
      }
      while (linha.length < coluna - 1) linha.push(vazia());
      linha[coluna - 1] = { ...cel, texto: cel.texto.trim() };
    }
    linhas.push(linha);
  }
  return { formato: "XLSX", linhas, aba };
}

// ------------------------------------------------------------------- CSV

/** UTF-8 quando for; senao Windows-1252, que e o que o Excel brasileiro grava. */
export function decodificarTexto(conteudo: Buffer): string {
  let t: string;
  try {
    t = new TextDecoder("utf-8", { fatal: true }).decode(conteudo);
  } catch {
    t = new TextDecoder("windows-1252").decode(conteudo);
  }
  return t.replace(/^﻿/, "");
}

/** Separador mais frequente na primeira linha, fora de aspas. */
export function separadorDe(primeiraLinha: string): string {
  const fora = primeiraLinha.replace(/"[^"]*"/g, "");
  const contagem = [";", ",", "\t", "|"].map((s) => [s, fora.split(s).length - 1] as const);
  contagem.sort((a, b) => b[1] - a[1]);
  return contagem[0][1] > 0 ? contagem[0][0] : ";";
}

/** CSV de verdade: aspas, aspas dobradas e quebra de linha dentro de aspas. */
export function separarCsv(texto: string, separador: string): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += c;
      continue;
    }
    if (c === '"' && campo === "") aspas = true;
    else if (c === separador) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  if (campo !== "" || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

function lerCsv(conteudo: Buffer): Planilha {
  const texto = decodificarTexto(conteudo);
  if (/\u0000/.test(texto.slice(0, 2000))) {
    throw new PlanilhaInvalida("O arquivo nao e uma planilha nem um CSV de texto.");
  }
  const primeira = texto.split(/\r?\n/, 1)[0] ?? "";
  const linhas = separarCsv(texto, separadorDe(primeira)).map((l) =>
    l.map((t) => {
      const v = t.trim();
      return { texto: v, numero: false, cientifica: /^\d+([.,]\d+)?E\+?\d+$/i.test(v), data: false };
    }),
  );
  return { formato: "CSV", linhas, aba: null };
}
