import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { paraCentavos } from "@/lib/dinheiro";
import { tratarErro } from "@/lib/respostas";
import {
  cancelarCobranca,
  conciliarCobranca,
  ClienteSemDocumento,
  emitirCobranca,
  FalhaNoAsaas,
  FORMAS,
  PedidoInvalido,
  SemContaDeCobranca,
  sincronizarCobrancas,
} from "@/lib/cobrancas";

const novaCobranca = z.object({
  clienteId: z.string().min(1),
  processoId: z.string().min(1).optional(),
  descricao: z.string().min(2).max(200),
  valor: z.string().min(1), // em reais, como digitado
  vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  forma: z.enum(FORMAS),
  chaveOperacao: z.string().uuid(),
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
    const { escritorioId } = await exigirSessao("COBRANCAS");
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
    const { escritorioId } = await exigirSessao("COBRANCAS");
    const corpo = novaCobranca.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }

    const valorCentavos = paraCentavos(corpo.data.valor);
    if (valorCentavos === null || valorCentavos <= 0) {
      return NextResponse.json({ erro: "Valor invalido." }, { status: 400 });
    }

    const cobranca = await emitirCobranca(escritorioId, {
      clienteId: corpo.data.clienteId,
      processoId: corpo.data.processoId ?? null,
      descricao: corpo.data.descricao,
      valorCentavos,
      // Meio-dia UTC para o vencimento nao escorregar de dia por fuso.
      vencimento: new Date(`${corpo.data.vencimento}T12:00:00Z`),
      forma: corpo.data.forma,
      chaveOperacao: corpo.data.chaveOperacao,
    });
    return NextResponse.json({ cobranca }, { status: 201 });
  } catch (erro) {
    return respostaDoDominio(erro) ?? tratarErro(erro);
  }
}

export async function PATCH(req: Request) {
  try {
    const { escritorioId } = await exigirSessao("COBRANCAS");
    const corpo = acao.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Acao invalida." }, { status: 400 });
    }

    if (corpo.data.acao === "CANCELAR") {
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
