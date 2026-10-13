import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { NaoDaParaMandar } from "@/lib/documento-no-whatsapp";
import { EntrevistaNaoEncontrada, SemPerguntas, mandarPerguntasNoWhatsapp } from "@/lib/entrevista-do-escritorio";

export const dynamic = "force-dynamic";

/** Manda o PDF das perguntas ao entrevistado pelo WhatsApp do escritorio. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao("WHATSAPP", "ENTREVISTAS");
    const { id } = await params;
    return NextResponse.json(await mandarPerguntasNoWhatsapp(escritorioId, id, usuarioId));
  } catch (erro) {
    if (erro instanceof EntrevistaNaoEncontrada || erro instanceof SemPerguntas) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    if (erro instanceof NaoDaParaMandar) {
      return NextResponse.json({ erro: erro.message }, { status: 422 });
    }
    return tratarErro(erro);
  }
}
