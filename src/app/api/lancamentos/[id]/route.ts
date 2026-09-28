import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirAdministracao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";

const acao = z.object({ pago: z.boolean() });

/** Marcar como pago/recebido, ou desfazer. */
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
      db.lancamento.updateMany({
        where: { id },
        data: { pagoEm: corpo.data.pago ? new Date() : null },
      }),
    );
    if (alterados.count === 0) {
      return NextResponse.json(
        { erro: "Lancamento nao encontrado." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return tratarErro(erro);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId } = await exigirAdministracao("FINANCEIRO");
    const { id } = await params;
    const apagados = await comEscritorio(escritorioId, (db) =>
      db.lancamento.deleteMany({ where: { id } }),
    );
    if (apagados.count === 0) {
      return NextResponse.json(
        { erro: "Lancamento nao encontrado." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return tratarErro(erro);
  }
}
