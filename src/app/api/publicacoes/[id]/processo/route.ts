import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { comEscritorio, semEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";

export const dynamic = "force-dynamic";

const pedido = z.object({ clienteId: z.string().min(1).nullish() });

/**
 * Cadastra o processo da publicacao, a mao. E o caminho do segredo de
 * justica — que o sistema nao cadastra sozinho — e de qualquer processo que
 * tenha ficado de fora. Liga a publicacao (e as outras do mesmo numero).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId } = await exigirSessao("PUBLICACOES_DJEN", "PUBLICACOES");
    const { id } = await params;
    const corpo = pedido.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });

    const r = await comEscritorio(escritorioId, async (db) => {
      const p = await db.publicacao.findFirst({ where: { id } });
      if (!p?.numeroProcesso) return { erro: "Publicação sem número de processo.", status: 400 } as const;
      if (corpo.data.clienteId && !(await db.cliente.findFirst({ where: { id: corpo.data.clienteId }, select: { id: true } }))) {
        return { erro: "Cliente não encontrado.", status: 404 } as const;
      }
      const existente = await db.processo.findFirst({ where: { numero: p.numeroProcesso }, select: { id: true } });
      const processo =
        existente ??
        (await db.processo.create({
          data: semEscritorio({
            numero: p.numeroProcesso,
            tribunal: p.tribunal,
            vara: p.orgao,
            partes: (p.partes ?? undefined) as Prisma.InputJsonValue | undefined,
            clienteId: corpo.data.clienteId ?? null,
          }),
          select: { id: true },
        }));
      if (existente && corpo.data.clienteId) {
        await db.processo.updateMany({ where: { id: existente.id, clienteId: null }, data: { clienteId: corpo.data.clienteId } });
      }
      await db.publicacao.updateMany({
        where: { numeroProcesso: p.numeroProcesso, processoId: null },
        data: { processoId: processo.id },
      });
      return { processoId: processo.id } as const;
    });
    if ("erro" in r) return NextResponse.json({ erro: r.erro }, { status: r.status });
    return NextResponse.json(r, { status: 201 });
  } catch (erro) {
    return tratarErro(erro);
  }
}
