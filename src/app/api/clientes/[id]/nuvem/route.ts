import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { pastaDoCliente } from "@/lib/nuvem-do-escritorio";
import { FalhaNaNuvem } from "@/lib/nuvem";

export const dynamic = "force-dynamic";

/**
 * Abre a pasta do cliente no OneDrive ou no Google Drive. Se ainda nao
 * existe, cria na hora — quem clicou quer a pasta agora, nao na proxima
 * rodada da fila.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId } = await exigirSessao("NUVEM");
    const { id } = await params;
    const pasta = await pastaDoCliente(escritorioId, id);
    if (!pasta) {
      return NextResponse.json(
        { erro: "Nenhuma nuvem conectada. O administrador conecta em Integracoes." },
        { status: 404 },
      );
    }
    if (!pasta.endereco) {
      return NextResponse.json({ erro: "A nuvem nao devolveu o endereco da pasta." }, { status: 502 });
    }
    return NextResponse.redirect(pasta.endereco);
  } catch (erro) {
    if (erro instanceof FalhaNaNuvem) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status === 404 ? 404 : 502 });
    }
    return tratarErro(erro);
  }
}
