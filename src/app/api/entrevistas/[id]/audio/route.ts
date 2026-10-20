import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import {
  AudioRecusado,
  LIMITE_DE_BYTES,
  SemChaveDeTranscricao,
  TranscricaoFalhou,
} from "@/lib/transcricao-audio";
import {
  EntrevistaNaoEncontrada,
  guardarGravacaoNaPasta,
  transcreverAudio,
} from "@/lib/entrevista-do-escritorio";

export const dynamic = "force-dynamic";
// Audio de uma hora nao transcreve em dez segundos.
export const maxDuration = 600;

/**
 * Transcreve um audio gravado e acrescenta a anotacao.
 *
 * Exige o modulo de IA: o audio sai do escritorio para virar texto, e quem
 * nao contratou IA nao teve essa conversa. Para a entrevista ao vivo existe
 * o gravador local, que nao manda nada para fora.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao("IA", "ENTREVISTAS");
    const { id } = await params;

    const formulario = await req.formData();
    const enviado = formulario.get("audio");
    if (!(enviado instanceof File)) {
      return NextResponse.json({ erro: "Envie um arquivo de áudio." }, { status: 400 });
    }
    // Confere o tamanho ANTES de carregar na memoria.
    if (enviado.size > LIMITE_DE_BYTES) {
      return NextResponse.json(
        {
          erro: `O áudio tem ${Math.round(enviado.size / 1024 / 1024)} MB; o limite é ${LIMITE_DE_BYTES / 1024 / 1024} MB.`,
        },
        { status: 413 },
      );
    }

    // O gravador da tela manda um trecho por minuto, marcado como continua.
    const continua = formulario.get("continua") === "true";
    const dados = Buffer.from(await enviado.arrayBuffer());
    const resultado = await transcreverAudio(
      escritorioId,
      id,
      { nome: enviado.name || "audio", tipo: enviado.type, dados },
      { continua, origem: continua ? "AUDIO_GRAVADO" : "AUDIO_ENVIADO" },
    );
    // O audio importado (o cliente gravou em casa, a audiencia) vai para a
    // pasta do cliente. Os trechos da gravacao na tela nao: a gravacao
    // inteira chega depois, por /gravacao, num arquivo so.
    const pasta = continua
      ? null
      : await guardarGravacaoNaPasta(escritorioId, id, usuarioId, { tipo: enviado.type, dados }, "áudio enviado");
    return NextResponse.json({ ...resultado, pasta });
  } catch (erro) {
    if (
      erro instanceof EntrevistaNaoEncontrada ||
      erro instanceof AudioRecusado ||
      erro instanceof SemChaveDeTranscricao ||
      erro instanceof TranscricaoFalhou
    ) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
