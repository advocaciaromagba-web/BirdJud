import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { paraCentavos } from "@/lib/dinheiro";
import { advogadosDaPeca } from "@/lib/qualificacao";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { ehEspecie } from "@/lib/modelos-do-escritorio";
import { respostaDoDominio } from "@/lib/modelos-respostas";
import { NaoDaParaMandar, mandarPecaNoWhatsapp } from "@/lib/documento-no-whatsapp";

export const dynamic = "force-dynamic";

const NOME_DA_FORMA: Record<string, string> = {
  BOLETO: "boleto",
  PIX: "Pix",
  CARTAO: "cartao",
  QUALQUER: "Pix ou cartao",
};

const pedido = z.object({
  clienteId: z.string().min(1),
  contratoId: z.string().min(1).nullish(),
  processoId: z.string().min(1).nullish(),
  advogadoIds: z.array(z.string().min(1)).max(50).optional(),
  reciboValor: z.string().max(20).nullish(),
  reciboReferenteA: z.string().max(200).nullish(),
  reciboForma: z.string().max(40).nullish(),
  reciboData: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

/**
 * Manda a peca em PDF para o WhatsApp do cliente.
 *
 * O numero vem do CADASTRO, nunca digitado aqui: mandar a procuracao de uma
 * pessoa para o telefone de outra nao da erro nenhum e nao se desfaz.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ especie: string }> },
) {
  try {
    const { escritorioId } = await exigirSessao("WHATSAPP");
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

    // O recibo precisa de um pagamento. Digitado, vale o digitado; em branco,
    // sai da ultima cobranca paga — o MESMO caminho da tela de gerar a peca.
    // Se aqui fosse diferente, o recibo baixado e o recibo mandado por
    // WhatsApp diriam valores diferentes.
    const valorDoRecibo = corpo.data.reciboValor?.trim()
      ? paraCentavos(corpo.data.reciboValor)
      : null;
    let recibo: {
      valorCentavos: number;
      referenteA: string;
      forma: string | null;
      quando: Date;
    } | null = null;

    if (especie === "RECIBO") {
      if (valorDoRecibo !== null && valorDoRecibo > 0) {
        recibo = {
          valorCentavos: valorDoRecibo,
          referenteA: corpo.data.reciboReferenteA?.trim() || "honorarios advocaticios",
          forma: corpo.data.reciboForma?.trim() || null,
          quando: corpo.data.reciboData
            ? new Date(`${corpo.data.reciboData}T00:00:00Z`)
            : new Date(),
        };
      } else {
        const paga = await comEscritorio(escritorioId, (db) =>
          db.cobranca.findFirst({
            where: { clienteId, status: "PAGA" },
            orderBy: { pagoEm: "desc" },
          }),
        );
        if (!paga) {
          return NextResponse.json(
            {
              erro:
                "Nao ha pagamento para este recibo. Digite o valor na tela de gerar documentos antes de mandar.",
            },
            { status: 422 },
          );
        }
        recibo = {
          valorCentavos: paga.valorPagoCentavos ?? paga.valorCentavos,
          referenteA: paga.descricao,
          forma: NOME_DA_FORMA[paga.forma] ?? null,
          quando: paga.pagoEm ?? new Date(),
        };
      }
    }

    const mandado = await mandarPecaNoWhatsapp(escritorioId, especie, {
      clienteId,
      cliente,
      representantes,
      escritorio,
      advogados: assinam,
      contrato,
      processo,
      recibo,
    });

    return NextResponse.json({ mandado }, { status: 201 });
  } catch (erro) {
    if (erro instanceof NaoDaParaMandar) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return respostaDoDominio(erro) ?? tratarErro(erro);
  }
}
