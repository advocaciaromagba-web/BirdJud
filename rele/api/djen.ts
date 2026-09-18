// Rele do DJEN na Vercel.
//
// POR QUE ISTO EXISTE: a API Comunica do CNJ bloqueia por pais (CloudFront).
// De fora do Brasil a resposta e 403. A aplicacao roda onde for mais barato; o
// unico pedaco que precisa estar em solo brasileiro e esta funcao, fixada na
// regiao gru1 (Sao Paulo) pelo rele/vercel.json.
//
// ISTO NAO E UM PROXY ABERTO. Quem chama nao escolhe o destino: o endereco do
// DJEN esta aqui dentro, so a consulta de comunicacoes e permitida, e cada
// parametro precisa casar com o formato esperado. Sem o token da plataforma,
// nao passa nada.
//
// De proposito, este arquivo nao importa nada de src/: o rele e implantado
// sozinho (Root Directory "rele" na Vercel) e vale como fronteira propria. A
// pequena repeticao da lista de parametros e o preco disso, e e barata.
import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const TEMPO_LIMITE = 20_000;

/** So a consulta de comunicacoes, e so com estes parametros neste formato. */
const PARAMETROS: Record<string, RegExp> = {
  numeroOab: /^\d{1,10}$/,
  ufOab: /^[A-Z]{2}$/,
  dataDisponibilizacaoInicio: /^\d{4}-\d{2}-\d{2}$/,
  dataDisponibilizacaoFim: /^\d{4}-\d{2}-\d{2}$/,
  pagina: /^\d{1,4}$/,
  itensPorPagina: /^\d{1,3}$/,
};

const OBRIGATORIOS = [
  "numeroOab",
  "ufOab",
  "dataDisponibilizacaoInicio",
  "dataDisponibilizacaoFim",
];

function base(): string {
  return process.env.DJEN_BASE_URL ?? "https://comunicaapi.pje.jus.br/api/v1";
}

/** Compara em tempo constante e sem vazar o tamanho do segredo. */
export function tokenConfere(recebido: string | undefined, esperado: string): boolean {
  if (!recebido) return false;
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

export type Recusa = { status: number; erro: string };

/**
 * Valida a consulta e devolve os parametros que podem seguir para o DJEN.
 * Parametro fora da lista e recusa, nao remocao silenciosa: se o chamador
 * mandou algo que nao entendemos, e melhor ele saber disso agora.
 */
export function conferirConsulta(
  entrada: URLSearchParams
): { parametros: URLSearchParams } | Recusa {
  const parametros = new URLSearchParams();

  for (const [chave, valor] of entrada.entries()) {
    const formato = PARAMETROS[chave];
    if (!formato) return { status: 400, erro: `Parametro nao permitido: ${chave}.` };
    if (!formato.test(valor)) return { status: 400, erro: `Parametro invalido: ${chave}.` };
    if (parametros.has(chave)) return { status: 400, erro: `Parametro repetido: ${chave}.` };
    parametros.set(chave, valor);
  }

  for (const chave of OBRIGATORIOS) {
    if (!parametros.has(chave)) return { status: 400, erro: `Falta o parametro ${chave}.` };
  }
  return { parametros };
}

function responder(resposta: ServerResponse, status: number, corpo: unknown): void {
  const texto = JSON.stringify(corpo);
  resposta.statusCode = status;
  resposta.setHeader("content-type", "application/json; charset=utf-8");
  resposta.setHeader("cache-control", "no-store");
  resposta.end(texto);
}

export default async function handler(
  pedido: IncomingMessage,
  resposta: ServerResponse
): Promise<void> {
  if (pedido.method !== "GET") {
    return responder(resposta, 405, { erro: "Use GET." });
  }

  const esperado = process.env.RELE_TOKEN;
  if (!esperado) {
    // Falha fechada: rele sem token nao vira porta aberta para o DJEN.
    return responder(resposta, 503, { erro: "Rele sem RELE_TOKEN configurado." });
  }

  const cabecalho = pedido.headers.authorization ?? "";
  const recebido = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : undefined;
  if (!tokenConfere(recebido, esperado)) {
    return responder(resposta, 401, { erro: "Token do rele invalido." });
  }

  const conferida = conferirConsulta(new URL(pedido.url ?? "/", "http://rele").searchParams);
  if ("erro" in conferida) {
    return responder(resposta, conferida.status, { erro: conferida.erro });
  }

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE);
  try {
    const acima = await fetch(`${base()}/comunicacao?${conferida.parametros}`, {
      headers: { Accept: "application/json" },
      signal: controle.signal,
    });
    const corpo = await acima.text();
    resposta.statusCode = acima.status;
    resposta.setHeader("content-type", "application/json; charset=utf-8");
    resposta.setHeader("cache-control", "no-store");
    resposta.end(corpo);
  } catch (erro) {
    const motivo =
      erro instanceof Error && erro.name === "AbortError"
        ? "O DJEN nao respondeu a tempo."
        : "Falha ao falar com o DJEN.";
    responder(resposta, 502, { erro: motivo });
  } finally {
    clearTimeout(relogio);
  }
}
