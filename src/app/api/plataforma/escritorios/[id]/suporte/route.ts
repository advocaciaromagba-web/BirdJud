import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirOperador, SemOperador } from "@/lib/plataforma";
import { AcessoDeSuporteRecusado, abrirAcessoDeSuporte, encerrarAcessoDeSuporte } from "@/lib/acesso-de-suporte";
import { prismaPlataforma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const pedido = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("abrir"), motivo: z.string().max(300) }),
  z.object({ acao: z.literal("encerrar"), acessoId: z.string().min(1) }),
]);

/**
 * Entrar no escritorio como suporte. Registra o acesso (operador, motivo,
 * momento) e devolve o link de uso unico; ou encerra um acesso aberto.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const operador = await exigirOperador();
    const { id } = await params;
    const corpo = pedido.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });

    if (corpo.data.acao === "encerrar") {
      const acesso = await prismaPlataforma().acessoSuporte.findFirst({ where: { id: corpo.data.acessoId, escritorioId: id } });
      if (!acesso) return NextResponse.json({ erro: "Acesso não encontrado." }, { status: 404 });
      await encerrarAcessoDeSuporte(acesso.id);
      return NextResponse.json({ detalhe: "Acesso de suporte encerrado: a sessão cai na próxima tela." });
    }

    const r = await abrirAcessoDeSuporte(operador.operadorId, id, corpo.data.motivo);
    return NextResponse.json({
      url: r.url,
      detalhe: `Acesso registrado. O link vale 2 minutos e uma vez; a sessão, 1 hora, como ${r.comoQuem}.`,
    });
  } catch (erro) {
    if (erro instanceof SemOperador || erro instanceof AcessoDeSuporteRecusado) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    console.error(erro);
    return NextResponse.json({ erro: "Erro interno." }, { status: 500 });
  }
}
