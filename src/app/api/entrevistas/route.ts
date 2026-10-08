import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { criarEntrevista } from "@/lib/entrevista-do-escritorio";

export const dynamic = "force-dynamic";

const corpo = z.object({
  nome: z.string().trim().min(2, "Diga o nome de quem foi atendido."),
  assunto: z.string().trim().min(10, "Escreva o assunto em uma frase."),
  telefone: z.string().trim().max(40).optional().nullable(),
  clienteId: z.string().trim().optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao(
      undefined,
      "ENTREVISTAS",
    );
    const dados = corpo.parse(await req.json());
    const entrevista = await criarEntrevista(escritorioId, {
      ...dados,
      usuarioId,
    });
    return NextResponse.json({ entrevista });
  } catch (erro) {
    return tratarErro(erro);
  }
}
