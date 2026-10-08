import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { notificacoesDaAgenda } from "@/lib/agenda-do-escritorio";

export const dynamic = "force-dynamic";

/** Auditoria: todo aviso de compromisso, com destino, hora e desfecho. */
export async function GET() {
  try {
    const { escritorioId } = await exigirSessao();
    return NextResponse.json({ notificacoes: await notificacoesDaAgenda(escritorioId) });
  } catch (erro) {
    return tratarErro(erro);
  }
}
