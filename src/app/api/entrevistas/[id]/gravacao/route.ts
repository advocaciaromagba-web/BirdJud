import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { TAMANHO_MAXIMO_MB } from "@/lib/arquivos";
import { EntrevistaNaoEncontrada, guardarGravacaoNaPasta } from "@/lib/entrevista-do-escritorio";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * A gravacao INTEIRA feita na tela, num arquivo so, para a pasta do cliente.
 * A transcricao ja veio por trechos (/audio); isto e so o arquivo do audio.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao(undefined, "ENTREVISTAS");
    const { id } = await params;
    const formulario = await req.formData();
    const audio = formulario.get("audio");
    if (!(audio instanceof File)) return NextResponse.json({ erro: "Envie a gravacao." }, { status: 400 });
    if (audio.size > TAMANHO_MAXIMO_MB * 1024 * 1024) {
      return NextResponse.json(
        { guardado: false, motivo: `A gravacao passou de ${TAMANHO_MAXIMO_MB} MB e nao coube na pasta. A transcricao esta salva.` },
        { status: 200 },
      );
    }
    const r = await guardarGravacaoNaPasta(escritorioId, id, usuarioId, {
      tipo: audio.type,
      dados: Buffer.from(await audio.arrayBuffer()),
    });
    return NextResponse.json(r);
  } catch (erro) {
    if (erro instanceof EntrevistaNaoEncontrada) return NextResponse.json({ erro: erro.message }, { status: erro.status });
    return tratarErro(erro);
  }
}
