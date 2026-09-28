import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirAdministracao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";

const acao = z.object({ ativo: z.boolean() });

/** Ligar e desligar. Nao apaga: o historico do que ja foi gerado continua. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId } = await exigirAdministracao("FINANCEIRO");
    const { id } = await params;
    const corpo = acao.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Pedido invalido." }, { status: 400 });
    }
    const alterados = await comEscritorio(escritorioId, (db) =>
      db.despesaFixa.updateMany({
        where: { id },
        data: { ativo: corpo.data.ativo },
      }),
    );
    if (alterados.count === 0) {
      return NextResponse.json({ erro: "Nao encontrada." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return tratarErro(erro);
  }
}
