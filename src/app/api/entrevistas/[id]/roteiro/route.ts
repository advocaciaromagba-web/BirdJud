import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import {
  EntrevistaNaoEncontrada,
  gerarRoteiro,
} from "@/lib/entrevista-do-escritorio";

export const dynamic = "force-dynamic";

/**
 * Pede o roteiro de perguntas.
 *
 * Nunca falha por falta de IA: sem o modulo, sem chave ou com recusa, o
 * roteiro basico volta e `comIA` diz a verdade para a tela.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao(
      undefined,
      "ENTREVISTAS",
    );
    const { id } = await params;
    const corpo = (await req.json().catch(() => ({}))) as { tipoAcao?: unknown };
    const tipoAcao = typeof corpo.tipoAcao === "string" ? corpo.tipoAcao : null;
    return NextResponse.json(await gerarRoteiro(escritorioId, id, usuarioId, tipoAcao));
  } catch (erro) {
    if (erro instanceof EntrevistaNaoEncontrada) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
