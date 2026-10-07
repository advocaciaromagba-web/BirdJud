import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { advogadosDaPeca } from "@/lib/qualificacao";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { ehEspecie } from "@/lib/modelos-do-escritorio";
import { respostaDoDominio } from "@/lib/modelos-respostas";
import { EnvioRepetido, mandarAssinar } from "@/lib/assinatura-do-escritorio";

export const dynamic = "force-dynamic";

const pedido = z.object({
  clienteId: z.string().min(1),
  contratoId: z.string().min(1).nullish(),
  processoId: z.string().min(1).nullish(),
  advogadoIds: z.array(z.string().min(1)).max(50).optional(),
  quemAssina: z.enum(["CLIENTE", "ESCRITORIO", "AMBOS"]).optional(),
  mensagem: z.string().max(1000).nullish(),
  /** Confirmacao de reenvio. Cada envio custa ao escritorio. */
  mesmoAssim: z.boolean().optional(),
});

/**
 * Manda a peca para assinatura eletronica.
 *
 * So pelo POST, e so com clique: nada aqui dispara sozinho. Cada documento e
 * cobrado do escritorio pelo provedor, e o e-mail para o cliente sai na hora —
 * nao ha como desfazer uma procuracao mandada por engano.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ especie: string }> },
) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao("ASSINATURA");
    const { especie } = await params;
    if (!ehEspecie(especie)) {
      return NextResponse.json({ erro: "Especie invalida." }, { status: 400 });
    }

    const corpo = pedido.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      return NextResponse.json({ erro: "Pedido invalido." }, { status: 400 });
    }
    const { clienteId, contratoId, processoId } = corpo.data;

    const cliente = await comEscritorio(escritorioId, (db) =>
      db.cliente.findFirst({ where: { id: clienteId } }),
    );
    if (!cliente) {
      return NextResponse.json({ erro: "Cliente nao encontrado." }, { status: 404 });
    }

    const [representantes, contrato, processo, escritorio, advogados] = await Promise.all([
      comEscritorio(escritorioId, (db) =>
        db.representante.findMany({ where: { clienteId }, orderBy: { ordem: "asc" } }),
      ),
      contratoId
        ? comEscritorio(escritorioId, (db) =>
            db.contratoDeHonorarios.findFirst({ where: { id: contratoId, clienteId } }),
          )
        : comEscritorio(escritorioId, (db) =>
            db.contratoDeHonorarios.findFirst({
              where: { clienteId, ativo: true },
              orderBy: { criadoEm: "desc" },
            }),
          ),
      processoId
        ? comEscritorio(escritorioId, (db) =>
            db.processo.findFirst({ where: { id: processoId, clienteId } }),
          )
        : Promise.resolve(null),
      comEscritorio(escritorioId, (db) =>
        db.escritorio.findFirst({
          where: { id: escritorioId },
          select: {
            nome: true,
            cidade: true,
            telefoneAtendimento: true,
            razaoSocial: true,
            cnpj: true,
            registroOab: true,
            enderecos: true,
          },
        }),
      ),
      comEscritorio(escritorioId, (db) =>
        db.usuario.findMany({
          where: { ativo: true, papel: "ADVOGADO", assinaPecas: true },
          orderBy: { criadoEm: "asc" },
          select: {
            id: true,
            nome: true,
            email: true,
            oab: true,
            cpf: true,
            rg: true,
            nacionalidade: true,
            estadoCivil: true,
            sociedade: true,
            sociedadeCnpj: true,
          },
        }),
      ),
    ]);

    if (!escritorio) {
      return NextResponse.json({ erro: "Escritorio nao encontrado." }, { status: 404 });
    }

    const escolhidos =
      corpo.data.advogadoIds && corpo.data.advogadoIds.length > 0
        ? corpo.data.advogadoIds
        : cliente.advogadosIds;
    const assinam = advogadosDaPeca(advogados, escolhidos);

    const envio = await mandarAssinar(
      escritorioId,
      especie,
      {
        clienteId,
        cliente,
        representantes,
        escritorio,
        advogados: assinam,
        contrato,
        processo,
      },
      {
        advogados: assinam.map((a) => ({ nome: a.nome, email: a.email })),
        quemAssina: corpo.data.quemAssina,
        mensagem: corpo.data.mensagem,
        mesmoAssim: corpo.data.mesmoAssim,
        enviadoPor: usuarioId,
      },
    );

    return NextResponse.json({ envio }, { status: 201 });
  } catch (erro) {
    if (erro instanceof EnvioRepetido) {
      // 409 com o que ja existe: a tela mostra em que pe esta o envio anterior
      // antes de perguntar se manda de novo. Um "ja existe" sem dizer qual
      // obrigaria a pessoa a adivinhar.
      return NextResponse.json(
        { erro: erro.message, envioId: erro.envioId, situacao: erro.situacao },
        { status: 409 },
      );
    }
    return respostaDoDominio(erro) ?? tratarErro(erro);
  }
}
