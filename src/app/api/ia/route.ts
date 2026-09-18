import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import {
  EntradaLongaDemais,
  IARecusou,
  pedirEGravar,
  SemChaveDeIA,
} from "@/lib/ia";
import {
  entradaDaAnalise,
  entradaDaMinuta,
  SISTEMA_ANALISE,
  SISTEMA_MINUTA,
} from "@/lib/prompts-ia";

export const dynamic = "force-dynamic";

const pedido = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("ANALISE_PUBLICACAO"), publicacaoId: z.string().min(1) }),
  z.object({
    tipo: z.literal("MINUTA_MANIFESTACAO"),
    publicacaoId: z.string().min(1),
    instrucao: z.string().min(10).max(2000),
  }),
]);

export async function POST(req: Request) {
  try {
    // Duas camadas: o modulo IA precisa estar contratado, e a publicacao
    // precisa ser deste escritorio — o que a extensao do Prisma garante.
    const { escritorioId, usuarioId } = await exigirSessao("IA");

    const corpo = pedido.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Pedido invalido." }, { status: 400 });
    }

    const publicacao = await comEscritorio(escritorioId, (db) =>
      db.publicacao.findFirst({
        where: { id: corpo.data.publicacaoId },
        include: { processo: { include: { cliente: { select: { nome: true } } } } },
      })
    );
    if (!publicacao) {
      return NextResponse.json({ erro: "Publicacao nao encontrada." }, { status: 404 });
    }

    const base = {
      texto: publicacao.texto,
      numeroProcesso: publicacao.numeroProcesso,
      tribunal: publicacao.tribunal,
      orgao: publicacao.orgao,
    };

    const analise = await pedirEGravar({
      escritorioId,
      usuarioId,
      tipo: corpo.data.tipo,
      publicacaoId: publicacao.id,
      ...(corpo.data.tipo === "ANALISE_PUBLICACAO"
        ? { sistema: SISTEMA_ANALISE, entrada: entradaDaAnalise(base), esforco: "low" as const }
        : {
            sistema: SISTEMA_MINUTA,
            entrada: entradaDaMinuta({
              ...base,
              instrucao: corpo.data.instrucao,
              cliente: publicacao.processo?.cliente?.nome ?? null,
            }),
            // Redigir peca merece mais esforco do que triar uma publicacao.
            esforco: "high" as const,
          }),
    });

    return NextResponse.json({ analise });
  } catch (erro) {
    if (erro instanceof SemChaveDeIA || erro instanceof EntradaLongaDemais || erro instanceof IARecusou) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
