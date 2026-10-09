import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { TIPOS_DE_COMPROMISSO } from "@/lib/compromissos";
import {
  CompromissoNaoEncontrado,
  editarCompromisso,
  excluirCompromisso,
} from "@/lib/agenda-do-escritorio";
import { avisarAgendamento, avisarDesignacao } from "@/lib/avisos";
import { enfileirar } from "@/lib/fila";

export const dynamic = "force-dynamic";

const edicao = z.object({
  titulo: z.string().min(2).max(200).optional(),
  tipo: z.enum(TIPOS_DE_COMPROMISSO).optional(),
  inicio: z.string().min(10).optional(),
  local: z.string().max(200).optional().or(z.literal("")),
  link: z.string().max(500).optional().or(z.literal("")),
  observacoes: z.string().max(2000).optional().or(z.literal("")),
  processoId: z.string().optional().or(z.literal("")),
  clienteId: z.string().optional().or(z.literal("")),
  responsavelId: z.string().optional().or(z.literal("")),
  concluido: z.boolean().optional(),
});

/** O compromisso inteiro, para a tela "Ver". */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId } = await exigirSessao();
    const { id } = await params;
    const compromisso = await comEscritorio(escritorioId, (db) =>
      db.compromisso.findFirst({
        where: { id },
        include: {
          processo: { select: { id: true, numero: true } },
          cliente: { select: { id: true, nome: true } },
          responsavel: { select: { id: true, nome: true } },
          participantes: {
            orderBy: { criadoEm: "asc" },
            include: { cliente: { select: { nome: true } } },
          },
          avisos: {
            orderBy: { criadoEm: "desc" },
            select: {
              id: true,
              canal: true,
              tipo: true,
              destino: true,
              estado: true,
              erro: true,
              enviadoEm: true,
              criadoEm: true,
              idNaMeta: true,
              entregueEm: true,
              lidoEm: true,
            },
          },
        },
      }),
    );
    if (!compromisso) {
      return NextResponse.json({ erro: "Compromisso nao encontrado." }, { status: 404 });
    }
    return NextResponse.json({ compromisso });
  } catch (erro) {
    return tratarErro(erro);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao();
    const { id } = await params;
    const corpo = edicao.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }

    const d = corpo.data;
    const campos: Parameters<typeof editarCompromisso>[2] = {};
    if (d.titulo !== undefined) campos.titulo = d.titulo;
    if (d.tipo !== undefined) campos.tipo = d.tipo;
    if (d.inicio !== undefined) {
      const inicio = new Date(d.inicio);
      if (Number.isNaN(inicio.getTime())) {
        return NextResponse.json({ erro: "Data invalida." }, { status: 400 });
      }
      campos.inicio = inicio;
    }
    // Campo mandado vazio e campo apagado — e diferente de campo nao mandado.
    if (d.local !== undefined) campos.local = d.local || null;
    if (d.link !== undefined) campos.link = d.link || null;
    if (d.observacoes !== undefined) campos.observacoes = d.observacoes || null;
    if (d.processoId !== undefined) campos.processoId = d.processoId || null;
    if (d.clienteId !== undefined) campos.clienteId = d.clienteId || null;
    if (d.responsavelId !== undefined) campos.responsavelId = d.responsavelId || null;
    if (d.concluido !== undefined) campos.concluido = d.concluido;

    const { mudouAData } = await editarCompromisso(escritorioId, id, campos);

    // Responsavel novo e avisado; data nova gera a confirmacao de novo para
    // quem vai — e os lembretes voltam pela regua, com a hora certa.
    try {
      let avisos = 0;
      if (d.responsavelId) avisos += await avisarDesignacao(escritorioId, id, usuarioId);
      if (avisos > 0) await enfileirar("LEMBRAR", escritorioId);
    } catch (falha) {
      console.log(
        `compromisso ${id}: aviso nao gerado ${falha instanceof Error ? falha.message : ""}`.slice(0, 300),
      );
    }

    return NextResponse.json({ ok: true, mudouAData });
  } catch (erro) {
    if (erro instanceof CompromissoNaoEncontrado) {
      return NextResponse.json({ erro: erro.message }, { status: 404 });
    }
    if (erro instanceof Error && /nao encontrad/.test(erro.message)) {
      return NextResponse.json({ erro: erro.message }, { status: 400 });
    }
    return tratarErro(erro);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId, usuarioId, nomeUsuario } = await exigirSessao();
    const { id } = await params;
    await excluirCompromisso(escritorioId, id, {
      usuarioId,
      nome: nomeUsuario ?? null,
    });
    return NextResponse.json({
      ok: true,
      mensagem:
        "Compromisso excluido e registrado na auditoria. Os avisos ja enviados nao sao desfeitos — se precisar, avise as pessoas.",
    });
  } catch (erro) {
    if (erro instanceof CompromissoNaoEncontrado) {
      return NextResponse.json({ erro: erro.message }, { status: 404 });
    }
    return tratarErro(erro);
  }
}
