import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { EntradaNaoEncontrada, decidirEntrada } from "@/lib/extrato";

export const dynamic = "force-dynamic";

const acao = z.union([
  z.object({ acao: z.literal("lancar"), categoria: z.string().max(40).optional() }),
  z.object({ acao: z.literal("ignorar") }),
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId } = await exigirSessao("COBRANCAS");
    const { id } = await params;
    const corpo = acao.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      return NextResponse.json({ erro: "Acao invalida." }, { status: 400 });
    }

    const r = await decidirEntrada(
      escritorioId,
      id,
      corpo.data.acao === "lancar"
        ? { tipo: "LANCAR", categoria: corpo.data.categoria }
        : { tipo: "IGNORAR" },
    );
    return NextResponse.json(r);
  } catch (erro) {
    if (erro instanceof EntradaNaoEncontrada) {
      return NextResponse.json({ erro: erro.message }, { status: 404 });
    }
    return tratarErro(erro);
  }
}
