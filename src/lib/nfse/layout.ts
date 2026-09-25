// Montagem do DPS (Declaracao de Prestacao de Servicos) do padrao NACIONAL.
//
// ATENCAO, E ISTO E O PONTO MAIS IMPORTANTE DESTE MODULO: o layout abaixo foi
// escrito a partir da documentacao do padrao nacional, sem poder ser batido
// contra o ambiente de homologacao daqui. Enquanto `npm run conferir-nfse` nao
// for rodado contra a homologacao de verdade, com o certificado do escritorio,
// **trate este arquivo como suspeito** — do mesmo jeito que o mapeamento do
// DJEN foi tratado ate alguem rodar do Brasil.
//
// Tudo que e incerto mora aqui e em nacional.ts. O resto do modulo conhece so
// os tipos de `DadosDaDps` e `RetornoDaEmissao`, entao corrigir o layout depois
// da homologacao nao mexe em banco, tela nem fila.
//
// Municipio com padrao proprio (ABRASF e as variantes de prefeitura) entra como
// outro emissor em `emissores.ts`, sem tocar neste arquivo.

/** Como o escritorio e tributado. Vem do cadastro fiscal dele. */
export const REGIMES = ["SIMPLES", "MEI", "NORMAL"] as const;
export type Regime = (typeof REGIMES)[number];

export type PrestadorDaDps = {
  cnpj: string;
  inscricaoMunicipal: string;
  codigoMunicipio: string; // IBGE, 7 digitos
  regime: Regime;
};

/**
 * Regime nosso -> codigo do campo opSimpNac.
 *
 * Um dos pontos a confirmar na homologacao: e um campo de tres valores, e
 * trocar 1 por 3 aqui faz a nota sair com a tributacao errada — erro que o
 * escritorio so descobre no fim do mes, com o contador.
 */
export const OP_SIMPLES: Record<Regime, string> = {
  NORMAL: "1",
  MEI: "2",
  SIMPLES: "3",
};

export type Ambiente = "PRODUCAO" | "HOMOLOGACAO";

export type TomadorDaDps = {
  documento: string; // CPF ou CNPJ, so digitos
  nome: string;
  email: string | null;
};

export type ServicoDaDps = {
  /** Codigo de tributacao nacional (LC 116/serie nacional), sem ponto. */
  codigoTributacao: string;
  descricao: string;
  valorCentavos: number;
  /** Aliquota do ISS em milesimos de ponto percentual: 2% = 2000. */
  aliquotaMilesimos: number;
  issRetido: boolean;
  codigoMunicipioPrestacao: string;
};

export type DadosDaDps = {
  serie: string;
  numero: number;
  emitidaEm: Date;
  prestador: PrestadorDaDps;
  tomador: TomadorDaDps;
  servico: ServicoDaDps;
};

export function soDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** Reais com duas casas e ponto decimal, que e como o XML fiscal escreve. */
export function emReaisXml(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

/**
 * Percentual como o escritorio digita -> milesimos. "2,5" vira 2500.
 * null quando nao e percentual — aliquota errada sai na nota e vira imposto
 * a menos ou a mais.
 */
export function aliquotaEmMilesimos(valor: string): number | null {
  const numero = Number(valor.replace(",", "."));
  if (!Number.isFinite(numero) || numero < 0 || numero > 100) return null;
  return Math.round(numero * 1000);
}

/** Aliquota em percentual com quatro casas: 2000 milesimos -> "2.0000". */
export function aliquotaXml(milesimos: number): string {
  return (milesimos / 1000).toFixed(4);
}

/** aaaa-mm-ddThh:mm:ss-03:00 — o fuso e de Brasilia, nao o do servidor. */
export function dataHoraXml(data: Date): string {
  const emBrasilia = new Date(data.getTime() - 3 * 60 * 60 * 1000);
  return `${emBrasilia.toISOString().slice(0, 19)}-03:00`;
}

export function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Id do DPS: "DPS" + municipio(7) + tipo de inscricao(1) + inscricao(14) +
 * serie(5) + numero(15).
 *
 * A composicao e a documentada; o que nao da para conferir daqui e se algum
 * campo mudou de tamanho na versao em producao. O teste que existe prova o
 * FORMATO (tamanho e preenchimento com zero), nao a verdade — provar a verdade
 * e o que a homologacao faz.
 */
export function idDaDps(dados: DadosDaDps): string {
  const cnpj = soDigitos(dados.prestador.cnpj);
  const tipoInscricao = cnpj.length === 14 ? "2" : "1";
  return [
    "DPS",
    soDigitos(dados.prestador.codigoMunicipio).padStart(7, "0"),
    tipoInscricao,
    cnpj.padStart(14, "0"),
    soDigitos(dados.serie).padStart(5, "0"),
    String(dados.numero).padStart(15, "0"),
  ].join("");
}

/** O XML do DPS, sem assinatura. Quem assina e assinatura.ts. */
export function montarDps(
  dados: DadosDaDps,
  ambiente: Ambiente = "HOMOLOGACAO",
): string {
  const id = idDaDps(dados);
  const cnpj = soDigitos(dados.prestador.cnpj);
  const documentoTomador = soDigitos(dados.tomador.documento);
  const etiquetaTomador = documentoTomador.length === 14 ? "CNPJ" : "CPF";

  const email = dados.tomador.email
    ? `<email>${escapar(dados.tomador.email)}</email>`
    : "";

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">',
    `<infDPS Id="${id}">`,
    // 1 producao, 2 homologacao. Nota de homologacao NAO tem valor fiscal.
    `<tpAmb>${ambiente === "PRODUCAO" ? "1" : "2"}</tpAmb>`,
    `<dhEmi>${dataHoraXml(dados.emitidaEm)}</dhEmi>`,
    "<verAplic>BirdJud</verAplic>",
    `<serie>${escapar(dados.serie)}</serie>`,
    `<nDPS>${dados.numero}</nDPS>`,
    `<dCompet>${dados.emitidaEm.toISOString().slice(0, 10)}</dCompet>`,
    "<tpEmit>1</tpEmit>",
    `<cLocEmi>${soDigitos(dados.prestador.codigoMunicipio)}</cLocEmi>`,
    "<prest>",
    `<CNPJ>${cnpj}</CNPJ>`,
    `<IM>${soDigitos(dados.prestador.inscricaoMunicipal)}</IM>`,
    "<regTrib>",
    `<opSimpNac>${OP_SIMPLES[dados.prestador.regime]}</opSimpNac>`,
    `<regEspTrib>0</regEspTrib>`,
    "</regTrib>",
    "</prest>",
    "<toma>",
    `<${etiquetaTomador}>${documentoTomador}</${etiquetaTomador}>`,
    `<xNome>${escapar(dados.tomador.nome)}</xNome>`,
    email,
    "</toma>",
    "<serv>",
    "<locPrest>",
    `<cLocPrestacao>${soDigitos(dados.servico.codigoMunicipioPrestacao)}</cLocPrestacao>`,
    "</locPrest>",
    "<cServ>",
    `<cTribNac>${soDigitos(dados.servico.codigoTributacao)}</cTribNac>`,
    `<xDescServ>${escapar(dados.servico.descricao)}</xDescServ>`,
    "</cServ>",
    "</serv>",
    "<valores>",
    "<vServPrest>",
    `<vServ>${emReaisXml(dados.servico.valorCentavos)}</vServ>`,
    "</vServPrest>",
    "<trib>",
    "<tribMun>",
    `<tribISSQN>1</tribISSQN>`,
    `<pAliq>${aliquotaXml(dados.servico.aliquotaMilesimos)}</pAliq>`,
    `<tpRetISSQN>${dados.servico.issRetido ? "2" : "1"}</tpRetISSQN>`,
    "</tribMun>",
    "</trib>",
    "</valores>",
    "</infDPS>",
    "</DPS>",
  ]
    .filter(Boolean)
    .join("");
}

/** Motivos de cancelamento aceitos pelo padrao nacional. */
export const MOTIVOS_DE_CANCELAMENTO = {
  ERRO_NA_EMISSAO: "1",
  SERVICO_NAO_PRESTADO: "2",
  ERRO_DE_ASSINATURA: "3",
  DUPLICIDADE: "4",
} as const;

export type MotivoDeCancelamento = keyof typeof MOTIVOS_DE_CANCELAMENTO;

/**
 * Pedido de cancelamento (evento e101101).
 *
 * CONFERIR na homologacao, como o resto do layout. O Id do evento segue a
 * mesma logica do Id do DPS: prefixo + chave + tipo + sequencia.
 */
export function montarPedidoDeCancelamento(opcoes: {
  chaveAcesso: string;
  cnpjAutor: string;
  motivo: MotivoDeCancelamento;
  emitidoEm: Date;
  ambiente?: Ambiente;
}): { xml: string; id: string } {
  const cnpj = soDigitos(opcoes.cnpjAutor).padStart(14, "0");
  const id = `EVT${soDigitos(opcoes.chaveAcesso)}10110101`;

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">',
    `<infPedReg Id="${id}">`,
    `<tpAmb>${opcoes.ambiente === "PRODUCAO" ? "1" : "2"}</tpAmb>`,
    `<verAplic>BirdJud</verAplic>`,
    `<dhEvento>${dataHoraXml(opcoes.emitidoEm)}</dhEvento>`,
    `<CNPJAutor>${cnpj}</CNPJAutor>`,
    `<chNFSe>${soDigitos(opcoes.chaveAcesso)}</chNFSe>`,
    "<nPedRegEvento>1</nPedRegEvento>",
    "<e101101>",
    "<xDesc>Cancelamento de NFS-e</xDesc>",
    `<cMotivo>${MOTIVOS_DE_CANCELAMENTO[opcoes.motivo]}</cMotivo>`,
    "</e101101>",
    "</infPedReg>",
    "</pedRegEvento>",
  ].join("");

  return { xml, id };
}
