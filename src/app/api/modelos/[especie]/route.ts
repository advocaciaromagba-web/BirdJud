import { NextResponse } from "next/server";
import { exigirAdmin, exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import {
  arquivoDoModelo,
  ehEspecie,
  voltarAoPadrao,
} from "@/lib/modelos-do-escritorio";
import { nomeDoArquivoPadrao } from "@/lib/modelos-padrao";
import { respostaDoDominio } from "@/lib/modelos-respostas";

export const dynamic = "force-dynamic";

const TIPO_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Baixa o modelo que vale hoje — o do escritorio, ou o que ja vem no sistema.
 *
 * E por aqui que o escritorio pega o modelo pronto, abre no Word, poe o
 * timbre e a redacao dele, e devolve. "Usar o que ja tem" e "mandar o meu"
 * viram o mesmo caminho, com um passo no meio.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ especie: string }> },
) {
  try {
    const { escritorioId } = await exigirSessao();
    const { especie } = await params;
    if (!ehEspecie(especie)) {
      return NextResponse.json({ erro: "Especie invalida." }, { status: 400 });
    }

    const { conteudo } = await arquivoDoModelo(escritorioId, especie);
    return new NextResponse(new Uint8Array(conteudo), {
      headers: {
        "content-type": TIPO_DOCX,
        "content-disposition": `attachment; filename="${nomeDoArquivoPadrao(especie)}"`,
        "cache-control": "no-store",
      },
    });
  } catch (erro) {
    return respostaDoDominio(erro) ?? tratarErro(erro);
  }
}

/** Volta a usar o modelo do sistema e apaga o arquivo que o escritorio mandou. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ especie: string }> },
) {
  try {
    const { escritorioId } = await exigirAdmin();
    const { especie } = await params;
    if (!ehEspecie(especie)) {
      return NextResponse.json({ erro: "Especie invalida." }, { status: 400 });
    }
    await voltarAoPadrao(escritorioId, especie);
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return respostaDoDominio(erro) ?? tratarErro(erro);
  }
}
