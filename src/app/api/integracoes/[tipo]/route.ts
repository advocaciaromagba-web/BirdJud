import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/sessao";
import { apagarIntegracao } from "@/lib/integracao";
import { ehTipoDeIntegracao } from "@/lib/conectores";
import { tratarErro } from "@/lib/respostas";

/** Desconectar apaga a credencial guardada deste escritorio. */
export async function DELETE(_req: Request, { params }: { params: { tipo: string } }) {
  try {
    const { escritorioId } = await exigirAdmin();
    if (!ehTipoDeIntegracao(params.tipo)) {
      return NextResponse.json({ erro: "Integracao desconhecida." }, { status: 400 });
    }
    await apagarIntegracao(escritorioId, params.tipo);
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return tratarErro(erro);
  }
}
