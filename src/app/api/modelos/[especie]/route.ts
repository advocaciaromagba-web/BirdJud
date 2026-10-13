import { NextResponse } from "next/server";
import { exigirAdmin, exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { z } from "zod";
import {
  arquivoDoModelo,
  ehEspecie,
  fixarModelo,
  voltarAoPadrao,
  type QualModelo,
} from "@/lib/modelos-do-escritorio";
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
  req: Request,
  { params }: { params: Promise<{ especie: string }> },
) {
  try {
    const { escritorioId } = await exigirSessao();
    const { especie } = await params;
    if (!ehEspecie(especie)) {
      return NextResponse.json({ erro: "Especie invalida." }, { status: 400 });
    }

    // ?qual=sistema ou ?qual=escritorio baixa um dos dois de proposito; sem
    // nada, o que sai na peca hoje.
    const pedido = new URL(req.url).searchParams.get("qual")?.toUpperCase();
    const qual: QualModelo = pedido === "SISTEMA" || pedido === "ESCRITORIO" ? pedido : "VIGENTE";
    const { conteudo, nomeDoArquivo } = await arquivoDoModelo(escritorioId, especie, qual);
    const nome = nomeDoArquivo.replace(/[^\w.\- ]/g, "_");
    return new NextResponse(new Uint8Array(conteudo), {
      headers: {
        "content-type": TIPO_DOCX,
        "content-disposition": `attachment; filename="${nome}"`,
        "cache-control": "no-store",
      },
    });
  } catch (erro) {
    return respostaDoDominio(erro) ?? tratarErro(erro);
  }
}

const escolha = z.object({ usar: z.enum(["ESCRITORIO", "SISTEMA"]) });

/** Fixa qual modelo sai na peca, sem apagar nada. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ especie: string }> },
) {
  try {
    const { escritorioId } = await exigirAdmin();
    const { especie } = await params;
    if (!ehEspecie(especie)) {
      return NextResponse.json({ erro: "Especie invalida." }, { status: 400 });
    }
    const corpo = escolha.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return NextResponse.json({ erro: "Pedido invalido." }, { status: 400 });
    await fixarModelo(escritorioId, especie, corpo.data.usar);
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return respostaDoDominio(erro) ?? tratarErro(erro);
  }
}

/** Exclui o arquivo que o escritorio mandou; passa a valer o do sistema. */
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
