import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirOperador, registrarAcessoSuporte, SemOperador } from "@/lib/plataforma";
import { prismaPlataforma } from "@/lib/prisma";
import {
  NotaInvalida,
  cancelarNotaDaPlataforma,
  emitirNotaDaFatura,
  mandarNotaPorEmail,
  verificarNotaDaPlataforma,
} from "@/lib/nota-da-plataforma";

export const dynamic = "force-dynamic";

const acao = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("emitir"), faturaId: z.string().min(1) }),
  z.object({ acao: z.literal("verificar"), id: z.string().min(1) }),
  z.object({ acao: z.literal("reenviar"), id: z.string().min(1) }),
  z.object({
    acao: z.literal("cancelar"),
    id: z.string().min(1),
    motivo: z.union([z.literal(1), z.literal(2), z.literal(9)]),
    justificativa: z.string().trim().min(15).max(255),
  }),
]);

const descrever = (n: { status: string; numeroNaPrefeitura: string | null; erro: string | null }) =>
  n.status === "EMITIDA"
    ? `Nota ${n.numeroNaPrefeitura ?? ""} emitida e enviada ao escritório.`
    : n.status === "REJEITADA"
      ? `A Sefin recusou: ${n.erro ?? "sem detalhe"}`
      : n.status === "CANCELADA"
        ? "Nota cancelada. O escritório foi avisado."
        : "A Sefin não respondeu. Use \"Verificar\" em alguns minutos.";

/** Nota da mensalidade pelo console: emitir, conferir, reenviar e cancelar. */
export async function POST(req: Request) {
  try {
    const operador = await exigirOperador();
    const corpo = acao.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: corpo.error.issues[0]?.message ?? "Ação inválida." }, { status: 400 });
    }
    const d = corpo.data;
    let escritorioId: string | null = null;

    if (d.acao === "emitir") {
      const nota = await emitirNotaDaFatura(d.faturaId, "MANUAL");
      escritorioId = nota.escritorioId;
      await registrarAcessoSuporte(operador.operadorId, escritorioId, `Nota da mensalidade emitida (fatura ${d.faturaId})`);
      return NextResponse.json({ ok: nota.status !== "REJEITADA", detalhe: descrever(nota) }, { status: nota.status === "REJEITADA" ? 422 : 200 });
    }

    const atual = await prismaPlataforma().notaDaPlataforma.findUnique({ where: { id: d.id }, select: { escritorioId: true } });
    if (!atual) return NextResponse.json({ erro: "Nota não encontrada." }, { status: 404 });
    escritorioId = atual.escritorioId;

    if (d.acao === "verificar") {
      const nota = await verificarNotaDaPlataforma(d.id);
      return NextResponse.json({ detalhe: descrever(nota) });
    }
    if (d.acao === "reenviar") {
      const ok = await mandarNotaPorEmail(d.id);
      await registrarAcessoSuporte(operador.operadorId, escritorioId, "Nota da mensalidade reenviada por e-mail");
      return NextResponse.json(
        ok ? { detalhe: "Nota reenviada ao e-mail do escritório." } : { erro: "Não foi possível reenviar: sem e-mail do escritório ou remetente da plataforma." },
        { status: ok ? 200 : 409 },
      );
    }
    const nota = await cancelarNotaDaPlataforma(d.id, d.motivo, d.justificativa);
    await registrarAcessoSuporte(operador.operadorId, escritorioId, `Nota da mensalidade cancelada: ${d.justificativa}`);
    return NextResponse.json({ detalhe: descrever(nota) });
  } catch (erro) {
    if (erro instanceof SemOperador || erro instanceof NotaInvalida) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    console.error(erro);
    return NextResponse.json({ erro: "Erro interno." }, { status: 500 });
  }
}
