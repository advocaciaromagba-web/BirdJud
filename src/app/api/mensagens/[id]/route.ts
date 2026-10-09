import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { NaoDaParaReenviar, marcarResolvida, reenviar } from "@/lib/entrega-do-escritorio";

export const dynamic = "force-dynamic";

const pedido = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("reenviar") }),
  z.object({
    acao: z.literal("resolver"),
    tratamento: z.enum(["CONTATO_DIRETO", "DESCARTADO"]),
    observacao: z.string().max(500).optional(),
  }),
]);

/**
 * O que a equipe faz com a mensagem que nao chegou: reenviar (para o
 * contato ATUAL do cadastro) ou marcar como resolvida — avisou por outro
 * meio, ou nao precisa mais. Fica registrado quem fez e quando.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId, nomeUsuario } = await exigirSessao(undefined, "AGENDA");
    const { id } = await params;
    const corpo = pedido.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });

    if (corpo.data.acao === "reenviar") {
      const r = await reenviar(escritorioId, id, { automatico: false, quem: nomeUsuario });
      return NextResponse.json({
        ok: true,
        mensagem: r.mudouDestino
          ? `Reenviada para o contato atual do cadastro (${r.destino}). Sai em instantes.`
          : "Reenviada. Sai em instantes.",
      });
    }

    await marcarResolvida(escritorioId, id, corpo.data.tratamento, nomeUsuario, corpo.data.observacao ?? null);
    return NextResponse.json({ ok: true, mensagem: "Marcada como resolvida." });
  } catch (erro) {
    if (erro instanceof NaoDaParaReenviar) return NextResponse.json({ erro: erro.message }, { status: erro.status });
    return tratarErro(erro);
  }
}
