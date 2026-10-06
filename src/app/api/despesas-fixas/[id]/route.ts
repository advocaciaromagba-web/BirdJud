import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirAdministracao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { vigenciaCoerente } from "@/lib/contas-a-pagar";

const acao = z.object({
  ativo: z.boolean().optional(),
  // Encerrar a vigencia em uma data, em vez de so desligar: desligar para de
  // gerar daqui para a frente, mas nao diz QUANDO acabou — e e a data que
  // explica por que setembro tem conta e outubro nao.
  fimEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

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
    if (corpo.data.ativo === undefined && corpo.data.fimEm === undefined) {
      return NextResponse.json({ erro: "Nada para mudar." }, { status: 400 });
    }

    const atual = await comEscritorio(escritorioId, (db) =>
      db.despesaFixa.findFirst({ where: { id }, select: { inicioEm: true } }),
    );
    if (!atual) {
      return NextResponse.json({ erro: "Nao encontrada." }, { status: 404 });
    }
    if (
      corpo.data.fimEm &&
      !vigenciaCoerente(
        atual.inicioEm ? atual.inicioEm.toISOString().slice(0, 10) : null,
        corpo.data.fimEm,
      )
    ) {
      return NextResponse.json(
        { erro: "O fim da vigencia vem antes do comeco." },
        { status: 400 },
      );
    }

    const alterados = await comEscritorio(escritorioId, (db) =>
      db.despesaFixa.updateMany({
        where: { id },
        data: {
          ...(corpo.data.ativo === undefined ? {} : { ativo: corpo.data.ativo }),
          ...(corpo.data.fimEm === undefined
            ? {}
            : {
                fimEm: corpo.data.fimEm
                  ? new Date(`${corpo.data.fimEm}T00:00:00Z`)
                  : null,
              }),
        },
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
