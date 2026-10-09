import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { cutucarNuvem } from "@/lib/avisar-nuvem";

export const dynamic = "force-dynamic";

/** "Organizar agora": cria o que faltar e copia o que nao foi, pela fila. */
export async function POST() {
  try {
    const { escritorioId } = await exigirAdmin("NUVEM");
    await cutucarNuvem(escritorioId);
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return tratarErro(erro);
  }
}
