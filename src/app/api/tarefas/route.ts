import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { PRIORIDADES } from "@/lib/tarefas";
import { criarTarefa } from "@/lib/tarefas-do-escritorio";

export const dynamic = "force-dynamic";

const corpo = z.object({
  titulo: z.string().trim().min(3, "Diga o que precisa ser feito."),
  descricao: z.string().trim().max(4000).optional().nullable(),
  // datetime-local nao manda fuso; o servidor interpreta no fuso dele, que e
  // o mesmo do escritorio.
  vencimento: z.string().min(10, "Escolha o prazo."),
  prioridade: z.enum(PRIORIDADES).optional(),
  responsavelId: z.string().trim().min(1, "Escolha quem vai fazer."),
  clienteId: z.string().trim().optional().nullable(),
  numeroProcesso: z.string().trim().max(40).optional().nullable(),
  meta: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao(undefined, "TAREFAS");
    const dados = corpo.parse(await req.json());
    const quando = new Date(dados.vencimento);
    if (Number.isNaN(quando.getTime())) {
      return NextResponse.json({ erro: "Prazo invalido." }, { status: 400 });
    }
    const tarefa = await criarTarefa(
      escritorioId,
      { ...dados, vencimento: quando },
      usuarioId,
    );
    return NextResponse.json({ tarefa });
  } catch (erro) {
    return tratarErro(erro);
  }
}
