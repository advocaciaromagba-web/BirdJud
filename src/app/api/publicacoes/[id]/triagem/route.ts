import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { SemPublicacao, triarPublicacao } from "@/lib/triagem-do-escritorio";

export const dynamic = "force-dynamic";

/** Refaz a triagem de uma publicacao. A rotina da madrugada ja fez a primeira. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId } = await exigirSessao("PUBLICACOES_DJEN", "PUBLICACOES");
    const { id } = await params;
    return NextResponse.json({ triagem: await triarPublicacao(escritorioId, id) });
  } catch (erro) {
    if (erro instanceof SemPublicacao) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
