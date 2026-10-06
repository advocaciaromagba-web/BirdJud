import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio, semEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { dataValida } from "@/lib/prazos";

export const dynamic = "force-dynamic";

/**
 * Dias sem expediente do proprio escritorio.
 *
 * Feriado municipal e suspensao de tribunal nao cabem em lista nacional: cada
 * escritorio trabalha em comarcas diferentes, e e justamente o dia que ninguem
 * lembra de conferir. Quem cadastra e o escritorio.
 */
const novo = z.object({
  dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  motivo: z.string().min(2).max(200),
});

export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirSessao();
    const corpo = novo.safeParse(await req.json().catch(() => null));
    if (!corpo.success || !dataValida(corpo.data.dia)) {
      return NextResponse.json({ erro: "Dia invalido." }, { status: 400 });
    }

    // Cadastrar o mesmo dia duas vezes nao e erro de quem cadastra: o indice
    // unico resolve e a resposta e a mesma.
    await comEscritorio(escritorioId, (db) =>
      db.diaSemExpediente.upsert({
        where: {
          escritorioId_dia: {
            escritorioId,
            dia: new Date(`${corpo.data.dia}T00:00:00Z`),
          },
        },
        update: { motivo: corpo.data.motivo.trim() },
        create: semEscritorio({
          dia: new Date(`${corpo.data.dia}T00:00:00Z`),
          motivo: corpo.data.motivo.trim(),
        }),
      }),
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (erro) {
    return tratarErro(erro);
  }
}

export async function DELETE(req: Request) {
  try {
    const { escritorioId } = await exigirSessao();
    const dia = new URL(req.url).searchParams.get("dia") ?? "";
    if (!dataValida(dia)) {
      return NextResponse.json({ erro: "Dia invalido." }, { status: 400 });
    }
    await comEscritorio(escritorioId, (db) =>
      db.diaSemExpediente.deleteMany({
        where: { dia: new Date(`${dia}T00:00:00Z`) },
      }),
    );
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return tratarErro(erro);
  }
}
