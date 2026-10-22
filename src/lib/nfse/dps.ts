// Montagem do XML da DPS (Declaracao de Prestacao de Servico), leiaute
// nacional v1.01 — a ordem dos elementos segue o XSD oficial
// (DPS_v1.01.xsd / tiposComplexos_v1.01.xsd), porque a API valida contra ele.
// E o mesmo leiaute que ja emite nota real em producao.
//
// Regras de negocio que moldam o que vai (ou nao vai) aqui — Anexo I:
// - prest/xNome e prest/end NAO sao informados quando o emitente e o
//   proprio prestador (E0121/E0129): a API busca no cadastro nacional;
// - Simples Nacional ME/EPP (opSimpNac=3) exige regApTribSN (E0166) e o
//   percentual aproximado de tributos do SN em totTrib/pTotTribSN; nao
//   optante nao pode informar regApTribSN (E0162) nem pTotTribSN (E0713) e
//   informa o total aproximado por esfera (pTotTrib);
// - ISS "fixo" de sociedade de profissionais: regApTribSN=2 + regEspTrib=6
//   (com regApTribSN=1 o regime especial tem de ser 0 — E0175); havendo
//   regime especial, nao se informa aliquota nem retencao (E0604/E0588);
// - ISS dentro do DAS, sem retencao, em municipio ativo: nao informar pAliq (E0625);
// - IBS/CBS (reforma tributaria, LC 214/2025): o grupo so vai quando o
//   emissor tem data marcada (ibsCbsDesde) e a competencia ja alcancou —
//   para optantes do Simples e obrigatorio a partir de 01/01/2027 e a API
//   recusa qualquer informacao de IBS/CBS antes de 01/01/2026 (E0850).
//   Leiaute: Anexo VI v1.04 (NT 009 SE/CGNFS-e).
import type { Ambiente } from "./api";

export const VERSAO_LEIAUTE = "1.01";
export const VERSAO_APLICATIVO = "BirdJud-1.0";
const NS = "http://www.sped.fazenda.gov.br/nfse";

export type EmissorDps = {
  cnpj: string;
  inscricaoMunicipal: string | null;
  codigoMunicipio: string;
  telefone: string | null;
  email: string | null;
  opSimpNac: number; // 1 nao optante, 2 MEI, 3 ME/EPP
  regApTribSN: number | null; // 1, 2 ou 3 (so para opSimpNac 3)
  regEspTrib: number; // 0 nenhum ... 6 sociedade de profissionais
  pTotTribSN: number | null;
  // Nao optante do Simples: total aproximado de tributos (Lei 12.741) por esfera, em %.
  pTotTribFed?: number | null;
  pTotTribEst?: number | null;
  pTotTribMun?: number | null;
  codigoTributacaoNacional: string;
  codigoNbs: string | null;
  // Reforma tributaria — preenchidos so quando o grupo IBS/CBS vai na nota.
  regApIBSCBSSN?: number | null; // 1 IBS e CBS pelo SN | 2 so CBS pelo SN | 3 ambos pelo regime regular
  cAtvSN?: number | null; // codigo da atividade do Simples (14 = servicos do Anexo IV)
  ibsCbs?: IbsCbsDps | null;
};

/** O que a DPS declara de IBS/CBS. O calculo e feito pela Sefin Nacional. */
export type IbsCbsDps = {
  cIndOp: string; // codigo indicador da operacao (Anexo VII)
  cst: string; // codigo de situacao tributaria (3 digitos)
  cClassTrib: string; // codigo de classificacao tributaria (6 digitos)
};

export type TomadorDps = {
  documento: string | null; // CPF ou CNPJ, com ou sem mascara
  nome: string;
  email: string | null;
  telefone: string | null;
  endereco: {
    codigoMunicipio: string;
    cep: string;
    logradouro: string;
    numero: string;
    complemento: string | null;
    bairro: string;
  } | null;
};

export type DadosDps = {
  ambiente: Ambiente;
  serie: string;
  numero: number;
  dataEmissao: Date;
  dataCompetencia: string; // AAAA-MM-DD
  tomador: TomadorDps;
  descricao: string;
  valorCentavos: number;
  informacoesComplementares: string | null;
};

const so = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "");

/**
 * O leiaute so aceita caracteres do Latin-1 (padrao "[!-ÿ]" do XSD): travessao,
 * aspas curvas e reticencias tipograficas derrubam a DPS com E1235 (falha no
 * esquema). Troca pelo equivalente simples e descarta o que nao tem.
 */
export function latino(t: string): string {
  return t
    .replace(/[\u2012-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .normalize("NFC")
    .replace(/[^\u0009\u000A\u000D\u0020-\u00FF]/g, "");
}

export function esc(t: string): string {
  return latino(t)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // O leiaute nao aceita quebra de linha solta nem caracteres de controle.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\s*\r?\n\s*/g, " ")
    .trim();
}

const dec2 = (v: number) => v.toFixed(2);
const reais = (centavos: number) => (centavos / 100).toFixed(2);

/** "2026-09-16T11:57:11-03:00" — horario de Brasilia, que e o que o leiaute espera. */
export function dataHoraBrasilia(d: Date): string {
  const p = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return `${p.replace(" ", "T")}-03:00`;
}

/** "DPS" + municipio(7) + tipo inscricao(1: 1=CPF, 2=CNPJ) + inscricao(14) + serie(5) + numero(15). */
export function montarIdDps(emissor: Pick<EmissorDps, "cnpj" | "codigoMunicipio">, serie: string, numero: number): string {
  return `DPS${emissor.codigoMunicipio}2${so(emissor.cnpj).padStart(14, "0")}${so(serie).padStart(5, "0")}${String(numero).padStart(15, "0")}`;
}

export function montarDps(emissor: EmissorDps, d: DadosDps): { xml: string; idDps: string } {
  const idDps = montarIdDps(emissor, d.serie, d.numero);
  const t: string[] = [];
  const tag = (nome: string, valor: string | number | null | undefined) => {
    if (valor === null || valor === undefined || valor === "") return;
    t.push(`<${nome}>${typeof valor === "number" ? valor : esc(valor)}</${nome}>`);
  };

  t.push(`<DPS xmlns="${NS}" versao="${VERSAO_LEIAUTE}">`);
  t.push(`<infDPS Id="${idDps}">`);
  tag("tpAmb", d.ambiente === "PRODUCAO" ? 1 : 2);
  tag("dhEmi", dataHoraBrasilia(d.dataEmissao));
  tag("verAplic", VERSAO_APLICATIVO);
  tag("serie", so(d.serie).padStart(5, "0"));
  tag("nDPS", String(d.numero));
  tag("dCompet", d.dataCompetencia);
  tag("tpEmit", 1);
  tag("cLocEmi", emissor.codigoMunicipio);

  // Prestador — o proprio emitente: so identificacao e regime (nome/endereco vem do cadastro nacional).
  t.push("<prest>");
  tag("CNPJ", so(emissor.cnpj));
  tag("IM", emissor.inscricaoMunicipal?.trim() || null);
  tag("fone", so(emissor.telefone) || null);
  tag("email", emissor.email?.trim() || null);
  t.push("<regTrib>");
  tag("opSimpNac", emissor.opSimpNac);
  if (emissor.opSimpNac === 3) tag("regApTribSN", emissor.regApTribSN ?? 1);
  // Campo da NT 009, obrigatorio para optante do Simples quando a nota leva
  // IBS/CBS. So vai se estiver configurado: enquanto o XSD novo nao entra no
  // ar, deixar em branco evita recusa por schema.
  if (emissor.ibsCbs && emissor.regApIBSCBSSN && (emissor.opSimpNac === 3 || emissor.opSimpNac === 4)) {
    tag("regApIBSCBSSN", emissor.regApIBSCBSSN);
  }
  tag("regEspTrib", emissor.regEspTrib);
  t.push("</regTrib>");
  t.push("</prest>");

  // Tomador.
  const doc = so(d.tomador.documento);
  t.push("<toma>");
  if (doc.length === 14) tag("CNPJ", doc);
  else if (doc.length === 11) tag("CPF", doc);
  tag("xNome", d.tomador.nome);
  const e = d.tomador.endereco;
  if (e) {
    t.push("<end>");
    t.push("<endNac>");
    tag("cMun", e.codigoMunicipio);
    tag("CEP", so(e.cep));
    t.push("</endNac>");
    tag("xLgr", e.logradouro);
    tag("nro", e.numero);
    tag("xCpl", e.complemento?.trim() || null);
    tag("xBairro", e.bairro);
    t.push("</end>");
  }
  tag("fone", so(d.tomador.telefone).length >= 6 ? so(d.tomador.telefone) : null);
  tag("email", d.tomador.email?.trim() || null);
  t.push("</toma>");

  // Servico.
  t.push("<serv>");
  t.push("<locPrest>");
  tag("cLocPrestacao", emissor.codigoMunicipio);
  t.push("</locPrest>");
  t.push("<cServ>");
  // Ordem do XSD: cTribNac, cTribMun, xDescServ, cNBS, cAtvSN, cIntContrib.
  tag("cTribNac", so(emissor.codigoTributacaoNacional));
  tag("xDescServ", d.descricao);
  tag("cNBS", so(emissor.codigoNbs) || null);
  // Idem cAtvSN (NT 009): 14 = prestacao de servicos do Anexo IV (advocacia).
  if (emissor.ibsCbs && emissor.cAtvSN && (emissor.opSimpNac === 3 || emissor.opSimpNac === 4)) tag("cAtvSN", emissor.cAtvSN);
  t.push("</cServ>");
  if (d.informacoesComplementares?.trim()) {
    t.push("<infoCompl>");
    tag("xInfComp", d.informacoesComplementares);
    t.push("</infoCompl>");
  }
  t.push("</serv>");

  // Valores e tributacao.
  t.push("<valores>");
  t.push("<vServPrest>");
  tag("vServ", reais(d.valorCentavos));
  t.push("</vServPrest>");
  t.push("<trib>");
  t.push("<tribMun>");
  tag("tribISSQN", 1);
  tag("tpRetISSQN", 1);
  t.push("</tribMun>");
  t.push("<totTrib>");
  if (emissor.opSimpNac === 3) {
    // ME/EPP do Simples: percentual aproximado da aliquota do Simples (indTotTrib proibido — E0712).
    tag("pTotTribSN", dec2(emissor.pTotTribSN ?? 0));
  } else {
    // Nao optante: pTotTribSN e indTotTrib sao proibidos (E0713) — informa por esfera.
    t.push("<pTotTrib>");
    tag("pTotTribFed", dec2(emissor.pTotTribFed ?? 0));
    tag("pTotTribEst", dec2(emissor.pTotTribEst ?? 0));
    tag("pTotTribMun", dec2(emissor.pTotTribMun ?? 0));
    t.push("</pTotTrib>");
  }
  t.push("</totTrib>");
  t.push("</trib>");
  t.push("</valores>");

  // Grupo IBS/CBS — vem depois de "valores" no leiaute. O emissor so declara
  // a natureza da operacao; aliquotas e valores sao calculados pela Sefin.
  if (emissor.ibsCbs) {
    t.push("<IBSCBS>");
    tag("finNFSe", 0); // 0 = NFS-e regular
    tag("cIndOp", emissor.ibsCbs.cIndOp);
    tag("indDest", 0); // o destinatario e o proprio tomador da nota
    t.push("<valores>");
    t.push("<trib>");
    t.push("<gIBSCBS>");
    tag("CST", emissor.ibsCbs.cst);
    tag("cClassTrib", emissor.ibsCbs.cClassTrib);
    t.push("</gIBSCBS>");
    t.push("</trib>");
    t.push("</valores>");
    t.push("</IBSCBS>");
  }

  t.push("</infDPS>");
  t.push("</DPS>");

  return { xml: `<?xml version="1.0" encoding="UTF-8"?>${t.join("")}`, idDps };
}

/** Motivos de cancelamento: 1 erro na emissao, 2 servico nao prestado, 9 outros. */
export type MotivoDeCancelamento = 1 | 2 | 9;

/** Pedido de cancelamento (evento e101101). Id = "PRE" + chave(50) + codigo do evento(6). */
export function montarPedidoCancelamento(p: {
  ambiente: Ambiente;
  cnpjAutor: string;
  chave: string;
  motivo: MotivoDeCancelamento;
  descricaoMotivo: string;
  dataEvento: Date;
}): string {
  const id = `PRE${p.chave}101101`;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<pedRegEvento xmlns="${NS}" versao="${VERSAO_LEIAUTE}">` +
    `<infPedReg Id="${id}">` +
    `<tpAmb>${p.ambiente === "PRODUCAO" ? 1 : 2}</tpAmb>` +
    `<verAplic>${VERSAO_APLICATIVO}</verAplic>` +
    `<dhEvento>${dataHoraBrasilia(p.dataEvento)}</dhEvento>` +
    `<CNPJAutor>${so(p.cnpjAutor)}</CNPJAutor>` +
    `<chNFSe>${p.chave}</chNFSe>` +
    `<e101101><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>${p.motivo}</cMotivo><xMotivo>${esc(p.descricaoMotivo)}</xMotivo></e101101>` +
    `</infPedReg>` +
    `</pedRegEvento>`
  );
}
