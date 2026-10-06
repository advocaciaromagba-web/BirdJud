// Cliente da IA da plataforma.
//
// A chave e da plataforma, nao do escritorio — e o plano ja previa assim. Por
// isso o consumo precisa ser medido POR ESCRITORIO: e a plataforma que paga a
// conta e repassa pela franquia do modulo.
import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
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

/**
 * Uma chamada cujo resultado precisa ter FORMA, nao texto livre.
 *
 * POR QUE NAO E `tool_choice` FORCADO: o jeito classico de arrancar JSON do
 * modelo era declarar uma ferramenta e obrigar a chamada
 * (`tool_choice: {type: "tool"}`). Isso deixou de valer — nos modelos atuais a
 * chamada forcada responde 400. O caminho de hoje e saida estruturada, que o
 * proprio servidor valida contra o esquema.
 *
 * `parsed_output` volta null quando o modelo nao conseguiu produzir algo que
 * casasse com o esquema. Tratamos isso como falha explicita, nunca como
 * resultado vazio: um checklist de documentos pela metade e pior que nenhum,
 * porque ninguem percebe o que faltou.
 *
 * O esquema vai como JSON Schema, nao pelo ajudante de zod: o projeto esta no
 * zod 3 e aquele ajudante quer o 4. Trocar a versao do zod aqui mexeria em
 * todas as rotas do sistema para ganhar acucar sintatico em uma chamada.
 */
export async function pedirEstruturado<T>(
  sistema: string,
  entrada: string,
  esquema: Record<string, unknown> & { type: "object" },
  esforco: "low" | "medium" | "high" = "medium",
): Promise<{ dados: T; tokensEntrada: number; tokensSaida: number; modelo: string }> {
  if (entrada.length > LIMITE_DE_CARACTERES)
    throw new EntradaLongaDemais(entrada.length);

  const resposta = await obterCliente().messages.parse({
    model: MODELO,
    max_tokens: MAX_TOKENS,
    system: [
      { type: "text", text: sistema, cache_control: { type: "ephemeral" } },
    ],
    output_config: {
      effort: esforco,
      // O ajudante tipa o esquema de forma literal; aqui ele chega como dado,
      // e quem garante a forma do resultado e o `esquema` que o chamador passa
      // junto do tipo T.
      format: jsonSchemaOutputFormat(
        esquema as unknown as Parameters<typeof jsonSchemaOutputFormat>[0],
      ),
    },
    messages: [{ role: "user", content: entrada }],
  });

  if (resposta.stop_reason === "refusal") {
    throw new IARecusou(resposta.stop_details?.category ?? null);
  }
  if (!resposta.parsed_output) {
    throw new Error("A IA respondeu fora do formato pedido.");
  }

  return {
    dados: resposta.parsed_output as T,
    tokensEntrada:
      resposta.usage.input_tokens +
      (resposta.usage.cache_read_input_tokens ?? 0),
    tokensSaida: resposta.usage.output_tokens,
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

/** Tipos que o modelo consegue olhar. Nao e a lista do modulo Nuvem: e a da leitura. */
export const TIPOS_QUE_A_IA_LE: Record<string, "document" | "image"> = {
  "application/pdf": "document",
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
};

/** Teto por chamada de leitura. Papel de cadastro nao chega perto disso. */
export const MAXIMO_DE_ANEXOS = 5;
export const MAXIMO_DE_BYTES = 12 * 1024 * 1024;

export type Anexo = { nome: string; tipo: string; dados: Buffer };

export class AnexoRecusado extends Error {
  readonly status = 415;
  constructor(motivo: string) {
    super(motivo);
    this.name = "AnexoRecusado";
  }
}

/**
 * Uma chamada com documentos anexados — foto de RG, PDF da inicial.
 *
 * Separada de `pedir` de proposito: aqui a entrada e binaria, o limite e de
 * bytes e nao de caracteres, e a recusa por tipo de arquivo acontece antes de
 * virar chamada paga.
 */
export async function pedirSobreDocumentos(
  sistema: string,
  anexos: Anexo[],
  instrucao: string,
  esforco: "low" | "medium" | "high" = "medium",
): Promise<Resultado> {
  if (anexos.length === 0)
    throw new AnexoRecusado("Envie ao menos um documento.");
  if (anexos.length > MAXIMO_DE_ANEXOS)
    throw new AnexoRecusado(
      `Envie no maximo ${MAXIMO_DE_ANEXOS} documentos por leitura.`,
    );

  const total = anexos.reduce((soma, anexo) => soma + anexo.dados.length, 0);
  if (total > MAXIMO_DE_BYTES)
    throw new AnexoRecusado(
      `Os documentos somam mais de ${Math.round(MAXIMO_DE_BYTES / (1024 * 1024))} MB.`,
    );

  const blocos: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const anexo of anexos) {
    const familia = TIPOS_QUE_A_IA_LE[anexo.tipo];
    if (!familia)
      throw new AnexoRecusado(`${anexo.nome}: envie PDF, JPG, PNG ou WebP.`);

    // O nome do arquivo vai junto: e o que permite a IA dizer de qual
    // documento saiu cada campo, e a pessoa conferir sem adivinhar.
    blocos.push({ type: "text", text: `Documento: ${anexo.nome}` });
    blocos.push(
      familia === "document"
        ? {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: anexo.dados.toString("base64"),
            },
          }
        : {
            type: "image",
            source: {
              type: "base64",
              media_type: anexo.tipo as
                | "image/jpeg"
                | "image/png"
                | "image/webp",
              data: anexo.dados.toString("base64"),
            },
          },
    );
  }
  blocos.push({ type: "text", text: instrucao });

  const resposta = await obterCliente().beta.messages.create({
    model: MODELO,
    max_tokens: MAX_TOKENS,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [
      { type: "text", text: sistema, cache_control: { type: "ephemeral" } },
    ],
    output_config: { effort: esforco },
    messages: [{ role: "user", content: blocos }],
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
    modelo: resposta.model,
  };
}
