import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio, semEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { competenciaDe } from "@/lib/consumo";
import { paraCentavos } from "@/lib/dinheiro";
import { tratarErro } from "@/lib/respostas";

const novoLancamento = z.object({
  descricao: z.string().min(2).max(200),
  valor: z.string().min(1), // em reais, como digitado
  tipo: z.enum(["RECEITA", "DESPESA"]),
  competencia: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export async function GET() {
  try {
    // O modulo FINANCEIRO precisa estar contratado: sem ele, 403.
    const { escritorioId } = await exigirSessao("FINANCEIRO");
    const lancamentos = await comEscritorio(escritorioId, (db) =>
      db.lancamento.findMany({ orderBy: { criadoEm: "desc" }, take: 200 })
    );
    return NextResponse.json({ lancamentos });
  } catch (erro) {
    return tratarErro(erro);
  }
}

export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirSessao("FINANCEIRO");
    const corpo = novoLancamento.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }

    const valorCentavos = paraCentavos(corpo.data.valor);
    if (valorCentavos === null) {
      return NextResponse.json({ erro: "Valor invalido." }, { status: 400 });
    }

    const lancamento = await comEscritorio(escritorioId, (db) =>
      db.lancamento.create({
        data: semEscritorio({
          descricao: corpo.data.descricao,
          tipo: corpo.data.tipo,
          competencia: corpo.data.competencia ?? competenciaDe(),
          valorCentavos,
        }),
      })
    );
    return NextResponse.json({ lancamento }, { status: 201 });
  } catch (erro) {
    return tratarErro(erro);
  }
}
