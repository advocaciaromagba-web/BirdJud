import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import {
  EntrevistaNaoEncontrada,
  ligarAoCliente,
} from "@/lib/entrevista-do-escritorio";

export const dynamic = "force-dynamic";

const corpo = z.object({ clienteId: z.string().trim().min(1) });

/** Liga a entrevista a um cliente ja cadastrado: o caso foi aceito. */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId } = await exigirSessao(undefined, "ENTREVISTAS");
    const { id } = await params;
    const { clienteId } = corpo.parse(await req.json());
    return NextResponse.json({
      entrevista: await ligarAoCliente(escritorioId, id, clienteId),
    });
  } catch (erro) {
    if (erro instanceof EntrevistaNaoEncontrada) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
