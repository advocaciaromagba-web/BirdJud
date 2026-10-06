import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";

export const dynamic = "force-dynamic";

const acao = z.object({ cumprido: z.boolean() });

/**
 * Marcar o prazo como cumprido, ou voltar atras.
 *
 * NAO apaga e nao muda a data: prazo cumprido continua no historico, com a
 * mesma explicacao de como a data foi obtida. Em escritorio, "quando isso foi
 * protocolado?" e pergunta que chega meses depois.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId } = await exigirSessao();
    const { id } = await params;
    const corpo = acao.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }

    // updateMany com o id no filtro: prazo de outro escritorio nao e
    // encontrado, em vez de dar um erro que conta que ele existe.
    const r = await comEscritorio(escritorioId, (db) =>
      db.prazo.updateMany({
        where: { id },
        data: { cumpridoEm: corpo.data.cumprido ? new Date() : null },
      }),
    );
    if (r.count === 0) {
      return NextResponse.json({ erro: "Prazo nao encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return tratarErro(erro);
  }
}
