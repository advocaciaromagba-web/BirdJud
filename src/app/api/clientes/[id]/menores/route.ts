import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { ehDuplicado, tratarErro } from "@/lib/respostas";
import { cutucarNuvem } from "@/lib/avisar-nuvem";
import { MenorRecusado, cadastrarMenor } from "@/lib/menores-do-escritorio";

export const dynamic = "force-dynamic";

const pedido = z.object({
  nome: z.string().max(200),
  nascimento: z.string().max(10),
  parentesco: z.string().max(20),
  documento: z.string().max(20).nullish(),
  rg: z.string().max(30).nullish(),
  nacionalidade: z.string().max(60).nullish(),
});

/** Cadastra um menor a partir do cliente que o representa (menores-do-escritorio.ts). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId } = await exigirSessao();
    const corpo = pedido.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
    const { id } = await params;
    const menor = await cadastrarMenor(escritorioId, id, corpo.data);
    await cutucarNuvem(escritorioId);
    return NextResponse.json({ menor: { id: menor.id, nome: menor.nome } }, { status: 201 });
  } catch (erro) {
    if (erro instanceof MenorRecusado) return NextResponse.json({ erro: erro.message }, { status: erro.status });
    if (ehDuplicado(erro)) return NextResponse.json({ erro: "Já existe cliente com este CPF." }, { status: 409 });
    return tratarErro(erro);
  }
}
