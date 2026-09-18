import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";

export const dynamic = "force-dynamic";

const marcacao = z.object({
  id: z.string().min(1),
  lida: z.boolean().optional(),
  arquivada: z.boolean().optional(),
});

export async function GET() {
  try {
    const { escritorioId } = await exigirSessao("PUBLICACOES_DJEN");
    const publicacoes = await comEscritorio(escritorioId, (db) =>
      db.publicacao.findMany({
        where: { arquivada: false },
        orderBy: [{ urgente: "desc" }, { dataDisponibilizacao: "desc" }],
        take: 200,
      })
    );
    return NextResponse.json({ publicacoes });
  } catch (erro) {
    return tratarErro(erro);
  }
}

/** Marcar como lida ou arquivar. */
export async function PATCH(req: Request) {
  try {
    const { escritorioId } = await exigirSessao("PUBLICACOES_DJEN");
    const corpo = marcacao.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }

    const { id, ...campos } = corpo.data;
    // updateMany com o id no where: a extensao injeta o escritorio, entao id de
    // outro escritorio simplesmente nao encontra nada.
    const { count } = await comEscritorio(escritorioId, (db) =>
      db.publicacao.updateMany({ where: { id }, data: campos })
    );

    if (count === 0) {
      return NextResponse.json({ erro: "Publicacao nao encontrada." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return tratarErro(erro);
  }
}
