/**
 * Transcricao de audio enviado como arquivo.
 *
 * A CHAVE E DA PLATAFORMA, nao do escritorio — igual a da IA e ao numero de
 * WhatsApp. O custo e absorvido pelo BirdJud e nao se repassa: a medicao em
 * TRANSCRICAO_MIN existe para a plataforma saber quanto gasta, e a metrica
 * de proposito NAO tem modulo nem franquia (ver catalogo.ts).
 *
 * SIGILO, e isto precisa estar escrito: o audio da entrevista SAI do
 * escritorio e vai para a OpenAI virar texto. E a mesma natureza de
 * exposicao que ja existe quando o texto vai para a Claude ser organizado,
 * mas e uma decisao a mais, e a tela diz isso antes de enviar.
 *
 * Isto e para audio GRAVADO — audiencia, reuniao no celular. Para a conversa
 * ao vivo no escritorio existe o GravadorDeFala, que roda no proprio
 * computador e nao manda nada para lugar nenhum. Quando os dois servem,
 * prefira o local.
 */

const ENDERECO = "https://api.openai.com/v1/audio/transcriptions";

/** Trocar aqui muda o que todo escritorio recebe. */
export const MODELO_DE_TRANSCRICAO =
  process.env.OPENAI_MODELO_TRANSCRICAO || "gpt-4o-transcribe";

/** Teto da API. Acima disso o arquivo e recusado antes de subir. */
export const LIMITE_DE_BYTES = 25 * 1024 * 1024;

/** Audio curto demais costuma ser clique no botao errado. */
export const MINIMO_DE_BYTES = 2 * 1024;

export const FORMATOS_ACEITOS = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "video/mp4",
  "video/webm",
] as const;

/**
 * Vocabulario que o modelo erraria por ser raro na fala comum.
 *
 * Generico de proposito: o BirdJud atende escritorio de qualquer lugar do
 * pais e de qualquer area. Citar tribunal ou cidade especifica aqui — como
 * faz o sistema de onde este recurso veio — enviesaria a transcricao de
 * quem nao e de la.
 */
export const VOCABULARIO =
  "Entrevista entre advogado e cliente em um escritorio de advocacia no " +
  "Brasil. Podem aparecer: audiencia, pericia, peticao inicial, " +
  "contestacao, procuracao, honorarios, verbas rescisorias, rescisao, " +
  "insalubridade, periculosidade, INSS, CNIS, CTPS, FGTS, usucapiao, " +
  "inventario, alvara, justica gratuita, prescricao, tutela de urgencia, " +
  "comarca, vara civel, vara do trabalho, Juizado Especial, agravo, " +
  "embargos, credito rural, cedula de produto rural.";

export class SemChaveDeTranscricao extends Error {
  readonly status = 503;
  constructor() {
    super(
      "A plataforma ainda nao configurou a transcricao de audio. " +
        "Use a transcricao ao vivo, que roda no proprio computador.",
    );
    this.name = "SemChaveDeTranscricao";
  }
}

export class AudioRecusado extends Error {
  readonly status = 415;
  constructor(motivo: string) {
    super(motivo);
    this.name = "AudioRecusado";
  }
}

export class TranscricaoFalhou extends Error {
  readonly status: number;
  constructor(mensagem: string, status = 502) {
    super(mensagem);
    this.status = status;
    this.name = "TranscricaoFalhou";
  }
}

/**
 * Traduz o erro do fornecedor para quem esta no escritorio.
 *
 * "401 Unauthorized" nao diz nada a um advogado, e o problema nem e dele: a
 * chave e da plataforma. A mensagem tem de dizer o que ELE pode fazer agora.
 */
export function explicarFalha(status: number, corpo: string): string {
  if (status === 401 || status === 403) {
    return (
      "A plataforma nao conseguiu autenticar na transcricao. Avise o " +
      "suporte; enquanto isso, use a transcricao ao vivo ou digite."
    );
  }
  if (status === 429) {
    return (
      "A transcricao esta sem capacidade no momento. Tente de novo em " +
      "alguns minutos, ou use a transcricao ao vivo."
    );
  }
  if (status === 413) {
    return "O audio e grande demais para a transcricao. Corte em partes menores.";
  }
  if (status >= 500) {
    return "O servico de transcricao esta fora do ar. Tente mais tarde.";
  }
  const detalhe = corpo.slice(0, 200).replace(/\s+/g, " ").trim();
  return `A transcricao recusou o audio${detalhe ? `: ${detalhe}` : "."}`;
}

/** Minutos arredondados para cima, que e a unidade da medicao. */
export function minutosDe(segundos: number): number {
  return Math.max(1, Math.ceil(segundos / 60));
}

/** Confere o arquivo ANTES de virar chamada paga. */
export function conferirAudio(arquivo: {
  tipo: string;
  tamanho: number;
}): void {
  if (arquivo.tamanho > LIMITE_DE_BYTES) {
    throw new AudioRecusado(
      `O audio tem ${Math.round(arquivo.tamanho / 1024 / 1024)} MB; o limite ` +
        `e ${LIMITE_DE_BYTES / 1024 / 1024} MB. Corte em partes menores.`,
    );
  }
  if (arquivo.tamanho < MINIMO_DE_BYTES) {
    throw new AudioRecusado("O arquivo esta vazio ou quase vazio.");
  }
  // O tipo pode vir com parametro ("audio/webm;codecs=opus").
  const tipo = arquivo.tipo.split(";")[0].trim().toLowerCase();
  if (!FORMATOS_ACEITOS.includes(tipo as (typeof FORMATOS_ACEITOS)[number])) {
    throw new AudioRecusado(
      `Formato ${tipo || "desconhecido"} nao serve. Envie MP3, M4A, WAV, ` +
        "WebM, OGG ou MP4.",
    );
  }
}

export type ResultadoDaTranscricao = {
  texto: string;
  /** Segundos de audio, quando o fornecedor informa. */
  segundos: number | null;
  modelo: string;
};

/**
 * Manda o audio e devolve o texto.
 *
 * `duracao` nem sempre volta: alguns modelos nao a informam. Quando falta, a
 * medicao usa o tamanho do arquivo como estimativa grosseira — melhor medir
 * aproximado do que nao medir, porque e a plataforma que paga.
 */
export async function transcrever(
  audio: { nome: string; tipo: string; dados: Buffer },
  chave = process.env.OPENAI_API_KEY,
): Promise<ResultadoDaTranscricao> {
  if (!chave) throw new SemChaveDeTranscricao();
  conferirAudio({ tipo: audio.tipo, tamanho: audio.dados.length });

  const formulario = new FormData();
  formulario.append(
    "file",
    new Blob([new Uint8Array(audio.dados)], { type: audio.tipo }),
    audio.nome,
  );
  formulario.append("model", MODELO_DE_TRANSCRICAO);
  formulario.append("language", "pt");
  formulario.append("prompt", VOCABULARIO);
  formulario.append("response_format", "verbose_json");

  let resposta: Response;
  try {
    resposta = await fetch(process.env.OPENAI_BASE_URL ?? ENDERECO, {
      method: "POST",
      headers: { authorization: `Bearer ${chave}` },
      body: formulario,
      // Audio de uma hora leva minutos para transcrever; o padrao do fetch
      // cortaria no meio e cobraria do mesmo jeito.
      signal: AbortSignal.timeout(10 * 60_000),
    });
  } catch (falha) {
    throw new TranscricaoFalhou(
      `Nao deu para falar com a transcricao: ${(falha as Error).message}`,
    );
  }

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new TranscricaoFalhou(
      explicarFalha(resposta.status, corpo),
      resposta.status === 413 ? 413 : 502,
    );
  }

  const dados = (await resposta.json()) as {
    text?: string;
    duration?: number;
  };
  const texto = (dados.text ?? "").trim();
  if (!texto) {
    throw new TranscricaoFalhou(
      "A transcricao voltou vazia. O audio pode estar mudo ou baixo demais.",
      422,
    );
  }

  return {
    texto,
    segundos: typeof dados.duration === "number" ? dados.duration : null,
    modelo: MODELO_DE_TRANSCRICAO,
  };
}
