import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { PRIORIDADES, SITUACOES } from "@/lib/tarefas";
import {
  TarefaNaoEncontrada,
  apagarTarefa,
  editarTarefa,
  mudarSituacao,
} from "@/lib/tarefas-do-escritorio";

export const dynamic = "force-dynamic";

const mudanca = z.object({
  titulo: z.string().trim().min(3).optional(),
  descricao: z.string().trim().max(4000).optional().nullable(),
  vencimento: z.string().min(10).optional(),
  prioridade: z.enum(PRIORIDADES).optional(),
  responsavelId: z.string().trim().min(1).optional(),
  clienteId: z.string().trim().optional().nullable(),
  numeroProcesso: z.string().trim().max(40).optional().nullable(),
  meta: z.boolean().optional(),
  situacao: z.enum(SITUACOES).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId } = await exigirSessao(undefined, "TAREFAS");
    const { id } = await params;
    const dados = mudanca.parse(await req.json());

    // Mudar so a situacao e o caminho do botao "Concluir", e e o mais usado:
    // vale um atalho que nao passa pela edicao inteira.
    if (dados.situacao && Object.keys(dados).length === 1) {
      return NextResponse.json({
        tarefa: await mudarSituacao(escritorioId, id, dados.situacao),
      });
    }

    const { situacao, vencimento, ...resto } = dados;
    const tarefa = await editarTarefa(escritorioId, id, {
      ...resto,
      ...(vencimento ? { vencimento: new Date(vencimento) } : {}),
    });
    if (situacao) await mudarSituacao(escritorioId, id, situacao);
    return NextResponse.json({ tarefa });
  } catch (erro) {
    if (erro instanceof TarefaNaoEncontrada) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId } = await exigirSessao(undefined, "TAREFAS");
    const { id } = await params;
    await apagarTarefa(escritorioId, id);
    return NextResponse.json({ ok: true });
  } catch (erro) {
    if (erro instanceof TarefaNaoEncontrada) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
