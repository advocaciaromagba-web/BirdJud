import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import {
  NotaInvalida,
  abrirCertificadoDoEscritorio,
  cancelarNota,
  depoisDeEmitida,
  descartarNota,
  verificarSituacao,
} from "@/lib/nfse";

export const dynamic = "force-dynamic";

const acao = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("VERIFICAR"), senha: z.string().min(1).max(200) }),
  z.object({
    acao: z.literal("CANCELAR"),
    senha: z.string().min(1).max(200),
    motivo: z.union([z.literal(1), z.literal(2), z.literal(9)]),
    descricao: z.string().min(15, "Explique o motivo com pelo menos 15 caracteres.").max(255),
  }),
]);

function dominio(erro: unknown) {
  return erro instanceof NotaInvalida ? NextResponse.json({ erro: erro.message }, { status: erro.status }) : null;
}

/** Verificar situacao (conexao caiu) ou cancelar — os dois pedem o certificado. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId, usuarioId, papel } = await exigirSessao("NFSE", "NOTAS");
    const { id } = await params;
    const corpo = acao.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      return NextResponse.json({ erro: corpo.error.issues[0]?.message ?? "Pedido inválido." }, { status: 400 });
    }
    const cert = await abrirCertificadoDoEscritorio(escritorioId, { usuarioId, papel }, corpo.data.senha);
    if (corpo.data.acao === "VERIFICAR") {
      const nota = await verificarSituacao(escritorioId, id, cert);
      if (nota.status === "EMITIDA") await depoisDeEmitida(escritorioId, nota.id).catch(() => null);
      return NextResponse.json({ status: nota.status });
    }
    const nota = await cancelarNota(escritorioId, id, cert, corpo.data.motivo, corpo.data.descricao);
    return NextResponse.json({ status: nota.status });
  } catch (erro) {
    return dominio(erro) ?? tratarErro(erro);
  }
}

/** Descartar nota que nao foi emitida. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId } = await exigirSessao("NFSE", "NOTAS");
    const { id } = await params;
    await descartarNota(escritorioId, id);
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return dominio(erro) ?? tratarErro(erro);
  }
}
