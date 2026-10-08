import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { TranscricaoCurta } from "@/lib/entrevista";
import {
  EntrevistaNaoEncontrada,
  organizar,
} from "@/lib/entrevista-do-escritorio";

export const dynamic = "force-dynamic";

/** Organiza a anotacao em topicos. Exige o modulo de IA: aqui nao ha substituto. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId } = await exigirSessao("IA", "ENTREVISTAS");
    const { id } = await params;
    return NextResponse.json({ analise: await organizar(escritorioId, id) });
  } catch (erro) {
    if (erro instanceof EntrevistaNaoEncontrada || erro instanceof TranscricaoCurta) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
