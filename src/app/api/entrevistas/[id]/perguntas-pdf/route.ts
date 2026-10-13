import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { EntrevistaNaoEncontrada, SemPerguntas, pdfDasPerguntas } from "@/lib/entrevista-do-escritorio";

export const dynamic = "force-dynamic";

/** As perguntas em PDF, para o cliente responder gravando em casa. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId } = await exigirSessao(undefined, "ENTREVISTAS");
    const { id } = await params;
    const { pdf, nome } = await pdfDasPerguntas(escritorioId, id);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(nome)}"`,
      },
    });
  } catch (erro) {
    if (erro instanceof EntrevistaNaoEncontrada || erro instanceof SemPerguntas) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
