import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio, semEscritorio } from "@/lib/prisma";
import { exigirAdministracao } from "@/lib/sessao";
import { paraCentavos } from "@/lib/dinheiro";
import {
  CATEGORIAS_DE_DESPESA,
  competenciaDaData,
  vencimentoNaCompetencia,
} from "@/lib/financeiro";
import { tratarErro } from "@/lib/respostas";

const nova = z.object({
  descricao: z.string().min(2).max(200),
  categoria: z.enum(CATEGORIAS_DE_DESPESA),
  fornecedor: z.string().max(120).optional(),
  valor: z.string().min(1),
  diaDoVencimento: z.union([z.string(), z.number()]),
});

export async function GET() {
  try {
    const { escritorioId } = await exigirAdministracao("FINANCEIRO");
    const despesas = await comEscritorio(escritorioId, (db) =>
      db.despesaFixa.findMany({ orderBy: { diaDoVencimento: "asc" } }),
    );
    return NextResponse.json({ despesas });
  } catch (erro) {
    return tratarErro(erro);
  }
}

export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirAdministracao("FINANCEIRO");
    const corpo = nova.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }

    const valorCentavos = paraCentavos(corpo.data.valor);
    if (valorCentavos === null || valorCentavos === 0) {
      return NextResponse.json({ erro: "Valor invalido." }, { status: 400 });
    }

    const dia = Number(corpo.data.diaDoVencimento);
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
      return NextResponse.json(
        { erro: "O dia do vencimento vai de 1 a 31." },
        { status: 400 },
      );
    }

    const despesa = await comEscritorio(escritorioId, (db) =>
      db.despesaFixa.create({
        data: semEscritorio({
          descricao: corpo.data.descricao,
          categoria: corpo.data.categoria,
          fornecedor: corpo.data.fornecedor || null,
          valorCentavos,
          diaDoVencimento: dia,
        }),
      }),
    );
    return NextResponse.json({ despesa }, { status: 201 });
  } catch (erro) {
    return tratarErro(erro);
  }
}

/**
 * Gera os lancamentos do mes a partir das despesas fixas.
 *
 * Idempotente por construcao: ha indice unico em (despesaFixaId, competencia),
 * entao rodar duas vezes nao duplica nada. Isso importa porque quem clica
 * "gerar" e gente com pressa, e clicar duas vezes e o normal.
 *
 * O valor entra como PREVISAO: conta de agua muda todo mes, e o lancamento e
 * corrigido quando a conta chega — inclusive pela leitura do documento.
 */
export async function PUT(req: Request) {
  try {
    const { escritorioId } = await exigirAdministracao("FINANCEIRO");
    const corpo = await req.json().catch(() => ({}));
    const competencia =
      typeof corpo?.competencia === "string" &&
      /^\d{4}-\d{2}$/.test(corpo.competencia)
        ? corpo.competencia
        : competenciaDaData(new Date());

    const resultado = await comEscritorio(escritorioId, async (db) => {
      const fixas = await db.despesaFixa.findMany({ where: { ativo: true } });
      let criados = 0;
      let jaExistiam = 0;

      for (const fixa of fixas) {
        const jaTem = await db.lancamento.findFirst({
          where: { despesaFixaId: fixa.id, competencia },
          select: { id: true },
        });
        if (jaTem) {
          jaExistiam += 1;
          continue;
        }
        await db.lancamento.create({
          data: semEscritorio({
            descricao: fixa.descricao,
            valorCentavos: fixa.valorCentavos,
            tipo: "DESPESA",
            categoria: fixa.categoria,
            fornecedor: fixa.fornecedor,
            competencia,
            vencimento: vencimentoNaCompetencia(
              competencia,
              fixa.diaDoVencimento,
            ),
            despesaFixaId: fixa.id,
            observacoes: "Gerado da despesa fixa. Valor previsto.",
          }),
        });
        criados += 1;
      }
      return { criados, jaExistiam };
    });

    return NextResponse.json({ ...resultado, competencia });
  } catch (erro) {
    return tratarErro(erro);
  }
}
