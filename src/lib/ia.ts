// Cliente da IA da plataforma.
//
// A chave e da plataforma, nao do escritorio — e o plano ja previa assim. Por
// isso o consumo precisa ser medido POR ESCRITORIO: e a plataforma que paga a
// conta e repassa pela franquia do modulo.
import Anthropic from "@anthropic-ai/sdk";
import { comEscritorio, semEscritorio } from "./prisma";
import { registrarConsumo } from "./consumo";

/** Modelo usado pelo modulo. Trocar aqui muda tudo que o escritorio recebe. */
export const MODELO = "claude-opus-5";

/**
 * Teto de saida por chamada.
 *
 * Nao e cota de custo — e trava contra resposta truncada no meio de uma peca.
 * A cota do escritorio e a franquia do modulo, medida em ConsumoMensal.
 */
const MAX_TOKENS = 16_000;

/** Entrada maior que isto e recusada antes de virar chamada paga. */
export const LIMITE_DE_CARACTERES = 60_000;

let cliente: Anthropic | undefined;

export class SemChaveDeIA extends Error {
  readonly status = 503;
  constructor() {
    super("A plataforma ainda nao configurou a chave de IA.");
    this.name = "SemChaveDeIA";
  }
}

export class EntradaLongaDemais extends Error {
  readonly status = 413;
  constructor(caracteres: number) {
    super(
      `O texto tem ${caracteres} caracteres; o limite por chamada e ${LIMITE_DE_CARACTERES}.`,
    );
    this.name = "EntradaLongaDemais";
  }
}

export class IARecusou extends Error {
  readonly status = 422;
  constructor(categoria: string | null) {
    super(
      `A IA recusou responder a este pedido${categoria ? ` (${categoria})` : ""}.`,
    );
    this.name = "IARecusou";
  }
}

function obterCliente(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new SemChaveDeIA();
  cliente ??= new Anthropic({
    // baseURL so muda em teste; em producao o padrao do SDK e o certo.
    ...(process.env.ANTHROPIC_BASE_URL
      ? { baseURL: process.env.ANTHROPIC_BASE_URL }
      : {}),
  });
  return cliente;
}

export type Resultado = {
  texto: string;
  tokensEntrada: number;
  tokensSaida: number;
  modelo: string;
};

/**
 * Uma chamada ao modelo, medida e com recusa tratada.
 *
 * `fallbacks: "default"` esta ligado de proposito: quando o classificador de
 * seguranca recusa um pedido, a API refaz a chamada em outro modelo em vez de
 * devolver nada. Texto de processo criminal ou de familia toca assunto pesado
 * com frequencia — sem isso, o advogado veria o sistema simplesmente falhar.
 */
export async function pedir(
  sistema: string,
  entrada: string,
  esforco: "low" | "medium" | "high" = "medium",
): Promise<Resultado> {
  if (entrada.length > LIMITE_DE_CARACTERES)
    throw new EntradaLongaDemais(entrada.length);

  const resposta = await obterCliente().beta.messages.create({
    model: MODELO,
    max_tokens: MAX_TOKENS,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // O sistema e estavel entre chamadas: cabe em cache e sai mais barato.
    system: [
      { type: "text", text: sistema, cache_control: { type: "ephemeral" } },
    ],
    output_config: { effort: esforco },
    messages: [{ role: "user", content: entrada }],
  });

  if (resposta.stop_reason === "refusal") {
    throw new IARecusou(resposta.stop_details?.category ?? null);
  }

  const texto = resposta.content
    .filter(
      (bloco): bloco is Anthropic.Beta.BetaTextBlock => bloco.type === "text",
    )
    .map((bloco) => bloco.text)
    .join("\n")
    .trim();

  return {
    texto,
    tokensEntrada:
      resposta.usage.input_tokens +
      (resposta.usage.cache_read_input_tokens ?? 0),
    tokensSaida: resposta.usage.output_tokens,
    // O modelo que respondeu pode nao ser o pedido, quando houve fallback.
    modelo: resposta.model,
  };
}

/** Milhares de tokens, arredondados para cima. E a unidade que a fatura usa. */
export function milTokens(entrada: number, saida: number): number {
  return Math.max(1, Math.ceil((entrada + saida) / 1000));
}

export type Analise = {
  id: string;
  texto: string;
  modelo: string;
};

/** Faz a chamada, grava o resultado e mede o consumo do escritorio. */
export async function pedirEGravar(opcoes: {
  escritorioId: string;
  usuarioId: string;
  tipo: string;
  publicacaoId?: string | null;
  sistema: string;
  entrada: string;
  esforco?: "low" | "medium" | "high";
}): Promise<Analise> {
  const resultado = await pedir(
    opcoes.sistema,
    opcoes.entrada,
    opcoes.esforco ?? "medium",
  );

  const registro = await comEscritorio(opcoes.escritorioId, (db) =>
    db.analiseIA.create({
      data: semEscritorio({
        usuarioId: opcoes.usuarioId,
        publicacaoId: opcoes.publicacaoId ?? null,
        tipo: opcoes.tipo,
        modelo: resultado.modelo,
        resultado: resultado.texto,
        tokensEntrada: resultado.tokensEntrada,
        tokensSaida: resultado.tokensSaida,
      }),
    }),
  );

  await registrarConsumo(
    opcoes.escritorioId,
    "IA_MIL_TOKENS",
    milTokens(resultado.tokensEntrada, resultado.tokensSaida),
  );

  return { id: registro.id, texto: resultado.texto, modelo: resultado.modelo };
}
