import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { EntrevistaNaoEncontrada, excluirEntrevista } from "@/lib/entrevista-do-escritorio";

export const dynamic = "force-dynamic";

/** Exclui a entrevista de vez — transcricao, anotacoes e organizacao. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId } = await exigirSessao(undefined, "ENTREVISTAS");
    const { id } = await params;
    await excluirEntrevista(escritorioId, id);
    return NextResponse.json({ ok: true });
  } catch (erro) {
    if (erro instanceof EntrevistaNaoEncontrada) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
