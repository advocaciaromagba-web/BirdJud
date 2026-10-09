import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/sessao";
import { apagarIntegracao } from "@/lib/integracao";
import { ehTipoDeIntegracao } from "@/lib/conectores";
import { tratarErro } from "@/lib/respostas";
import { desconectarNuvem } from "@/lib/nuvem-do-escritorio";

/** Desconectar apaga a credencial guardada deste escritorio. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ tipo: string }> },
) {
  try {
    const { escritorioId } = await exigirAdmin();
    const { tipo } = await params;
    if (!ehTipoDeIntegracao(tipo)) {
      return NextResponse.json(
        { erro: "Integracao desconhecida." },
        { status: 400 },
      );
    }
    if (tipo === "MICROSOFT" || tipo === "GOOGLE") {
      // A nuvem leva junto o mapa das pastas; os arquivos ficam na conta.
      await desconectarNuvem(escritorioId, tipo);
    } else {
      await apagarIntegracao(escritorioId, tipo);
    }
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return tratarErro(erro);
  }
}
