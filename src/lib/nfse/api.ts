// Cliente da API do Sistema Nacional NFS-e (Sefin Nacional). Toda chamada e
// feita com TLS MUTUO usando o certificado ICP-Brasil do emitente — sem ele a
// Sefin nem responde.
//
// Os XML trafegam compactados em GZip e codificados em Base64 dentro de um
// JSON — e o contrato publicado no swagger oficial.
//
// NFSE_BASE_URL troca o endereco (testes apontam para um servidor local, em
// http, sem certificado).
import http from "node:http";
import https from "node:https";
import { gzipSync, gunzipSync } from "node:zlib";
import type { CertificadoCarregado } from "./certificado";

export type Ambiente = "PRODUCAO" | "HOMOLOGACAO";

const SEFIN: Record<Ambiente, string> = {
  PRODUCAO: "https://sefin.nfse.gov.br/SefinNacional",
  HOMOLOGACAO: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional",
};
const ADN: Record<Ambiente, string> = {
  PRODUCAO: "https://adn.nfse.gov.br",
  HOMOLOGACAO: "https://adn.producaorestrita.nfse.gov.br",
};

function sefin(ambiente: Ambiente): string {
  return process.env.NFSE_BASE_URL?.trim().replace(/\/+$/, "") || SEFIN[ambiente];
}
function adn(ambiente: Ambiente): string {
  return process.env.NFSE_BASE_URL?.trim().replace(/\/+$/, "") || ADN[ambiente];
}

export type ErroApi = { codigo: string; descricao: string; complemento?: string };

type Resposta = { status: number; json: any; texto: string }; // eslint-disable-line @typescript-eslint/no-explicit-any

function chamar(
  url: string,
  cert: Pick<CertificadoCarregado, "pfxTls" | "senha">,
  metodo: "GET" | "POST",
  corpo?: unknown,
  timeoutMs = 60000,
): Promise<Resposta> {
  return new Promise((resolve, reject) => {
    const dados = corpo === undefined ? undefined : Buffer.from(JSON.stringify(corpo));
    const local = url.startsWith("http://");
    const opcoes = {
      method: metodo,
      timeout: timeoutMs,
      headers: {
        Accept: "application/json",
        ...(dados ? { "Content-Type": "application/json", "Content-Length": String(dados.length) } : {}),
      },
      ...(local ? {} : { pfx: cert.pfxTls, passphrase: cert.senha }),
    };
    const req = (local ? http : https).request(url, opcoes, (res) => {
      const partes: Buffer[] = [];
      res.on("data", (c) => partes.push(c));
      res.on("end", () => {
        const texto = Buffer.concat(partes).toString("utf8");
        let json: unknown = null;
        try {
          json = texto ? JSON.parse(texto) : null;
        } catch {
          json = null;
        }
        resolve({ status: res.statusCode ?? 0, json, texto });
      });
    });
    req.on("timeout", () =>
      req.destroy(Object.assign(new Error("Tempo esgotado ao falar com a API nacional da NFS-e."), { code: "TIMEOUT" })),
    );
    req.on("error", reject);
    if (dados) req.write(dados);
    req.end();
  });
}

export const compactar = (xml: string) => gzipSync(Buffer.from(xml, "utf8")).toString("base64");
export const descompactar = (b64: string) => gunzipSync(Buffer.from(b64, "base64")).toString("utf8");

/** Erros vem em "erros" (lista) na emissao e em "erro" (objeto) nas demais rotas. */
function lerErros(r: Resposta): ErroApi[] {
  const lista = r.json?.erros ?? (r.json?.erro ? [r.json.erro] : []);
  const erros = (Array.isArray(lista) ? lista : [])
    .map((e: Record<string, unknown>) => ({
      codigo: String(e?.codigo ?? e?.Codigo ?? ""),
      descricao: String(e?.descricao ?? e?.Descricao ?? ""),
      complemento: (e?.complemento ?? e?.Complemento ?? undefined) as string | undefined,
    }))
    .filter((e: ErroApi) => e.codigo || e.descricao);
  if (erros.length > 0) return erros;
  return [
    {
      codigo: `HTTP ${r.status}`,
      descricao:
        r.texto.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) || "Resposta inesperada da API nacional.",
    },
  ];
}

export type ResultadoEmissao =
  | { ok: true; chaveAcesso: string; idDps: string; nfseXml: string; alertas: ErroApi[] }
  | { ok: false; status: number; erros: ErroApi[] };

export async function enviarDps(
  ambiente: Ambiente,
  dpsAssinada: string,
  cert: Pick<CertificadoCarregado, "pfxTls" | "senha">,
): Promise<ResultadoEmissao> {
  const r = await chamar(`${sefin(ambiente)}/nfse`, cert, "POST", { dpsXmlGZipB64: compactar(dpsAssinada) });
  if (r.status === 201 && r.json?.nfseXmlGZipB64) {
    return {
      ok: true,
      chaveAcesso: String(r.json.chaveAcesso),
      idDps: String(r.json.idDps),
      nfseXml: descompactar(r.json.nfseXmlGZipB64),
      alertas: Array.isArray(r.json.alertas) ? r.json.alertas : [],
    };
  }
  return { ok: false, status: r.status, erros: lerErros(r) };
}

/** Recupera a chave da NFS-e gerada para uma DPS — quando o envio caiu por tempo esgotado. */
export async function consultarDps(
  ambiente: Ambiente,
  idDps: string,
  cert: Pick<CertificadoCarregado, "pfxTls" | "senha">,
): Promise<string | null> {
  const r = await chamar(`${sefin(ambiente)}/dps/${idDps}`, cert, "GET");
  return r.status === 200 && r.json?.chaveAcesso ? String(r.json.chaveAcesso) : null;
}

export async function consultarNfse(
  ambiente: Ambiente,
  chave: string,
  cert: Pick<CertificadoCarregado, "pfxTls" | "senha">,
): Promise<string | null> {
  const r = await chamar(`${sefin(ambiente)}/nfse/${chave}`, cert, "GET");
  return r.status === 200 && r.json?.nfseXmlGZipB64 ? descompactar(r.json.nfseXmlGZipB64) : null;
}

export type ResultadoEvento = { ok: true; eventoXml: string } | { ok: false; status: number; erros: ErroApi[] };

export async function enviarEvento(
  ambiente: Ambiente,
  chave: string,
  pedidoAssinado: string,
  cert: Pick<CertificadoCarregado, "pfxTls" | "senha">,
): Promise<ResultadoEvento> {
  const r = await chamar(`${sefin(ambiente)}/nfse/${chave}/eventos`, cert, "POST", {
    pedidoRegistroEventoXmlGZipB64: compactar(pedidoAssinado),
  });
  if (r.status === 201 && r.json?.eventoXmlGZipB64) return { ok: true, eventoXml: descompactar(r.json.eventoXmlGZipB64) };
  return { ok: false, status: r.status, erros: lerErros(r) };
}

/** Situacao do municipio no convenio nacional — tambem serve de teste de conexao com o certificado. */
export async function consultarConvenio(
  ambiente: Ambiente,
  codigoMunicipio: string,
  cert: Pick<CertificadoCarregado, "pfxTls" | "senha">,
) {
  const r = await chamar(`${adn(ambiente)}/parametrizacao/${codigoMunicipio}/convenio`, cert, "GET", undefined, 30000);
  return { status: r.status, parametros: r.json?.parametrosConvenio ?? null, mensagem: r.json?.mensagem ?? r.texto.slice(0, 200) };
}
