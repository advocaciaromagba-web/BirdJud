import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio, prismaPlataforma, semEscritorio } from "@/lib/prisma";
import {
  exigirOperador,
  registrarAcessoSuporte,
  SemOperador,
} from "@/lib/plataforma";
import { aplicarRegua } from "@/lib/cobranca";
import { FAIXAS } from "@/lib/faixas";
import { MODULOS } from "@/lib/modulos";

const acao = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("faixa"), faixa: z.enum(FAIXAS) }),
  z.object({
    acao: z.literal("modulo"),
    modulo: z.enum(MODULOS),
    ativo: z.boolean(),
  }),
  z.object({ acao: z.literal("regua") }),
]);

function tratar(erro: unknown) {
  if (erro instanceof SemOperador) {
    return NextResponse.json({ erro: erro.message }, { status: erro.status });
  }
  console.error(erro);
  return NextResponse.json({ erro: "Erro interno." }, { status: 500 });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const operador = await exigirOperador();
    const corpo = acao.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Acao invalida." }, { status: 400 });
    }

    const escritorio = await prismaPlataforma().escritorio.findUnique({
      where: { id: (await params).id },
      select: { id: true, nome: true },
    });
    if (!escritorio) {
      return NextResponse.json(
        { erro: "Escritorio nao encontrado." },
        { status: 404 },
      );
    }

    // Toda acao do operador sobre um escritorio fica registrada.
    await registrarAcessoSuporte(
      operador.operadorId,
      escritorio.id,
      `Acao no painel: ${corpo.data.acao}`,
    );

    if (corpo.data.acao === "faixa") {
      await prismaPlataforma().escritorio.update({
        where: { id: escritorio.id },
        data: { faixa: corpo.data.faixa },
      });
      return NextResponse.json({
        detalhe: `Faixa alterada para ${corpo.data.faixa}.`,
      });
    }

    if (corpo.data.acao === "modulo") {
      const { modulo, ativo } = corpo.data;
      await comEscritorio(escritorio.id, (db) =>
        db.moduloContratado.upsert({
          where: {
            escritorioId_modulo: { escritorioId: escritorio.id, modulo },
          },
          create: semEscritorio({ modulo, ativo }),
          update: { ativo },
        }),
      );
      return NextResponse.json({
        detalhe: `${modulo} ${ativo ? "contratado" : "desligado"}.`,
      });
    }

    const resultado = await aplicarRegua(escritorio.id);
    return NextResponse.json({
      detalhe:
        `Regua aplicada: ${resultado.statusAnterior} -> ${resultado.statusNovo}` +
        (resultado.faturaGerada ? ", fatura gerada." : "."),
    });
  } catch (erro) {
    return tratar(erro);
  }
}
