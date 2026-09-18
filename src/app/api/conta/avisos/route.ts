import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";

export const dynamic = "force-dynamic";

const preferencias = z.object({
  recebeResumo: z.boolean(),
  recebeLembretes: z.boolean(),
});

/** Cada pessoa decide o que recebe. Ninguem decide pelos outros. */
export async function POST(req: Request) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao();
    const corpo = preferencias.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }

    await comEscritorio(escritorioId, (db) =>
      db.usuario.update({ where: { id: usuarioId }, data: corpo.data })
    );
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return tratarErro(erro);
  }
}
