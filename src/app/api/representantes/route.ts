import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { comEscritorio, semEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import {
  RepresentanteInvalido,
  prepararRepresentantes,
} from "@/lib/representantes";

export const dynamic = "force-dynamic";

const umEndereco = z
  .object({
    rua: z.string().max(200).nullish(),
    numero: z.string().max(20).nullish(),
    complemento: z.string().max(100).nullish(),
    bairro: z.string().max(100).nullish(),
    cidade: z.string().max(100).nullish(),
    uf: z.string().max(2).nullish(),
    cep: z.string().max(12).nullish(),
  })
  .nullish();

const pedido = z.object({
  clienteId: z.string().cuid(),
  representantes: z
    .array(
      z.object({
        nome: z.string().max(200).nullish(),
        cpf: z.string().max(20).nullish(),
        rg: z.string().max(30).nullish(),
        nacionalidade: z.string().max(60).nullish(),
        estadoCivil: z.string().max(40).nullish(),
        profissao: z.string().max(100).nullish(),
        email: z.string().max(200).nullish(),
        telefone: z.string().max(20).nullish(),
        mesmoEnderecoDaEmpresa: z.boolean().optional(),
        endereco: umEndereco,
      }),
    )
    .max(20),
});

/**
 * Grava a lista inteira de representantes de um cliente.
 *
 * SUBSTITUI, nao acrescenta: a tela edita a lista como um todo, e um POST que
 * acrescentasse deixaria o representante removido na tela ainda gravado — e
 * ele sairia na proxima procuracao.
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

    const lista = prepararRepresentantes(corpo.data.representantes);

    await comEscritorio(escritorioId, (db) =>
      db.representante.deleteMany({ where: { clienteId: cliente.id } }),
    );
    if (lista.length > 0) {
      await comEscritorio(escritorioId, (db) =>
        db.representante.createMany({
          data: lista.map((r) =>
            semEscritorio({
              clienteId: cliente.id,
              ordem: r.ordem,
              nome: r.nome,
              cpf: r.cpf,
              rg: r.rg,
              nacionalidade: r.nacionalidade,
              estadoCivil: r.estadoCivil,
              profissao: r.profissao,
              email: r.email,
              telefone: r.telefone,
              mesmoEnderecoDaEmpresa: r.mesmoEnderecoDaEmpresa,
              endereco: (r.endereco ?? undefined) as Prisma.InputJsonValue | undefined,
            }),
          ),
        }),
      );
    }

    return NextResponse.json({ gravados: lista.length });
  } catch (erro) {
    // A recusa e do usuario, nao do sistema: a mensagem dela diz qual linha
    // esta errada e por que.
    if (erro instanceof RepresentanteInvalido) {
      return NextResponse.json({ erro: erro.message }, { status: 400 });
    }
    return tratarErro(erro);
  }
}
