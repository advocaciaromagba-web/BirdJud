import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio, semEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { ehDuplicado, tratarErro } from "@/lib/respostas";
import { numeroParaGravar } from "@/lib/leitura-publicacao";

const novoProcesso = z.object({
  numero: z.string().min(5).max(30),
  clienteId: z.string().optional(),
  tribunal: z.string().max(60).optional(),
  vara: z.string().max(120).optional(),
  area: z.string().max(60).optional(),
});

export async function GET() {
  try {
    const { escritorioId } = await exigirSessao();
    const processos = await comEscritorio(escritorioId, (db) =>
      db.processo.findMany({
        orderBy: { criadoEm: "desc" },
        take: 200,
        include: { cliente: { select: { id: true, nome: true } } },
      })
    );
    return NextResponse.json({ processos });
  } catch (erro) {
    return tratarErro(erro);
  }
}

export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirSessao();
    const corpo = novoProcesso.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }

    // clienteId vem do formulario: conferir que e deste escritorio antes de
    // usar. A extensao filtra a leitura, entao um id de outro escritorio
    // simplesmente nao aparece aqui.
    const processo = await comEscritorio(escritorioId, async (db) => {
      if (corpo.data.clienteId) {
        const cliente = await db.cliente.findFirst({ where: { id: corpo.data.clienteId } });
        if (!cliente) return null;
      }
      return db.processo.create({
        data: semEscritorio({
          ...corpo.data,
          // Grafia canonica: e o que casa com a publicacao vinda do DJEN.
          numero: numeroParaGravar(corpo.data.numero),
        }),
      });
    });

    if (!processo) {
      return NextResponse.json({ erro: "Cliente nao encontrado." }, { status: 400 });
    }
    return NextResponse.json({ processo }, { status: 201 });
  } catch (erro) {
    if (ehDuplicado(erro)) {
      return NextResponse.json(
        { erro: "Ja existe um processo com este numero neste escritorio." },
        { status: 409 }
      );
    }
    return tratarErro(erro);
  }
}
