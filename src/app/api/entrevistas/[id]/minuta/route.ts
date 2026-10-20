import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { EntrevistaIncompleta, EntrevistaNaoEncontrada, gerarMinuta } from "@/lib/entrevista-do-escritorio";

export const dynamic = "force-dynamic";

const pedido = z.object({
  observacoes: z.string().max(4000).optional(),
  ignorarPendencias: z.boolean().optional(),
});

/**
 * O texto para a peticao inicial. So o advogado (ou o administrador) libera —
 * nunca automatico ao encerrar a entrevista.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId, usuarioId, papel } = await exigirSessao(undefined, "ENTREVISTAS");
    if (papel !== "ADVOGADO" && papel !== "ADMIN") {
      return NextResponse.json({ erro: "Somente o advogado responsável libera o texto da petição inicial." }, { status: 403 });
    }
    const { id } = await params;
    const corpo = pedido.safeParse(await req.json().catch(() => ({})));
    if (!corpo.success) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
    return NextResponse.json(await gerarMinuta(escritorioId, id, usuarioId, corpo.data));
  } catch (erro) {
    if (erro instanceof EntrevistaNaoEncontrada || erro instanceof EntrevistaIncompleta) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
