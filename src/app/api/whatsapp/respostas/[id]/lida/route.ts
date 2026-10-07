import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { marcarComoLida } from "@/lib/entrada-whatsapp";

export const dynamic = "force-dynamic";

/** Tira da caixa de entrada a resposta que alguem ja leu. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId } = await exigirSessao(undefined, "AGENDA");
    const { id } = await params;
    await marcarComoLida(escritorioId, id);
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return tratarErro(erro);
  }
}
