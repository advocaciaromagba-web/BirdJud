import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { avisarAgendamento } from "@/lib/avisos";
import { enfileirar } from "@/lib/fila";
import {
  ParticipanteInvalido,
  participantesDoCompromisso,
  salvarParticipantes,
} from "@/lib/participantes-do-escritorio";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId } = await exigirSessao();
    const { id } = await params;
    return NextResponse.json({
      participantes: await participantesDoCompromisso(escritorioId, id),
    });
  } catch (erro) {
    return tratarErro(erro);
  }
}

/** Troca a lista inteira. Ver salvarParticipantes. */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao();
    const { id } = await params;
    const corpo = await req.json().catch(() => null);
    const quantos = await salvarParticipantes(
      escritorioId,
      id,
      (corpo as { participantes?: unknown })?.participantes,
    );

    // E AQUI que o aviso de "compromisso marcado" costuma sair de verdade: na
    // criacao o compromisso ainda nao tem participante nenhum, porque a lista
    // e gravada nesta tela, depois. A chave leva o participante, entao quem ja
    // foi avisado nao e avisado de novo quando a lista muda.
    try {
      if ((await avisarAgendamento(escritorioId, id, usuarioId)) > 0) {
        await enfileirar("LEMBRAR", escritorioId);
      }
    } catch (falha) {
      console.log(
        `participantes ${id}: aviso nao gerado ${
          falha instanceof Error ? falha.message : ""
        }`.slice(0, 300),
      );
    }

    return NextResponse.json({ ok: true, quantos });
  } catch (erro) {
    if (erro instanceof ParticipanteInvalido) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
