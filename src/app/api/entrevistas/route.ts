import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { EntrevistaNaoEncontrada, ProcessoNaoCadastrado, criarEntrevista } from "@/lib/entrevista-do-escritorio";
import { TIPOS_DE_ENTREVISTA } from "@/lib/entrevista";

export const dynamic = "force-dynamic";

const corpo = z.object({
  nome: z.string().trim().min(2, "Diga o nome de quem foi atendido."),
  assunto: z.string().trim().min(10, "Escreva o assunto em uma frase."),
  telefone: z.string().trim().max(40).optional().nullable(),
  clienteId: z.string().trim().optional().nullable(),
  tipo: z.enum(TIPOS_DE_ENTREVISTA).optional(),
  numeroProcesso: z.string().trim().max(40).optional().nullable(),
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
    if (erro instanceof EntrevistaNaoEncontrada) {
      return NextResponse.json({ erro: "Cliente não encontrado neste escritório." }, { status: 404 });
    }
    if (erro instanceof ProcessoNaoCadastrado) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
