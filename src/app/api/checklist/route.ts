import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio, semEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { montar, montarComIA, type Checklist } from "@/lib/checklist";
import { moduloAtivo } from "@/lib/modulos";
import { registrarConsumo } from "@/lib/consumo";
import { milTokens } from "@/lib/ia";

export const dynamic = "force-dynamic";

const pedido = z.object({
  clienteId: z.string().cuid(),
  processoId: z.string().cuid().nullish(),
  tipoAcao: z.string().min(3).max(200),
  area: z.string().max(100).nullish(),
  descricao: z.string().max(4000).nullish(),
  pedeGratuidade: z.boolean().default(false),
});

/**
 * Monta a lista de documentos de um cliente e grava item a item.
 *
 * SEM O MODULO DE IA A LISTA AINDA SAI: a base — documentos pessoais, justica
 * gratuita e acessos — e fixa em codigo. A IA so acrescenta o que depende da
 * materia. Um escritorio que nao contratou IA recebe uma lista menor, nao uma
 * tela de erro.
 */
export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirSessao();
    const corpo = pedido.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }

    const cliente = await comEscritorio(escritorioId, (db) =>
      db.cliente.findFirst({
        where: { id: corpo.data.clienteId },
        select: { id: true },
      }),
    );
    if (!cliente) {
      return NextResponse.json({ erro: "Cliente nao encontrado." }, { status: 404 });
    }

    const ctx = {
      tipoAcao: corpo.data.tipoAcao,
      area: corpo.data.area ?? null,
      descricao: corpo.data.descricao ?? null,
      pedeGratuidade: corpo.data.pedeGratuidade,
    };

    let lista: Checklist;
    let avisoDaIA: string | null = null;
    if (await moduloAtivo(escritorioId, "IA")) {
      try {
        const r = await montarComIA(ctx);
        lista = r.checklist;
        await registrarConsumo(
          escritorioId,
          "IA_MIL_TOKENS",
          milTokens(r.tokensEntrada, r.tokensSaida),
        );
      } catch (erro) {
        // A IA falhar nao pode custar a lista inteira: a base continua valendo,
        // e o escritorio fica sabendo o que deixou de vir.
        console.error("checklist: IA falhou", erro);
        lista = montar(ctx);
        avisoDaIA =
          "A parte especifica da acao nao pode ser montada agora. A lista basica esta completa.";
      }
    } else {
      lista = montar(ctx);
    }

    // Refazer a lista do mesmo cliente SUBSTITUI a anterior: duas listas lado a
    // lado deixariam alguem marcando itens de uma e conferindo a outra.
    await comEscritorio(escritorioId, (db) =>
      db.itemDeChecklist.deleteMany({ where: { clienteId: cliente.id } }),
    );
    await comEscritorio(escritorioId, (db) =>
      db.itemDeChecklist.createMany({
        data: lista.itens.map((item, ordem) =>
          semEscritorio({
            clienteId: cliente.id,
            processoId: corpo.data.processoId ?? null,
            grupo: item.grupo,
            documento: item.documento,
            paraQue: item.paraQue,
            essencial: item.essencial,
            tipoAcao: lista.tipoAcao,
            ordem,
          }),
        ),
      }),
    );

    return NextResponse.json(
      { itens: lista.itens.length, observacoes: lista.observacoes, avisoDaIA },
      { status: 201 },
    );
  } catch (erro) {
    return tratarErro(erro);
  }
}
