import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { proximosDoUsuario } from "@/lib/proximos-da-agenda";

export const dynamic = "force-dynamic";

/**
 * O que vem pela frente na agenda de quem esta logado, para o alerta da tela
 * (src/componentes/AlertaDaAgenda.tsx). Quem nao entra na Agenda nao recebe
 * nada — e o mesmo que nao ver a agenda.
 */
export async function GET() {
  try {
    const { escritorioId, usuarioId, acesso } = await exigirSessao();
    if (acesso.AGENDA !== true) return NextResponse.json({ alertaSonoro: false, compromissos: [] });
    return NextResponse.json(await proximosDoUsuario(escritorioId, usuarioId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (erro) {
    return tratarErro(erro);
  }
}

const preferencia = z.object({ alertaSonoro: z.boolean() });

/** Liga ou desliga o som. Cada pessoa decide o seu. */
export async function POST(req: Request) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao();
    const corpo = preferencia.safeParse(await req.json());
    if (!corpo.success) return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
    await comEscritorio(escritorioId, (db) =>
      db.usuario.update({ where: { id: usuarioId }, data: { alertaSonoro: corpo.data.alertaSonoro } }),
    );
    return NextResponse.json({ ok: true, alertaSonoro: corpo.data.alertaSonoro });
  } catch (erro) {
    return tratarErro(erro);
  }
}
