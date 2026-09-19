import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { registrarTentativa } from "@/lib/limite";
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

/**
 * Teto de chamadas por escritorio e por pessoa, na hora.
 *
 * Cada chamada gasta dinheiro de verdade na chave da PLATAFORMA — o
 * escritorio paga depois, como excedente, mas quem adianta e a plataforma.
 * Sem teto, um laco na tela (ou uma conta invadida) vira conta alta antes de
 * alguem perceber. Os numeros sao folgados para uso humano: quem le
 * publicacao nao pede sessenta analises em uma hora.
 */
const POR_ESCRITORIO = 120;
const POR_PESSOA = 60;
const JANELA = 60 * 60;

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

    for (const [chave, teto] of [
      [`ia:${escritorioId}`, POR_ESCRITORIO],
      [`ia:${escritorioId}:${usuarioId}`, POR_PESSOA],
    ] as const) {
      const limite = await registrarTentativa(chave, teto, JANELA);
      if (!limite.permitido) {
        return NextResponse.json(
          { erro: "Muitos pedidos de IA em pouco tempo. Tente de novo mais tarde." },
          { status: 429, headers: { "Retry-After": String(limite.esperarSegundos) } }
        );
      }
    }

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
