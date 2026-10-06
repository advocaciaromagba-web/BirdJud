import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
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
    const { escritorioId } = await exigirSessao();
    const { id } = await params;
    const corpo = await req.json().catch(() => null);
    const quantos = await salvarParticipantes(
      escritorioId,
      id,
      (corpo as { participantes?: unknown })?.participantes,
    );
    return NextResponse.json({ ok: true, quantos });
  } catch (erro) {
    if (erro instanceof ParticipanteInvalido) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
