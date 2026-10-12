import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio, semEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { cutucarNuvem } from "@/lib/avisar-nuvem";
import { vincularProcessosAoCliente } from "@/lib/processos-do-djen";

export const dynamic = "force-dynamic";

const pedido = z.object({ nome: z.string().trim().min(3).max(200) });

/**
 * Uma parte do processo (vinda do DJEN) vira cliente do escritorio, com um
 * clique — e o processo, e os outros em que ela aparece, passam a ser dele.
 * E como a base de clientes nasce dos processos que o escritorio ja tem.
 * O cadastro sai so com o nome: o resto completa-se na ficha (ou lendo o
 * documento pela IA).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId } = await exigirSessao(undefined, "PROCESSOS");
    const { id } = await params;
    const corpo = pedido.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return NextResponse.json({ erro: "Nome invalido." }, { status: 400 });

    const r = await comEscritorio(escritorioId, async (db) => {
      const processo = await db.processo.findFirst({ where: { id }, select: { id: true, clienteId: true } });
      if (!processo) return null;
      // Nome ja cadastrado: usa o cliente que existe em vez de duplicar.
      const nome = corpo.data.nome.replace(/\s+/g, " ");
      const existente = await db.cliente.findFirst({
        where: { nome: { equals: nome, mode: "insensitive" } },
        select: { id: true },
      });
      const cliente = existente ?? (await db.cliente.create({ data: semEscritorio({ nome }), select: { id: true } }));
      if (!processo.clienteId) {
        await db.processo.update({ where: { id: processo.id }, data: { clienteId: cliente.id } });
      }
      return { clienteId: cliente.id, novo: !existente };
    });
    if (!r) return NextResponse.json({ erro: "Processo nao encontrado." }, { status: 404 });

    const outros = await vincularProcessosAoCliente(escritorioId, r.clienteId).catch(() => 0);
    if (r.novo) await cutucarNuvem(escritorioId);
    return NextResponse.json({ ...r, outrosProcessos: outros }, { status: 201 });
  } catch (erro) {
    return tratarErro(erro);
  }
}
