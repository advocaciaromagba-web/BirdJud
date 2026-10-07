import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import {
  SemDataParaAgendar,
  TriagemNaoEncontrada,
  aceitarTriagem,
  recusarTriagem,
} from "@/lib/triagem-do-escritorio";

export const dynamic = "force-dynamic";

const pedido = z.object({
  acao: z.enum(["ACEITAR", "RECUSAR"]),
  /** Data e hora escolhida na tela. Vazio usa a sugerida. */
  quando: z.string().min(10).max(40).nullish(),
  titulo: z.string().max(200).nullish(),
  responsavelId: z.string().min(1).nullish(),
});

/**
 * Aceita ou recusa a sugestao.
 *
 * O compromisso nasce AQUI, no clique — nunca na triagem. Sistema que cria
 * prazo sozinho na agenda do escritorio e sistema em que ninguem confia na
 * agenda.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId } = await exigirSessao("PUBLICACOES_DJEN", "PUBLICACOES");
    const { id } = await params;
    const corpo = pedido.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      return NextResponse.json({ erro: "Pedido invalido." }, { status: 400 });
    }

    if (corpo.data.acao === "RECUSAR") {
      await recusarTriagem(escritorioId, id);
      return NextResponse.json({ ok: true });
    }

    const aceite = await aceitarTriagem(escritorioId, id, {
      quando: corpo.data.quando,
      titulo: corpo.data.titulo,
      responsavelId: corpo.data.responsavelId,
    });
    return NextResponse.json({ aceite }, { status: 201 });
  } catch (erro) {
    if (erro instanceof TriagemNaoEncontrada || erro instanceof SemDataParaAgendar) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
