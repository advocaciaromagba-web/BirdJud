import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio, semEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";

const TIPOS = ["COMPROMISSO", "AUDIENCIA", "PRAZO", "TAREFA"] as const;

const novoCompromisso = z.object({
  titulo: z.string().min(2).max(200),
  tipo: z.enum(TIPOS).default("COMPROMISSO"),
  inicio: z.string().datetime({ offset: true }).or(z.string().min(10)),
  local: z.string().max(200).optional(),
  processoId: z.string().optional(),
  observacoes: z.string().max(2000).optional(),
});

export async function GET() {
  try {
    const { escritorioId } = await exigirSessao();
    const compromissos = await comEscritorio(escritorioId, (db) =>
      db.compromisso.findMany({
        where: { inicio: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        orderBy: { inicio: "asc" },
        take: 200,
      }),
    );
    return NextResponse.json({ compromissos });
  } catch (erro) {
    return tratarErro(erro);
  }
}

export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirSessao();
    const corpo = novoCompromisso.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }

    const inicio = new Date(corpo.data.inicio);
    if (Number.isNaN(inicio.getTime())) {
      return NextResponse.json({ erro: "Data invalida." }, { status: 400 });
    }

    const compromisso = await comEscritorio(escritorioId, async (db) => {
      if (corpo.data.processoId) {
        const processo = await db.processo.findFirst({
          where: { id: corpo.data.processoId },
        });
        if (!processo) return null;
      }
      return db.compromisso.create({
        data: semEscritorio({ ...corpo.data, inicio }),
      });
    });

    if (!compromisso) {
      return NextResponse.json(
        { erro: "Processo nao encontrado." },
        { status: 400 },
      );
    }
    return NextResponse.json({ compromisso }, { status: 201 });
  } catch (erro) {
    return tratarErro(erro);
  }
}
