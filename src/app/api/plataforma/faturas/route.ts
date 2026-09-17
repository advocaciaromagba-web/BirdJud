import { NextResponse } from "next/server";
import { z } from "zod";
import { prismaPlataforma } from "@/lib/prisma";
import { exigirOperador, registrarAcessoSuporte, SemOperador } from "@/lib/plataforma";
import { registrarPagamento } from "@/lib/cobranca";

const corpoEsperado = z.object({
  faturaId: z.string().min(1),
  acao: z.literal("pagar"),
  idExterno: z.string().max(120).optional(),
});

/**
 * Registro manual de pagamento pelo operador.
 *
 * Quando a cobranca automatica pelo meio de pagamento estiver ligada, o
 * webhook dele chamara registrarPagamento() pela mesma funcao — o caminho de
 * baixa e um so.
 */
export async function POST(req: Request) {
  try {
    const operador = await exigirOperador();
    const corpo = corpoEsperado.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }

    const fatura = await prismaPlataforma().fatura.findUnique({
      where: { id: corpo.data.faturaId },
      select: { id: true, escritorioId: true, status: true, competencia: true },
    });
    if (!fatura) return NextResponse.json({ erro: "Fatura nao encontrada." }, { status: 404 });
    if (fatura.status !== "ABERTA") {
      return NextResponse.json({ erro: `Fatura ja esta ${fatura.status}.` }, { status: 409 });
    }

    await registrarAcessoSuporte(
      operador.operadorId,
      fatura.escritorioId,
      `Baixa manual da fatura ${fatura.competencia}`
    );

    const resultado = await registrarPagamento(fatura.id, corpo.data.idExterno ?? null);
    return NextResponse.json({
      detalhe: `Pagamento registrado. Escritorio agora ${resultado.statusNovo}.`,
    });
  } catch (erro) {
    if (erro instanceof SemOperador) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    console.error(erro);
    return NextResponse.json({ erro: "Erro interno." }, { status: 500 });
  }
}
