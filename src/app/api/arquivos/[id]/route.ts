import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { apagarArquivo, ArquivoNaoEncontrado, lerArquivo } from "@/lib/arquivos";

type Parametros = { params: { id: string } };

/**
 * Download.
 *
 * Sempre como anexo e sempre com o tipo guardado, nunca inline: um .html ou
 * .svg subido por alguem e aberto no nosso dominio rodaria script com a sessao
 * do escritorio. Anexo + nosniff tira essa porta do caminho.
 */
export async function GET(_req: Request, { params }: Parametros) {
  try {
    const { escritorioId } = await exigirSessao("NUVEM");
    const arquivo = await lerArquivo(escritorioId, params.id);

    return new NextResponse(new Uint8Array(arquivo.conteudo), {
      headers: {
        "Content-Type": arquivo.tipo,
        "Content-Disposition": `attachment; filename="${arquivo.nome}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (erro) {
    if (erro instanceof ArquivoNaoEncontrado) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}

export async function DELETE(_req: Request, { params }: Parametros) {
  try {
    const { escritorioId } = await exigirSessao("NUVEM");
    await apagarArquivo(escritorioId, params.id);
    return NextResponse.json({ ok: true });
  } catch (erro) {
    if (erro instanceof ArquivoNaoEncontrado) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
