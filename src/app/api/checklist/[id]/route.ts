import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";

export const dynamic = "force-dynamic";

const acao = z.object({
  entregue: z.boolean(),
  arquivoId: z.string().cuid().nullish(),
});

/** Marca o documento como entregue, e liga ao arquivo que o cumpriu. */
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

    const r = await comEscritorio(escritorioId, (db) =>
      db.itemDeChecklist.updateMany({
        where: { id },
        data: {
          entregueEm: corpo.data.entregue ? new Date() : null,
          // Desmarcar solta o arquivo: deixar o vinculo de um item que voltou a
          // ser pendente faria a tela dizer que ha documento quando nao ha.
          arquivoId: corpo.data.entregue ? (corpo.data.arquivoId ?? null) : null,
        },
      }),
    );
    if (r.count === 0) {
      return NextResponse.json({ erro: "Item nao encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return tratarErro(erro);
  }
}
