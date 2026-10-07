import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { SemPermissao, type Papel } from "@/lib/papeis";
import { definirPermissao } from "@/lib/areas-do-escritorio";

export const dynamic = "force-dynamic";

const pedido = z.object({
  area: z.string().min(1).max(40),
  permitido: z.boolean(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId, usuarioId, papel } = await exigirSessao();
    const { id } = await params;
    const corpo = pedido.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      return NextResponse.json({ erro: "Pedido invalido." }, { status: 400 });
    }

    await definirPermissao(
      escritorioId,
      { usuarioId, papel: papel as Papel },
      id,
      corpo.data.area,
      corpo.data.permitido,
    );
    return NextResponse.json({ ok: true });
  } catch (erro) {
    if (erro instanceof SemPermissao) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
