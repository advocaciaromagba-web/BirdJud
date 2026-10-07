import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { paraCentavos } from "@/lib/dinheiro";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { ehEspecie, gerarPeca } from "@/lib/modelos-do-escritorio";
import { respostaDoDominio } from "@/lib/modelos-respostas";

export const dynamic = "force-dynamic";

const TIPO_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const pedido = z.object({
  clienteId: z.string().min(1),
  contratoId: z.string().min(1).nullish(),
  processoId: z.string().min(1).nullish(),
  // So para o recibo: de qual cobranca paga ele sai. Sem id, a mais recente.
  cobrancaId: z.string().min(1).nullish(),
  // Recibo sem cobranca no sistema: dinheiro que entrou por fora.
  reciboValor: z.string().max(20).nullish(),
  reciboReferenteA: z.string().max(200).nullish(),
  reciboForma: z.string().max(40).nullish(),
  reciboData: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  // Previa devolve texto e avisos; sem ela, devolve o arquivo.
  previa: z.boolean().optional(),
});

const NOME_DA_FORMA: Record<string, string> = {
  BOLETO: "boleto",
  PIX: "Pix",
  CARTAO: "cartao",
  QUALQUER: "Pix ou cartao",
};

/**
 * Monta a peca para um cliente: o modelo vigente com os campos trocados.
 *
 * O contrato e o processo sao opcionais porque a procuracao e a declaracao
 * nao dependem deles — e uma declaracao de hipossuficiencia nao pode ficar
 * presa a existir um contrato de honorarios gravado.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ especie: string }> },
) {
  try {
    const { escritorioId } = await exigirSessao();
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
            // Sem contrato escolhido, o ativo do cliente: e o que quem clica
            // espera, e evita a peca sair com o valor em branco por descuido.
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
      // Quem assina pelo escritorio: advogado ativo que entra na peca. Um
      // advogado que nao atua mais fica no sistema e sai do papel.
      comEscritorio(escritorioId, (db) =>
        db.usuario.findMany({
          where: { ativo: true, papel: "ADVOGADO", assinaPecas: true },
          orderBy: { criadoEm: "asc" },
          select: {
            nome: true,
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

    // O recibo precisa de um pagamento. Se nao vier digitado, usa a cobranca
    // paga escolhida — ou a mais recente do cliente. Recibo de valor que o
    // sistema nao conhece so sai se alguem digitar: inventar o numero de um
    // recibo seria dar quitacao de um valor que ninguem conferiu.
    let recibo: {
      valorCentavos: number;
      referenteA: string;
      forma: string | null;
      quando: Date;
    } | null = null;

    if (especie === "RECIBO") {
      const digitado = corpo.data.reciboValor?.trim()
        ? paraCentavos(corpo.data.reciboValor)
        : null;

      if (digitado !== null && digitado > 0) {
        recibo = {
          valorCentavos: digitado,
          referenteA: corpo.data.reciboReferenteA?.trim() || "honorarios advocaticios",
          forma: corpo.data.reciboForma?.trim() || null,
          quando: corpo.data.reciboData
            ? new Date(`${corpo.data.reciboData}T00:00:00Z`)
            : new Date(),
        };
      } else {
        const paga = await comEscritorio(escritorioId, (db) =>
          db.cobranca.findFirst({
            where: {
              clienteId,
              status: "PAGA",
              ...(corpo.data.cobrancaId ? { id: corpo.data.cobrancaId } : {}),
            },
            orderBy: { pagoEm: "desc" },
          }),
        );
        if (paga) {
          recibo = {
            valorCentavos: paga.valorPagoCentavos ?? paga.valorCentavos,
            referenteA: paga.descricao,
            forma: NOME_DA_FORMA[paga.forma] ?? null,
            quando: paga.pagoEm ?? new Date(),
          };
        }
      }
    }

    const peca = await gerarPeca(escritorioId, especie, {
      cliente,
      representantes,
      escritorio,
      advogados,
      contrato,
      processo,
      recibo,
    });

    if (corpo.data.previa) {
      return NextResponse.json({
        texto: peca.texto,
        semValor: peca.semValor,
        desconhecidos: peca.desconhecidos,
        doEscritorio: peca.doEscritorio,
      });
    }

    return new NextResponse(new Uint8Array(peca.arquivo), {
      headers: {
        "content-type": TIPO_DOCX,
        "content-disposition": `attachment; filename="${peca.nomeDoArquivo}"`,
        // O que ficou sem valor vai no cabecalho tambem: a tela avisa mesmo
        // quando o download foi direto.
        "x-campos-sem-valor": peca.semValor.join(","),
        "cache-control": "no-store",
      },
    });
  } catch (erro) {
    return respostaDoDominio(erro) ?? tratarErro(erro);
  }
}
