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
import { gerarContasDoMes } from "@/lib/contas-do-escritorio";
import { vigenciaCoerente } from "@/lib/contas-a-pagar";

const nova = z.object({
  descricao: z.string().min(2).max(200),
  categoria: z.enum(CATEGORIAS_DE_DESPESA),
  fornecedor: z.string().max(120).optional(),
  valor: z.string().min(1),
  diaDoVencimento: z.union([z.string(), z.number()]),
  // De quando ate quando a despesa existe. Vazio dos dois lados: vale sempre.
  inicioEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  fimEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  observacoes: z.string().max(300).nullish(),
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

    const inicioEm = corpo.data.inicioEm || null;
    const fimEm = corpo.data.fimEm || null;
    if (!vigenciaCoerente(inicioEm, fimEm)) {
      return NextResponse.json(
        { erro: "O fim da vigencia vem antes do comeco." },
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
          inicioEm: inicioEm ? new Date(`${inicioEm}T00:00:00Z`) : null,
          fimEm: fimEm ? new Date(`${fimEm}T00:00:00Z`) : null,
          observacoes: corpo.data.observacoes || null,
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
 * A regra de quais despesas valem neste mes, e de nao duplicar, mora em
 * contas-do-escritorio.ts — a mesma que o cron usa todo dia. Dois caminhos
 * para a mesma coisa nao podem ter duas regras.
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

    const resultado = await gerarContasDoMes(escritorioId, competencia);
    return NextResponse.json({ ...resultado, competencia });
  } catch (erro) {
    return tratarErro(erro);
  }
}
