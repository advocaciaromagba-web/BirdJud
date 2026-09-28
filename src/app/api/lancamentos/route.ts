import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio, semEscritorio } from "@/lib/prisma";
import { exigirAdministracao } from "@/lib/sessao";
import { paraCentavos } from "@/lib/dinheiro";
import {
  CATEGORIAS,
  categoriaCombina,
  competenciaDaData,
} from "@/lib/financeiro";
import { normalizarData } from "@/lib/leitura-documento";
import { tratarErro } from "@/lib/respostas";

const novoLancamento = z.object({
  descricao: z.string().min(2).max(200),
  valor: z.string().min(1), // em reais, como digitado
  tipo: z.enum(["RECEITA", "DESPESA"]),
  categoria: z.enum(CATEGORIAS as unknown as [string, ...string[]]).optional(),
  fornecedor: z.string().max(120).optional(),
  vencimento: z.string().max(30).optional(),
  pago: z.union([z.boolean(), z.literal("sim"), z.literal("nao")]).optional(),
  observacoes: z.string().max(2000).optional(),
  competencia: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

export async function GET(req: Request) {
  try {
    // O modulo FINANCEIRO precisa estar contratado, o papel precisa ser ADMIN,
    // e a senha de administracao precisa ter sido digitada.
    const { escritorioId } = await exigirAdministracao("FINANCEIRO");
    const competencia = new URL(req.url).searchParams.get("competencia");

    const lancamentos = await comEscritorio(escritorioId, (db) =>
      db.lancamento.findMany({
        where: competencia ? { competencia } : undefined,
        orderBy: [{ vencimento: "asc" }, { criadoEm: "desc" }],
        take: 500,
      }),
    );
    return NextResponse.json({ lancamentos });
  } catch (erro) {
    return tratarErro(erro);
  }
}

export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirAdministracao("FINANCEIRO");
    const corpo = novoLancamento.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }

    const valorCentavos = paraCentavos(corpo.data.valor);
    if (valorCentavos === null || valorCentavos === 0) {
      return NextResponse.json({ erro: "Valor invalido." }, { status: 400 });
    }

    const { categoria, tipo } = corpo.data;
    // Aluguel lancado como receita passa despercebido no total e destroi o
    // comparativo com o mes anterior.
    if (categoria && !categoriaCombina(tipo, categoria)) {
      return NextResponse.json(
        { erro: "Esta categoria nao combina com o tipo do lancamento." },
        { status: 400 },
      );
    }

    let vencimento: Date | null = null;
    if (corpo.data.vencimento) {
      const normalizada = normalizarData(corpo.data.vencimento);
      if (!normalizada) {
        return NextResponse.json(
          { erro: "Data de vencimento invalida." },
          { status: 400 },
        );
      }
      vencimento = new Date(`${normalizada}T12:00:00Z`);
    }

    // A competencia segue o vencimento quando ha um: a conta de energia que
    // vence em outubro e despesa de outubro, mesmo lancada em setembro.
    const competencia =
      corpo.data.competencia ??
      competenciaDaData(vencimento ?? new Date());

    const pago = corpo.data.pago === true || corpo.data.pago === "sim";

    const lancamento = await comEscritorio(escritorioId, (db) =>
      db.lancamento.create({
        data: semEscritorio({
          descricao: corpo.data.descricao,
          valorCentavos,
          tipo,
          categoria: categoria ?? null,
          fornecedor: corpo.data.fornecedor || null,
          observacoes: corpo.data.observacoes || null,
          competencia,
          vencimento,
          pagoEm: pago ? new Date() : null,
        }),
      }),
    );

    return NextResponse.json({ lancamento }, { status: 201 });
  } catch (erro) {
    return tratarErro(erro);
  }
}
