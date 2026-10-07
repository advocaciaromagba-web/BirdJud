import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { respostaDoDominio } from "@/lib/modelos-respostas";
import { conferirEnvio } from "@/lib/assinatura-do-escritorio";

export const dynamic = "force-dynamic";

/** Pergunta ao provedor em que pe esta o documento, e grava a resposta. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId } = await exigirSessao("ASSINATURA");
    const { id } = await params;
    return NextResponse.json({ envio: await conferirEnvio(escritorioId, id) });
  } catch (erro) {
    return respostaDoDominio(erro) ?? tratarErro(erro);
  }
}
