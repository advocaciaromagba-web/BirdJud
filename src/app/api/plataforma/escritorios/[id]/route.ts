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
import { contaMontada, modulosDoPlano, PLANO, PLANOS } from "@/lib/planos";
import {
  ajustarFranquias,
  definirModulo,
  definirModulos,
} from "@/lib/contratacao";
import { ehFaixa, type Faixa } from "@/lib/faixas";
import type { Modulo } from "@/lib/catalogo";

const acao = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("faixa"), faixa: z.enum(FAIXAS) }),
  z.object({
    acao: z.literal("modulo"),
    modulo: z.enum(MODULOS),
    ativo: z.boolean(),
  }),
  z.object({ acao: z.literal("plano"), plano: z.enum(PLANOS) }),
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
      select: { id: true, nome: true, faixa: true },
    });
    if (!escritorio) {
      return NextResponse.json(
        { erro: "Escritorio nao encontrado." },
        { status: 404 },
      );
    }

    // A faixa gravada manda no preco e na franquia. Valor estranho no banco
    // nao pode derrubar a acao: cai para a menor, como em faixas.ts.
    const faixaAtual: Faixa = ehFaixa(escritorio.faixa)
      ? escritorio.faixa
      : "ATE_3";

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
      // A franquia de cada modulo e da faixa: mudar de faixa sem reescrever
      // deixaria o escritorio que cresceu pagando excedente do tamanho antigo.
      await ajustarFranquias(escritorio.id, corpo.data.faixa);
      return NextResponse.json({
        detalhe: `Faixa alterada para ${corpo.data.faixa}.`,
      });
    }

    if (corpo.data.acao === "modulo") {
      const { modulo, ativo } = corpo.data;
      await definirModulo(escritorio.id, modulo, ativo, faixaAtual);
      return NextResponse.json({
        detalhe: `${modulo} ${ativo ? "contratado" : "desligado"}.`,
      });
    }

    if (corpo.data.acao === "plano") {
      const doPlano = modulosDoPlano(corpo.data.plano);
      const conta = contaMontada(doPlano, faixaAtual);
      const contratados = new Set<Modulo>(
        conta.modulos.map((linha) => linha.modulo),
      );

      // Aplicar plano e dizer o conjunto inteiro, nao acrescentar: o que nao
      // esta no plano sai. Senao "mudar para o Essencial" deixaria ligado o
      // que veio de antes, e o escritorio continuaria usando o que nao paga.
      await comEscritorio(escritorio.id, async (db) => {
        for (const modulo of MODULOS) {
          if (modulo === "NUCLEO") continue;
          const ativo = contratados.has(modulo);
          await db.moduloContratado.upsert({
            where: {
              escritorioId_modulo: { escritorioId: escritorio.id, modulo },
            },
            create: semEscritorio({ modulo, ativo }),
            update: { ativo },
          });
        }
      });

      return NextResponse.json({
        detalhe:
          `Plano ${PLANO[corpo.data.plano].rotulo} aplicado. ` +
          `Mensalidade pela tabela de hoje: ${(conta.totalCentavos / 100).toFixed(2)}. ` +
          "O valor da assinatura nao foi alterado.",
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
