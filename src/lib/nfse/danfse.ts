// DANFSe — o PDF da nota. Espelhado do sistema da Advocacia Roma, onde ja
// sai em producao.
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from "pdf-lib";
import { lerNfse, type NoXml } from "./ler-xml";
import municipiosIbge from "./municipios-ibge.json";

/** "Ribeirão Preto / SP" a partir do código IBGE (Anexo A do leiaute nacional). */
function municipioUf(codigo: string | null): string {
  if (!codigo) return "-";
  const achado = (municipiosIbge as Record<string, string>)[codigo];
  return achado ? achado.replace("/", " / ") : codigo;
}

/**
 * DANFSe v2.0 — documento auxiliar da NFS-e, conforme a Nota Técnica
 * SE/CGNFS-e nº 008/2026 (v1.02). Desde 03/08/2026 a API nacional não gera
 * mais o PDF: cada emissor gera, no leiaute do Anexo I da NT.
 *
 * Posições e alturas seguem a tabela do item 2.4.5 (em centímetros, a partir
 * do canto superior esquerdo). Fontes: a NT pede Arial / Microsoft Sans
 * Serif; o PDF usa Helvetica, que é métrica-compatível com Arial e não
 * precisa de arquivo de fonte embutido.
 *
 * Tudo que aparece vem do XML da NFS-e (item 2.1: não pode imprimir o que
 * não consta do arquivo). Campo sem informação sai com traço (nota 12).
 */

const CM = 28.3465;
const A4 = { w: 595.28, h: 841.89 };
const X0 = 0.3; // margem (cm)
const LARG = 20.4; // largura útil (cm)
const COL = [0.3, 5.41, 10.51, 15.62]; // colunas da grade (cm)
const LARG_COL = 5.09;
const LINHA = 0.63; // altura padrão de linha (cm)
const PRETO = rgb(0, 0, 0);
const CINZA_FUNDO = rgb(0.95, 0.95, 0.95); // 5% de densidade
const VERMELHO = rgb(0.85, 0, 0);

const DESC: Record<string, Record<string, string>> = {
  ambGer: { "1": "Prefeitura", "2": "Sistema Nacional da NFS-e" },
  tpAmb: { "1": "Produção", "2": "Homologação" },
  tpEmit: { "1": "Prestador", "2": "Tomador", "3": "Intermediário" },
  cStat: { "100": "NFS-e Gerada", "102": "NFS-e de Decisão Judicial", "103": "NFS-e Avulsa", "107": "NFS-e MEI" },
  opSimpNac: { "1": "Não Optante", "2": "Optante - MEI", "3": "Optante - ME/EPP" },
  regApTribSN: {
    "1": "Regime de apuração dos tributos federais e municipal pelo Simples Nacional",
    "2": "Tributos federais pelo SN e ISSQN por fora do SN, conforme legislação municipal",
    "3": "Tributos federais e municipal por fora do SN, conforme legislações de cada tributo",
  },
  tribISSQN: { "1": "Operação Tributável", "2": "Imunidade", "3": "Exportação de Serviço", "4": "Não Incidência" },
  regEspTrib: {
    "0": "Nenhum", "1": "Ato Cooperado", "2": "Estimativa", "3": "Microempresa Municipal",
    "4": "Notário ou Registrador", "5": "Profissional Autônomo", "6": "Sociedade de Profissionais", "9": "Outros",
  },
  tpRetISSQN: { "1": "Não Retido", "2": "Retido pelo Tomador", "3": "Retido pelo Intermediário" },
  finNFSe: { "0": "NFS-e regular" },
};

const traco = (v: string | null | undefined) => (v && v.trim() ? v.trim() : "-");
const descr = (grupo: string, v: string | null) => (v ? DESC[grupo]?.[v] ?? v : "-");

function moeda(v: string | null): string {
  if (!v) return "-";
  const n = Number(v);
  return Number.isFinite(n) ? `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : v;
}
const pct = (v: string | null) => (v ? `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%` : "-");

function docFormatado(cnpj: string | null, cpf: string | null): string {
  if (cnpj) return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (cpf) return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return "-";
}

function dataHora(iso: string | null): string {
  if (!iso) return "-";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]}` : iso;
}
function data(iso: string | null): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : traco(iso);
}

/** Remove caracteres fora do WinAnsi (Helvetica padrão), preservando acentos do português. */
function limpar(t: string): string {
  return t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

type Ctx = { page: PDFPage; normal: PDFFont; negrito: PDFFont };

const px = (cm: number) => cm * CM;
const py = (cmTopo: number) => A4.h - cmTopo * CM;

function caber(ctx: Ctx, texto: string, fonte: PDFFont, tam: number, largPt: number): string {
  let t = limpar(texto);
  if (fonte.widthOfTextAtSize(t, tam) <= largPt) return t;
  while (t.length > 1 && fonte.widthOfTextAtSize(`${t}...`, tam) > largPt) t = t.slice(0, -1);
  return `${t}...`;
}

function escrever(ctx: Ctx, texto: string, xCm: number, yTopoCm: number, tam: number, o: { negrito?: boolean; larguraCm?: number; cor?: ReturnType<typeof rgb>; centro?: boolean } = {}) {
  const fonte = o.negrito ? ctx.negrito : ctx.normal;
  const largPt = px(o.larguraCm ?? 20) - 4;
  const t = caber(ctx, texto, fonte, tam, largPt);
  const x = o.centro ? px(xCm) + (px(o.larguraCm ?? 0) - fonte.widthOfTextAtSize(t, tam)) / 2 : px(xCm) + 2;
  ctx.page.drawText(t, { x, y: py(yTopoCm) - tam, size: tam, font: fonte, color: o.cor ?? PRETO });
}

function quebrarLinhas(ctx: Ctx, texto: string, tam: number, largPt: number): string[] {
  const palavras = limpar(texto).split(" ");
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (ctx.normal.widthOfTextAtSize(tentativa, tam) <= largPt) atual = tentativa;
    else {
      if (atual) linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

function retangulo(ctx: Ctx, xCm: number, yTopoCm: number, wCm: number, hCm: number, o: { fundo?: boolean; borda?: number } = {}) {
  ctx.page.drawRectangle({
    x: px(xCm),
    y: py(yTopoCm + hCm),
    width: px(wCm),
    height: px(hCm),
    color: o.fundo ? CINZA_FUNDO : undefined,
    borderColor: o.borda ? PRETO : undefined,
    borderWidth: o.borda ?? 0,
  });
}

function linhaH(ctx: Ctx, yTopoCm: number) {
  ctx.page.drawLine({ start: { x: px(X0), y: py(yTopoCm) }, end: { x: px(X0 + LARG), y: py(yTopoCm) }, thickness: 0.5, color: PRETO });
}

/** Célula de campo: rótulo 6pt negrito em cima, conteúdo 7pt embaixo. */
function campo(ctx: Ctx, rotulo: string, valor: string, col: number, yCm: number, colunas = 1, o: { fundo?: boolean; rotuloGrande?: boolean } = {}) {
  const larg = LARG_COL * colunas + (colunas - 1) * 0.02;
  if (o.fundo) retangulo(ctx, COL[col], yCm, larg, LINHA, { fundo: true });
  escrever(ctx, rotulo, COL[col], yCm + 0.05, o.rotuloGrande ? 7 : 6, { negrito: true, larguraCm: larg });
  escrever(ctx, valor, COL[col], yCm + 0.29, 7, { larguraCm: larg });
}

/** Título de bloco: 7pt negrito caixa alta, fundo cinza na primeira coluna. */
function tituloBloco(ctx: Ctx, titulo: string, yCm: number, altura = LINHA) {
  retangulo(ctx, COL[0], yCm, LARG_COL, altura, { fundo: true });
  escrever(ctx, titulo.toUpperCase(), COL[0], yCm + 0.2, 7, { negrito: true, larguraCm: LARG_COL });
}

function faixaUnica(ctx: Ctx, texto: string, yCm: number): number {
  escrever(ctx, texto, X0, yCm + 0.06, 7, { larguraCm: LARG, centro: true });
  linhaH(ctx, yCm + 0.4);
  return yCm + 0.4;
}

export type OpcoesDanfse = { cancelada?: boolean };

export async function gerarDanfse(nfseXml: string, opcoes: OpcoesDanfse = {}): Promise<Buffer> {
  const n = lerNfse(nfseXml);
  const dps = n.no("DPS/infDPS");
  if (!dps) throw new Error("XML da NFS-e sem a DPS.");

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4.w, A4.h]);
  const ctx: Ctx = { page, normal: await pdf.embedFont(StandardFonts.Helvetica), negrito: await pdf.embedFont(StandardFonts.HelveticaBold) };

  const chave = (n.atributo("Id") ?? "").replace(/^NFS/, "");
  const homologacao = dps.txt("tpAmb") === "2";

  // ---- Cabeçalho ----
  retangulo(ctx, X0, 0.3, LARG, 1.16, { fundo: true });
  try {
    const logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "src", "lib", "nfse", "assets", "logo-nfse.png")));
    const alturaLogo = px(0.85);
    const larguraLogo = Math.min(px(4), (logo.width / logo.height) * alturaLogo);
    page.drawImage(logo, { x: px(0.49), y: py(0.44) - alturaLogo, width: larguraLogo, height: alturaLogo });
  } catch {
    escrever(ctx, "NFS-e", 0.49, 0.6, 12, { negrito: true, larguraCm: 4 });
  }
  escrever(ctx, "DANFSe v2.0", 5.41, 0.4, 9, { negrito: true, larguraCm: 10.19, centro: true });
  escrever(ctx, "Documento Auxiliar da NFS-e", 5.41, 0.75, 9, { negrito: true, larguraCm: 10.19, centro: true });
  if (homologacao) escrever(ctx, "NFS-e SEM VALIDADE JURÍDICA", 5.41, 1.08, 9, { negrito: true, larguraCm: 10.19, centro: true, cor: VERMELHO });
  escrever(ctx, `Município: ${traco(n.txt("xLocEmi"))} / ${traco(n.txt("emit/enderNac/UF"))}`, 15.62, 0.38, 8, { larguraCm: 5.09 });
  escrever(ctx, `Ambiente Gerador: ${descr("ambGer", n.txt("ambGer"))}`, 15.62, 0.97, 6, { larguraCm: 5.09 });
  escrever(ctx, `Tipo de Ambiente: ${descr("tpAmb", dps.txt("tpAmb"))}`, 15.62, 1.22, 6, { larguraCm: 5.09 });
  linhaH(ctx, 1.48);

  // ---- Dados da NFS-e ----
  escrever(ctx, "CHAVE DE ACESSO DA NFS-E", X0, 1.53, 7, { negrito: true, larguraCm: 15.3 });
  escrever(ctx, chave || "-", X0, 1.85, 7, { larguraCm: 15.3 });
  campo(ctx, "NÚMERO DA NFS-E", traco(n.txt("nNFSe")), 0, 2.27, 1, { rotuloGrande: true });
  campo(ctx, "COMPETÊNCIA DA NFS-E", data(dps.txt("dCompet")), 1, 2.27, 1, { rotuloGrande: true });
  campo(ctx, "DATA E HORA DA EMISSÃO DA NFS-E", dataHora(n.txt("dhProc")), 2, 2.27, 1, { rotuloGrande: true });
  campo(ctx, "NÚMERO DA DPS", traco(dps.txt("nDPS")), 0, 2.96, 1, { rotuloGrande: true });
  campo(ctx, "SÉRIE DA DPS", traco(dps.txt("serie")), 1, 2.96, 1, { rotuloGrande: true });
  campo(ctx, "DATA E HORA DA EMISSÃO DA DPS", dataHora(dps.txt("dhEmi")), 2, 2.96, 1, { rotuloGrande: true });
  campo(ctx, "EMITENTE DA NFS-E", descr("tpEmit", dps.txt("tpEmit")), 0, 3.65, 1, { fundo: true, rotuloGrande: true });
  campo(ctx, "SITUAÇÃO DA NFS-E", descr("cStat", n.txt("cStat")), 1, 3.65, 1, { rotuloGrande: true });
  campo(ctx, "FINALIDADE", descr("finNFSe", dps.txt("IBSCBS/finNFSe")), 2, 3.65, 1, { rotuloGrande: true });

  const qr = await QRCode.toBuffer(`https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${chave}`, { margin: 0, width: 300 });
  const qrImg = await pdf.embedPng(qr);
  page.drawImage(qrImg, { x: px(17.48), y: py(1.67) - px(1.52), width: px(1.52), height: px(1.52) });
  ["A autenticidade desta NFS-e pode ser verificada", "pela leitura deste código QR ou pela consulta da", "chave de acesso no portal nacional da NFS-e"].forEach((l, i) =>
    escrever(ctx, l, 15.8, 3.36 + i * 0.23, 6, { larguraCm: 4.72 })
  );
  linhaH(ctx, 4.32);

  let y = 4.34;

  // ---- Prestador ----
  const emit = n.no("emit");
  const regTrib = dps.no("prest/regTrib");
  tituloBloco(ctx, "PRESTADOR / FORNECEDOR", y);
  campo(ctx, "CNPJ / CPF / NIF", docFormatado(emit?.txt("CNPJ") ?? null, emit?.txt("CPF") ?? null), 1, y);
  campo(ctx, "Indicador Municipal (Inscrição)", traco(emit?.txt("IM")), 2, y);
  campo(ctx, "Telefone", traco(emit?.txt("fone")), 3, y);
  y += 0.64;
  campo(ctx, "Nome / Nome Empresarial", traco(emit?.txt("xNome")), 0, y, 2);
  campo(ctx, "Município / Sigla UF", `${traco(n.txt("xLocEmi"))} / ${traco(emit?.txt("enderNac/UF"))}`, 2, y);
  campo(ctx, "Código IBGE / CEP", `${traco(emit?.txt("enderNac/cMun"))} / ${formatarCep(emit?.txt("enderNac/CEP"))}`, 3, y);
  y += 0.64;
  campo(ctx, "Endereço", juntarEndereco(emit?.no("enderNac") ?? null), 0, y, 2);
  campo(ctx, "E-mail", traco(emit?.txt("email")), 2, y, 2);
  y += 0.64;
  campo(ctx, "Simples Nacional na Data de Competência", descr("opSimpNac", regTrib?.txt("opSimpNac") ?? null), 0, y);
  campo(ctx, "Regime de Apuração Tributária pelo SN", descr("regApTribSN", regTrib?.txt("regApTribSN") ?? null), 2, y, 2);
  y += LINHA;
  linhaH(ctx, y + 0.01);
  y += 0.02;

  // ---- Tomador ----
  const toma = dps.no("toma");
  if (toma) {
    tituloBloco(ctx, "TOMADOR / ADQUIRENTE", y);
    campo(ctx, "CNPJ / CPF / NIF", toma.txt("NIF") ?? docFormatado(toma.txt("CNPJ"), toma.txt("CPF")), 1, y);
    campo(ctx, "Indicador Municipal (Inscrição)", traco(toma.txt("IM")), 2, y);
    campo(ctx, "Telefone", traco(toma.txt("fone")), 3, y);
    y += 0.64;
    campo(ctx, "Nome / Nome Empresarial", traco(toma.txt("xNome")), 0, y, 2);
    const cMunToma = toma.txt("end/endNac/cMun");
    campo(ctx, "Município / Sigla UF", cMunToma ? municipioUf(cMunToma) : traco(toma.txt("end/endExt/xCidade")), 2, y);
    campo(ctx, "Código IBGE / CEP", cMunToma ? `${cMunToma} / ${formatarCep(toma.txt("end/endNac/CEP"))}` : "-", 3, y);
    y += 0.64;
    campo(ctx, "Endereço", juntarEndereco(toma.no("end")), 0, y, 2);
    campo(ctx, "E-mail", traco(toma.txt("email")), 2, y, 2);
    y += LINHA;
    linhaH(ctx, y + 0.01);
    y += 0.02;
  } else {
    y = faixaUnica(ctx, "TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e", y);
  }

  // ---- Destinatário e intermediário (não usados pelo escritório) ----
  y = faixaUnica(ctx, dps.existe("IBSCBS/dest") ? "DESTINATÁRIO DA OPERAÇÃO: VER XML DA NFS-e" : "DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e", y);
  y = faixaUnica(ctx, dps.existe("interm") ? "INTERMEDIÁRIO DA OPERAÇÃO: VER XML DA NFS-e" : "INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e", y);
  y += 0.02;

  // ---- Serviço prestado ----
  tituloBloco(ctx, "SERVIÇO PRESTADO", y);
  const cTrib = dps.txt("serv/cServ/cTribNac");
  campo(ctx, "Código de Tributação Nacional / Municipal", `${cTrib ? cTrib.replace(/^(\d{2})(\d{2})(\d{2})$/, "$1.$2.$3") : "-"} / ${traco(dps.txt("serv/cServ/cTribMun"))}`, 1, y);
  const nbs = dps.txt("serv/cServ/cNBS");
  campo(ctx, "Código da NBS", nbs ? nbs.replace(/^(\d)(\d{4})(\d{2})(\d{2})$/, "$1.$2.$3.$4") : "-", 2, y);
  campo(ctx, "Local da Prestação / Sigla UF / País", `${traco(n.txt("xLocPrestacao"))} / ${traco(emit?.txt("enderNac/UF"))} / ${dps.txt("serv/locPrest/cPaisPrestacao") ?? "BR"}`, 3, y);
  y += 0.65;
  escrever(ctx, traco(n.txt("xTribMun") ?? n.txt("xTribNac")), X0, y, 6, { larguraCm: LARG });
  y += 0.4;
  escrever(ctx, "Descrição do Serviço", X0, y, 6, { negrito: true, larguraCm: LARG });
  const linhasDesc = quebrarLinhas(ctx, traco(dps.txt("serv/cServ/xDescServ")), 7, px(LARG) - 4).slice(0, 14);
  linhasDesc.forEach((l, i) => escrever(ctx, l, X0, y + 0.28 + i * 0.3, 7, { larguraCm: LARG }));
  y += Math.max(1.3, 0.35 + linhasDesc.length * 0.3);
  linhaH(ctx, y);
  y += 0.02;

  // ---- Tributação municipal ----
  const tribMun = dps.no("valores/trib/tribMun");
  const val = n.no("valores");
  tituloBloco(ctx, "TRIBUTAÇÃO MUNICIPAL (ISSQN)", y);
  campo(ctx, "Tipo de Tributação do ISSQN", descr("tribISSQN", tribMun?.txt("tribISSQN") ?? null), 1, y);
  campo(ctx, "Município / Sigla UF / País da Incidência do ISSQN", `${traco(n.txt("xLocIncid"))} / ${traco(emit?.txt("enderNac/UF"))} / ${tribMun?.txt("cPaisResult") ?? "BR"}`, 2, y, 2);
  y += 0.65;
  campo(ctx, "Regime Especial de Tributação do ISSQN", descr("regEspTrib", regTrib?.txt("regEspTrib") ?? null), 0, y);
  campo(ctx, "Tipo de Imunidade do ISSQN", traco(tribMun?.txt("tpImunidade")), 1, y);
  campo(ctx, "Suspensão da Exigibilidade do ISSQN", traco(tribMun?.txt("exigSusp/tpSusp")), 2, y);
  campo(ctx, "Número Processo Suspensão", traco(tribMun?.txt("exigSusp/nProcesso")), 3, y);
  y += 0.65;
  if (val?.txt("tpBM") || val?.txt("vCalcBM") || val?.txt("vCalcDR") || dps.txt("valores/vDescCondIncond/vDescIncond")) {
    campo(ctx, "Benefício Municipal", traco(val?.txt("tpBM")), 0, y);
    campo(ctx, "Cálculo do BM", moeda(val?.txt("vCalcBM") ?? null), 1, y);
    campo(ctx, "Total Deduções/Reduções", moeda(val?.txt("vCalcDR") ?? null), 2, y);
    campo(ctx, "Desconto Incondicionado", moeda(dps.txt("valores/vDescCondIncond/vDescIncond")), 3, y);
    y += 0.65;
  }
  campo(ctx, "BC ISSQN", moeda(val?.txt("vBC") ?? null), 0, y);
  campo(ctx, "Alíquota Aplicada", pct(val?.txt("pAliqAplic") ?? null), 1, y);
  campo(ctx, "Retenção do ISSQN", descr("tpRetISSQN", tribMun?.txt("tpRetISSQN") ?? null), 2, y);
  campo(ctx, "ISSQN Apurado", moeda(val?.txt("vISSQN") ?? null), 3, y);
  y += LINHA;
  linhaH(ctx, y + 0.01);
  y += 0.02;

  // ---- Tributação federal ----
  const fed = dps.no("valores/trib/tribFed");
  tituloBloco(ctx, "TRIBUTAÇÃO FEDERAL (EXCETO CBS)", y);
  campo(ctx, "IRRF", moeda(fed?.txt("vRetIRRF") ?? null), 1, y);
  campo(ctx, "Contribuição Previdenciária - Retida", moeda(fed?.txt("vRetCP") ?? null), 2, y);
  campo(ctx, "Contribuições Sociais - Retidas", moeda(fed?.txt("vRetCSLL") ?? null), 3, y);
  y += 0.65;
  if ((dps.txt("dCompet") ?? "").startsWith("2026")) {
    campo(ctx, "PIS - Débito Apuração Própria", moeda(fed?.txt("piscofins/vPis") ?? null), 0, y);
    campo(ctx, "COFINS - Débito Apuração Própria", moeda(fed?.txt("piscofins/vCofins") ?? null), 1, y);
    campo(ctx, "Descrição Contrib. Sociais - Retidas", traco(fed?.txt("piscofins/tpRetPisCofins")), 2, y, 2);
    y += LINHA;
  }
  linhaH(ctx, y + 0.01);
  y += 0.02;

  // ---- IBS/CBS (a partir de 2027 para optante do Simples) ----
  const ibs = n.no("IBSCBS");
  // Optante do Simples que apura IBS/CBS dentro do DAS: os valores vêm no
  // grupo próprio do Simples (gTribSN), não nos totais do regime regular.
  const sn = ibs?.no("totCIBS/gTribSN") ?? null;
  tituloBloco(ctx, "TRIBUTAÇÃO IBS / CBS", y);
  campo(ctx, "CST / cClassTrib", ibs ? `${traco(dps.txt("IBSCBS/valores/trib/gIBSCBS/CST"))} / ${traco(dps.txt("IBSCBS/valores/trib/gIBSCBS/cClassTrib"))}` : "-", 1, y);
  campo(ctx, "Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF", ibs ? `${traco(dps.txt("IBSCBS/cIndOp"))} / ${traco(ibs.txt("cLocalidadeIncid"))} / ${traco(ibs.txt("xLocalidadeIncid"))}` : "-", 2, y, 2);
  y += 0.65;
  campo(ctx, "Exclusões e Reduções da Base de Cálculo", "-", 0, y);
  campo(ctx, "Base de Cálculo Após Exclusões e Reduções", moeda(ibs?.txt("valores/vBC") ?? null), 1, y);
  campo(ctx, "Red. Alíquota IBS / Red. Alíquota CBS", "-", 2, y);
  campo(ctx, "Alíquota - IBS UF / IBS Mun", "-", 3, y);
  y += 0.65;
  campo(ctx, "Alíq. Efetiva Municipal - IBS", pct(ibs?.txt("valores/mun/pAliqEfetMun") ?? null), 0, y);
  campo(ctx, "Valor Apurado Municipal - IBS", moeda(ibs?.txt("totCIBS/gIBS/gIBSMunTot/vIBSMun") ?? null), 1, y);
  campo(ctx, "Alíq. Efetiva Estadual - IBS", pct(ibs?.txt("valores/uf/pAliqEfetUF") ?? null), 2, y);
  campo(ctx, "Valor Apurado Estadual - IBS", moeda(ibs?.txt("totCIBS/gIBS/gIBSUFTot/vIBSUF") ?? null), 3, y);
  y += 0.65;
  campo(ctx, "Valor Total Apurado - IBS", moeda(ibs?.txt("totCIBS/gIBS/vIBSTot") ?? null), 0, y);
  campo(ctx, "Alíquota - CBS", pct(ibs?.txt("valores/fed/pCBS") ?? null), 1, y);
  campo(ctx, "Alíquota Efetiva - CBS", pct(ibs?.txt("valores/fed/pAliqEfetCBS") ?? null), 2, y);
  campo(ctx, "Valor Total Apurado - CBS", moeda(ibs?.txt("totCIBS/gCBS/vCBS") ?? null), 3, y);
  if (sn) {
    y += 0.65;
    campo(ctx, "Alíquota IBS - Simples Nacional", pct(sn.txt("pIBSSN")), 0, y);
    campo(ctx, "Valor IBS - Simples Nacional", moeda(sn.txt("vIBSSN")), 1, y);
    campo(ctx, "Alíquota CBS - Simples Nacional", pct(sn.txt("pCBSSN")), 2, y);
    campo(ctx, "Valor CBS - Simples Nacional", moeda(sn.txt("vCBSSN")), 3, y);
  }
  y += LINHA;
  linhaH(ctx, y + 0.01);
  y += 0.02;

  // ---- Valor total ----
  retangulo(ctx, COL[0], y, LARG_COL, 0.67, { fundo: true });
  escrever(ctx, "VALOR TOTAL DA NFS-E", COL[0], y + 0.22, 7, { negrito: true, larguraCm: LARG_COL });
  campo(ctx, "Valor da Operação / Serviço", moeda(dps.txt("valores/vServPrest/vServ")), 1, y);
  campo(ctx, "Desconto Incondicionado", moeda(dps.txt("valores/vDescCondIncond/vDescIncond")), 2, y);
  campo(ctx, "Desconto Condicionado", moeda(dps.txt("valores/vDescCondIncond/vDescCond")), 3, y);
  y += 0.69;
  campo(ctx, "Total das Retenções (ISSQN / Federais)", moeda(val?.txt("vTotalRet") ?? null), 0, y);
  campo(ctx, "Valor Líquido da NFS-e", moeda(val?.txt("vLiq") ?? null), 1, y);
  campo(ctx, "Total do IBS/CBS", moeda(ibs?.txt("totCIBS/gIBS/vIBSTot") ?? null), 2, y);
  campo(ctx, "Valor Líquido da NFS-e + IBS/CBS", moeda(ibs?.txt("totCIBS/vTotNF") ?? val?.txt("vLiq") ?? null), 3, y, 1, { fundo: true });
  y += 0.69;
  linhaH(ctx, y);
  y += 0.02;

  // ---- Informações complementares ----
  retangulo(ctx, COL[0], y, LARG_COL, 0.39, { fundo: true });
  escrever(ctx, "INFORMAÇÕES COMPLEMENTARES", COL[0], y + 0.1, 7, { negrito: true, larguraCm: LARG_COL });
  y += 0.45;
  const partes: string[] = [];
  const add = (rotulo: string, v: string | null) => v && partes.push(`${rotulo} ${v}`);
  add("Inf. Cont.:", dps.txt("serv/infoCompl/xInfComp"));
  add("NFS-e Subst.:", dps.txt("subst/chSubstda"));
  add("Doc. Ref.:", dps.txt("serv/infoCompl/docRef"));
  add("Doc. Tec.:", dps.txt("serv/infoCompl/idDocTec"));
  add("Núm. Ped.:", dps.txt("serv/infoCompl/xPed"));
  add("Inf. A. T. Mun.:", n.txt("xOutInf"));
  const tot = dps.no("valores/trib/totTrib");
  let totais = "Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012: ";
  if (tot?.txt("pTotTribSN")) totais += `Simples Nacional: ${pct(tot.txt("pTotTribSN"))}`;
  else if (tot?.existe("vTotTrib")) totais += `Federais: ${moeda(tot.txt("vTotTrib/vTotTribFed"))}; Estaduais: ${moeda(tot.txt("vTotTrib/vTotTribEst"))}; Municipais: ${moeda(tot.txt("vTotTrib/vTotTribMun"))}`;
  else if (tot?.existe("pTotTrib")) totais += `Federais: ${pct(tot.txt("pTotTrib/pTotTribFed"))}; Estaduais: ${pct(tot.txt("pTotTrib/pTotTribEst"))}; Municipais: ${pct(tot.txt("pTotTrib/pTotTribMun"))}`;
  else totais += "-";
  const linhasInfo = quebrarLinhas(ctx, partes.join(" | ") || "-", 7, px(LARG) - 4).slice(0, 12);
  linhasInfo.forEach((l, i) => escrever(ctx, l, X0, y + i * 0.3, 7, { larguraCm: LARG }));
  escrever(ctx, totais, X0, y + linhasInfo.length * 0.3 + 0.05, 7, { larguraCm: LARG });

  // Borda da página (1 ponto) em volta do corpo impresso.
  retangulo(ctx, X0, 0.3, LARG, 29.1, { borda: 1 });

  if (opcoes.cancelada) {
    const texto = "CANCELADA";
    const tam = 90;
    const largura = ctx.normal.widthOfTextAtSize(texto, tam);
    page.drawText(texto, {
      x: A4.w / 2 - (largura / 2) * Math.cos(Math.PI / 4),
      y: A4.h / 2 - (largura / 2) * Math.sin(Math.PI / 4),
      size: tam,
      font: ctx.normal,
      color: rgb(0.65, 0.65, 0.65),
      rotate: degrees(45),
      opacity: 0.6,
    });
  }

  return Buffer.from(await pdf.save());
}

function formatarCep(cep: string | null | undefined): string {
  const d = (cep ?? "").replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 2)}.${d.slice(2, 5)}-${d.slice(5)}` : traco(cep);
}

function juntarEndereco(end: NoXml | null): string {
  if (!end) return "-";
  const partes = [end.txt("xLgr"), end.txt("nro"), end.txt("xCpl"), end.txt("xBairro")].filter(Boolean);
  return partes.length ? partes.join(", ") : "-";
}
