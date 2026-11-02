import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { paraCentavos } from "@/lib/dinheiro";
import { tratarErro } from "@/lib/respostas";
import {
  cancelarCobranca,
  conciliarCobranca,
  completarDocumentoDoCliente,
  ClienteSemDocumento,
  emitirCobranca,
  FalhaNoAsaas,
  FORMAS,
  PedidoInvalido,
  SemContaDeCobranca,
  sincronizarCobrancas,
} from "@/lib/cobrancas";
import { PROVEDORES } from "@/lib/provedores";
import { emitirNaInfinitePay } from "@/lib/infinitepay-do-escritorio";

const novaCobranca = z.object({
  clienteId: z.string().min(1),
  processoId: z.string().min(1).optional(),
  descricao: z.string().min(2).max(200),
  valor: z.string().min(1), // em reais, como digitado
  vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  forma: z.enum(FORMAS),
  chaveOperacao: z.string().uuid(),
  // Em qual conta do escritorio a cobranca nasce. Quem escolhe e quem emite,
  // sempre na hora — o sistema nunca escolhe por conta propria.
  provedor: z.enum(PROVEDORES).optional(),
  /** CPF/CNPJ de cliente que ainda nao tem: vai para o cadastro antes de cobrar. */
  documentoDoCliente: z.string().max(20).optional(),
  // Fatura parcelada (so Asaas). Vem do formulario como texto.
  parcelas: z.coerce.number().int().min(1).max(24).optional(),
  valorRefereA: z.enum(["TOTAL", "PARCELA"]).optional(),
});

const acao = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("CANCELAR"), id: z.string().min(1) }),
  z.object({ acao: z.literal("SINCRONIZAR") }),
  z.object({ acao: z.literal("CONCILIAR"), id: z.string().min(1) }),
]);

/** Erro de dominio do modulo -> status proprio. O resto cai no tratarErro. */
function respostaDoDominio(erro: unknown): NextResponse | null {
  if (
    erro instanceof SemContaDeCobranca ||
    erro instanceof ClienteSemDocumento ||
    erro instanceof FalhaNoAsaas ||
    erro instanceof PedidoInvalido
  ) {
    return NextResponse.json({ erro: erro.message }, { status: erro.status });
  }
  return null;
}

export async function GET() {
  try {
    const { escritorioId } = await exigirSessao("COBRANCAS", "COBRANCAS");
    const cobrancas = await comEscritorio(escritorioId, (db) =>
      db.cobranca.findMany({
        orderBy: [{ status: "asc" }, { vencimento: "asc" }],
        take: 200,
        include: { cliente: { select: { nome: true } } },
      }),
    );
    return NextResponse.json({ cobrancas });
  } catch (erro) {
    return tratarErro(erro);
  }
}

export async function POST(req: Request) {
  try {
    const { escritorioId, acesso } = await exigirSessao("COBRANCAS", "COBRANCAS_EMITIR");
    const corpo = novaCobranca.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
    }

    // Escrever no cadastro continua exigindo a area Clientes: quem so tem
    // Cobrancas nao passa a editar cliente por este caminho.
    if (corpo.data.documentoDoCliente?.trim()) {
      if (acesso.CLIENTES !== true) {
        return NextResponse.json(
          { erro: "O cliente está sem CPF/CNPJ e seu acesso a Clientes está fechado. Peça a quem cuida do cadastro." },
          { status: 403 },
        );
      }
      await completarDocumentoDoCliente(escritorioId, corpo.data.clienteId, corpo.data.documentoDoCliente);
    }

    const valorCentavos = paraCentavos(corpo.data.valor);
    if (valorCentavos === null || valorCentavos <= 0) {
      return NextResponse.json({ erro: "Valor inválido." }, { status: 400 });
    }

    // Meio-dia UTC para o vencimento nao escorregar de dia por fuso.
    const vencimento = new Date(`${corpo.data.vencimento}T12:00:00Z`);

    if ((corpo.data.parcelas ?? 1) > 1 && corpo.data.provedor === "INFINITEPAY") {
      return NextResponse.json({ erro: "Fatura parcelada só pelo Asaas." }, { status: 400 });
    }

    const cobranca =
      corpo.data.provedor === "INFINITEPAY"
        ? await emitirNaInfinitePay(escritorioId, {
            clienteId: corpo.data.clienteId,
            processoId: corpo.data.processoId ?? null,
            descricao: corpo.data.descricao,
            valorCentavos,
            vencimento,
            chaveOperacao: corpo.data.chaveOperacao,
          })
        : await emitirCobranca(escritorioId, {
            clienteId: corpo.data.clienteId,
            processoId: corpo.data.processoId ?? null,
            descricao: corpo.data.descricao,
            valorCentavos,
            vencimento,
            forma: corpo.data.forma,
            chaveOperacao: corpo.data.chaveOperacao,
            parcelas: corpo.data.parcelas,
            valorRefereA: corpo.data.valorRefereA,
          });
    return NextResponse.json({ cobranca }, { status: 201 });
  } catch (erro) {
    return respostaDoDominio(erro) ?? tratarErro(erro);
  }
}

export async function PATCH(req: Request) {
  try {
    const { escritorioId, acesso } = await exigirSessao("COBRANCAS", "COBRANCAS");
    const corpo = acao.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });
    }

    if (corpo.data.acao === "CANCELAR") {
      if (acesso.COBRANCAS_DESFAZER !== true) {
        return NextResponse.json({ erro: "Cancelar cobrança não está liberado para o seu acesso." }, { status: 403 });
      }
      await cancelarCobranca(escritorioId, corpo.data.id);
      return NextResponse.json({ ok: true });
    }

    if (corpo.data.acao === "CONCILIAR") {
      const cobranca = await conciliarCobranca(escritorioId, corpo.data.id);
      return NextResponse.json({ cobranca });
    }

    const resultado = await sincronizarCobrancas(escritorioId);
    return NextResponse.json({ resultado });
  } catch (erro) {
    return respostaDoDominio(erro) ?? tratarErro(erro);
  }
}
