import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import {
  apagarArquivo,
  abrirArquivo,
  ArquivoNaoEncontrado,
} from "@/lib/arquivos";

type Parametros = { params: Promise<{ id: string }> };

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
    // Lido aos poucos do disco: audio grande nao passa inteiro pela memoria.
    const arquivo = await abrirArquivo(escritorioId, (await params).id);

    return new NextResponse(arquivo.corpo, {
      headers: {
        "Content-Type": arquivo.tipo,
        "Content-Length": String(arquivo.tamanho),
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
    await apagarArquivo(escritorioId, (await params).id);
    return NextResponse.json({ ok: true });
  } catch (erro) {
    if (erro instanceof ArquivoNaoEncontrado) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
