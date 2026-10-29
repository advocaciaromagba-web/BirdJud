import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { PRIORIDADES, SITUACOES } from "@/lib/tarefas";
import {
  TarefaNaoEncontrada,
  apagarTarefa,
  editarTarefa,
  SOLUCAO_MAXIMA,
  mudarSituacao,
  registrarSolucao,
} from "@/lib/tarefas-do-escritorio";
import { recusaDeTarefa } from "@/lib/natureza";
import { avisarTarefaDesignada } from "@/lib/avisos";
import { enfileirar } from "@/lib/fila";
import { fimDoDia } from "@/lib/tarefas";

export const dynamic = "force-dynamic";

const mudanca = z.object({
  titulo: z.string().trim().min(3).optional(),
  descricao: z.string().trim().max(4000).optional().nullable(),
  vencimento: z.string().min(10).optional(),
  prazoFatal: z.string().max(10).optional().nullable(),
  prioridade: z.enum(PRIORIDADES).optional(),
  responsavelId: z.string().trim().min(1).optional(),
  clienteId: z.string().trim().optional().nullable(),
  numeroProcesso: z.string().trim().max(40).optional().nullable(),
  meta: z.boolean().optional(),
  situacao: z.enum(SITUACOES).optional(),
  /** O que foi feito para resolver. Vazio ou null apaga o registro. */
  solucao: z.string().max(SOLUCAO_MAXIMA).optional().nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao(undefined, "TAREFAS");
    const { id } = await params;
    const dados = mudanca.parse(await req.json());

    // Concluir (com ou sem a solucao) e registrar a solucao depois sao os
    // caminhos mais usados: valem um atalho que nao passa pela edicao inteira.
    const chaves = Object.keys(dados);
    if (chaves.every((k) => k === "situacao" || k === "solucao")) {
      let tarefa = dados.situacao ? await mudarSituacao(escritorioId, id, dados.situacao) : null;
      if (dados.solucao !== undefined) tarefa = await registrarSolucao(escritorioId, id, dados.solucao, usuarioId);
      return NextResponse.json({ tarefa });
    }

    if (dados.titulo !== undefined && !dados.meta) {
      const recusa = recusaDeTarefa(dados.titulo);
      if (recusa) return NextResponse.json({ erro: recusa }, { status: 400 });
    }
    const { situacao, solucao, vencimento, prazoFatal: fatalTexto, ...resto } = dados;
    const prazoFatal = fatalTexto === undefined ? undefined : fimDoDia(fatalTexto);
    if (fatalTexto !== undefined && prazoFatal === undefined) {
      return NextResponse.json({ erro: "Prazo fatal inválido." }, { status: 400 });
    }
    const tarefa = await editarTarefa(escritorioId, id, {
      ...resto,
      ...(vencimento ? { vencimento: new Date(vencimento) } : {}),
      ...(prazoFatal !== undefined ? { prazoFatal } : {}),
    });
    // Passou para outra pessoa: a nova e avisada (a chave leva o responsavel).
    if (dados.responsavelId && (await avisarTarefaDesignada(escritorioId, id, usuarioId)) > 0) {
      await enfileirar("LEMBRAR", escritorioId);
    }
    if (situacao) await mudarSituacao(escritorioId, id, situacao);
    if (solucao !== undefined) await registrarSolucao(escritorioId, id, solucao, usuarioId);
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
