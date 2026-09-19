// Transporte para o ambiente NACIONAL da NFS-e (ADN / Sefin Nacional).
//
// Como o layout, isto foi escrito a partir da documentacao e **ainda nao foi
// batido contra a homologacao**. Os dois pontos incertos estao marcados com
// CONFERIR. `npm run conferir-nfse` e o caminho de fechar isso.
import { gzipSync, gunzipSync } from "node:zlib";
import { buscarComLimite, descreverFalha } from "../conectores/tipos";
import type { Ambiente } from "./layout";

export class FalhaNaNfse extends Error {
  readonly status: number;
  /** true quando repetir nao adianta: erro de conteudo, nao de caminho. */
  readonly definitivo: boolean;
  constructor(motivo: string, definitivo: boolean, status = 502) {
    super(motivo);
    this.name = "FalhaNaNfse";
    this.definitivo = definitivo;
    this.status = status;
  }
}

export function base(ambiente: Ambiente): string {
  const daConfiguracao = process.env.NFSE_BASE_URL?.trim();
  if (daConfiguracao) return daConfiguracao.replace(/\/+$/, "");
  // CONFERIR: enderecos oficiais do ambiente nacional.
  return ambiente === "PRODUCAO"
    ? "https://sefin.nfse.gov.br/sefinnacional"
    : "https://sefin.producaorestrita.nfse.gov.br/sefinnacional";
}

/** O DPS viaja comprimido e em base64 — e assim que o ADN recebe. */
export function empacotar(xml: string): string {
  return gzipSync(Buffer.from(xml, "utf8")).toString("base64");
}

export function desempacotar(base64: string): string {
  return gunzipSync(Buffer.from(base64, "base64")).toString("utf8");
}

export type RetornoDaEmissao = {
  chaveAcesso: string;
  numero: string | null;
  linkPdf: string | null;
  xml: string | null;
};

type CorpoDeErro = {
  erros?: { codigo?: string; descricao?: string; complemento?: string }[];
  mensagem?: string;
};

function motivoDoErro(corpo: CorpoDeErro | null, status: number): string {
  const erro = corpo?.erros?.[0];
  if (erro?.descricao) {
    // O codigo ajuda o contador a achar o campo no manual: vale mantê-lo.
    return erro.codigo ? `${erro.codigo}: ${erro.descricao}` : erro.descricao;
  }
  return corpo?.mensagem ?? `O ambiente nacional respondeu ${status}.`;
}

/**
 * Manda o DPS assinado.
 *
 * Erro 4xx e de conteudo — campo errado, nota duplicada, inscricao invalida —
 * e repetir nao muda nada. 5xx e falha do lado de la, que a fila tenta de novo.
 */
export async function emitir(
  xmlAssinado: string,
  ambiente: Ambiente
): Promise<RetornoDaEmissao> {
  let resposta: Response;
  try {
    resposta = await buscarComLimite(`${base(ambiente)}/nfse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dpsXmlGZipB64: empacotar(xmlAssinado) }),
    });
  } catch (erro) {
    throw new FalhaNaNfse(descreverFalha(erro), false);
  }

  const corpo = (await resposta.json().catch(() => null)) as
    | (CorpoDeErro & {
        chaveAcesso?: string;
        nfseXmlGZipB64?: string;
        numeroNfse?: string;
        linkPdf?: string;
      })
    | null;

  if (!resposta.ok) {
    throw new FalhaNaNfse(motivoDoErro(corpo, resposta.status), resposta.status < 500);
  }
  if (!corpo?.chaveAcesso) {
    throw new FalhaNaNfse("A nota foi aceita sem chave de acesso no retorno.", false);
  }

  return {
    chaveAcesso: corpo.chaveAcesso,
    numero: corpo.numeroNfse ?? null,
    linkPdf: corpo.linkPdf ?? null,
    xml: corpo.nfseXmlGZipB64 ? desempacotar(corpo.nfseXmlGZipB64) : null,
  };
}

/**
 * Cancela a nota.
 *
 * O cancelamento da NFS-e tem prazo e regra municipal — fora do prazo, o
 * caminho e substituicao, nao cancelamento. Quem diz nao e o ambiente nacional,
 * e a mensagem dele chega inteira ate a tela: inventar regra de prazo aqui
 * daria um "nao" nosso onde a prefeitura diria "sim".
 */
export async function cancelar(
  chaveAcesso: string,
  xmlDoEventoAssinado: string,
  ambiente: Ambiente
): Promise<void> {
  let resposta: Response;
  try {
    resposta = await buscarComLimite(
      `${base(ambiente)}/nfse/${encodeURIComponent(chaveAcesso)}/eventos`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedidoRegistroEventoXmlGZipB64: empacotar(xmlDoEventoAssinado) }),
      }
    );
  } catch (erro) {
    throw new FalhaNaNfse(descreverFalha(erro), false);
  }

  if (!resposta.ok) {
    const corpo = (await resposta.json().catch(() => null)) as CorpoDeErro | null;
    throw new FalhaNaNfse(motivoDoErro(corpo, resposta.status), resposta.status < 500);
  }
}
