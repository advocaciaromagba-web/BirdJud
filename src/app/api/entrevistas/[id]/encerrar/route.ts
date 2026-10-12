import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { EntrevistaNaoEncontrada, encerrar } from "@/lib/entrevista-do-escritorio";

export const dynamic = "force-dynamic";

/** Encerra a entrevista ({ reabrir: true } reabre). Nada e apagado. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId } = await exigirSessao(undefined, "ENTREVISTAS");
    const { id } = await params;
    const corpo = (await req.json().catch(() => ({}))) as { reabrir?: unknown };
    await encerrar(escritorioId, id, corpo.reabrir === true);
    return NextResponse.json({ ok: true });
  } catch (erro) {
    if (erro instanceof EntrevistaNaoEncontrada) return NextResponse.json({ erro: erro.message }, { status: erro.status });
    return tratarErro(erro);
  }
}
