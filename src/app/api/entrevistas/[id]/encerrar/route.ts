import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { EntrevistaNaoEncontrada, encerrar, guardarPdfNaPasta } from "@/lib/entrevista-do-escritorio";

export const dynamic = "force-dynamic";

/**
 * Encerra a entrevista ({ reabrir: true } reabre). Nada e apagado. Ao
 * encerrar, o PDF da transcricao vai para a pasta do cliente ligado.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao(undefined, "ENTREVISTAS");
    const { id } = await params;
    const corpo = (await req.json().catch(() => ({}))) as { reabrir?: unknown };
    const reabrir = corpo.reabrir === true;
    await encerrar(escritorioId, id, reabrir);
    const pasta = reabrir ? null : await guardarPdfNaPasta(escritorioId, id, usuarioId);
    return NextResponse.json({ ok: true, pasta });
  } catch (erro) {
    if (erro instanceof EntrevistaNaoEncontrada) return NextResponse.json({ erro: erro.message }, { status: erro.status });
    return tratarErro(erro);
  }
}
