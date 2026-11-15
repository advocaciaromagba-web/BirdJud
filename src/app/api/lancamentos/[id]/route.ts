import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { portaDoLancamento } from "@/lib/porta-do-lancamento";
import { tratarErro } from "@/lib/respostas";
import { lerLinhaDigitavel } from "@/lib/boleto-da-conta";
import { apagarArquivo } from "@/lib/arquivos";

// Uma coisa por pedido: a baixa, ou a linha digitavel (null apaga).
const acao = z.union([
  z.object({ pago: z.boolean() }).strict(),
  z.object({ linhaDigitavel: z.string().max(120).nullable() }).strict(),
]);

/** Marcar como pago/recebido, ou desfazer. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { escritorioId } = (await portaDoLancamento(id)).contexto;
    const corpo = acao.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
    }

    let data: { pagoEm: Date | null } | { linhaDigitavel: string | null };
    if ("pago" in corpo.data) {
      data = { pagoEm: corpo.data.pago ? new Date() : null };
    } else if (corpo.data.linhaDigitavel === null || !corpo.data.linhaDigitavel.trim()) {
      data = { linhaDigitavel: null };
    } else {
      const lida = lerLinhaDigitavel(corpo.data.linhaDigitavel);
      if (!lida.ok) return NextResponse.json({ erro: lida.erro }, { status: 400 });
      data = { linhaDigitavel: lida.digitos };
    }

    const alterados = await comEscritorio(escritorioId, (db) =>
      db.lancamento.updateMany({
        // Linha digitavel e de conta a pagar; em receita nao faz sentido.
        where: "linhaDigitavel" in data ? { id, tipo: "DESPESA" } : { id },
        data,
      }),
    );
    if (alterados.count === 0) {
      return NextResponse.json(
        { erro: "Lançamento não encontrado." },
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
    const { id } = await params;
    const { escritorioId } = (await portaDoLancamento(id)).contexto;
    // Linha que veio de cobranca, de contrato ou do extrato conferido nao se
    // apaga por aqui: o outro lado ficaria apontando para nada. Desfaz-se
    // por la (a baixa, a conferencia).
    const preso = await comEscritorio(escritorioId, async (db) => {
      const l = await db.lancamento.findFirst({ where: { id }, select: { cobrancaId: true, contratoId: true } });
      if (!l) return null;
      if (l.cobrancaId || l.contratoId) return true;
      const ligados =
        (await db.entradaDeExtrato.count({ where: { lancamentoId: id } })) +
        (await db.baixaDeCobranca.count({ where: { lancamentoId: id } })) +
        (await db.cobranca.count({ where: { lancamentoId: id } }));
      return ligados > 0;
    });
    if (preso) {
      return NextResponse.json(
        { erro: "Este lançamento veio de cobrança, contrato ou extrato: desfaça por lá." },
        { status: 409 },
      );
    }
    // O boleto e o comprovante so existem por causa desta conta: saem junto,
    // senao ficam ocupando o espaco do escritorio sem aparecer em tela nenhuma.
    const anexos = await comEscritorio(escritorioId, (db) =>
      db.lancamento.findFirst({ where: { id }, select: { arquivoId: true, comprovanteId: true } }),
    );
    const apagados = await comEscritorio(escritorioId, (db) =>
      db.lancamento.deleteMany({ where: { id } }),
    );
    if (apagados.count > 0) {
      for (const arquivoId of [anexos?.arquivoId, anexos?.comprovanteId]) {
        if (arquivoId) await apagarArquivo(escritorioId, arquivoId).catch(() => {});
      }
    }
    if (apagados.count === 0) {
      return NextResponse.json(
        { erro: "Lançamento não encontrado." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return tratarErro(erro);
  }
}
