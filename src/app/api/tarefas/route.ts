import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { PRIORIDADES } from "@/lib/tarefas";
import { criarTarefa } from "@/lib/tarefas-do-escritorio";
import { recusaDeTarefa } from "@/lib/natureza";
import { avisarTarefaDesignada } from "@/lib/avisos";
import { enfileirar } from "@/lib/fila";
import { fimDoDia } from "@/lib/tarefas";

export const dynamic = "force-dynamic";

const corpo = z.object({
  titulo: z.string().trim().min(3, "Diga o que precisa ser feito."),
  descricao: z.string().trim().max(4000).optional().nullable(),
  // datetime-local nao manda fuso; o servidor interpreta no fuso dele, que e
  // o mesmo do escritorio.
  vencimento: z.string().min(10, "Escolha a data de entrega."),
  // Prazo fatal do processo (aaaa-mm-dd), quando houver.
  prazoFatal: z.string().max(10).optional().nullable(),
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
      return NextResponse.json({ erro: "Prazo inválido." }, { status: 400 });
    }
    // Audiencia, pericia e atendimento sao da Agenda (natureza.ts). Meta da
    // equipe ("fazer 20 atendimentos") nao passa por esta trava.
    const recusa = dados.meta ? null : recusaDeTarefa(dados.titulo);
    if (recusa) return NextResponse.json({ erro: recusa }, { status: 400 });
    const prazoFatal = fimDoDia(dados.prazoFatal);
    if (prazoFatal === undefined) return NextResponse.json({ erro: "Prazo fatal inválido." }, { status: 400 });

    const tarefa = await criarTarefa(
      escritorioId,
      { ...dados, vencimento: quando, prazoFatal },
      usuarioId,
    );
    if ((await avisarTarefaDesignada(escritorioId, tarefa.id, usuarioId)) > 0) {
      await enfileirar("LEMBRAR", escritorioId);
    }
    return NextResponse.json({ tarefa });
  } catch (erro) {
    return tratarErro(erro);
  }
}
