import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { excluidosDoEscritorio } from "@/lib/agenda-do-escritorio";

export const dynamic = "force-dynamic";

/** Auditoria: o que saiu da agenda, por quem e por que. So leitura. */
export async function GET() {
  try {
    const { escritorioId } = await exigirSessao();
    return NextResponse.json({ excluidos: await excluidosDoEscritorio(escritorioId) });
  } catch (erro) {
    return tratarErro(erro);
  }
}
