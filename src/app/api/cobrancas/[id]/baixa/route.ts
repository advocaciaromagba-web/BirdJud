import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { paraCentavos } from "@/lib/dinheiro";
import { desfazerBaixa, registrarBaixaManual } from "@/lib/baixas-de-cobranca";
import { respostaDaCobranca } from "@/lib/respostas-de-cobranca";

export const dynamic = "force-dynamic";

const baixa = z.object({
  valor: z.string().min(1),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  observacao: z.string().max(300).nullish(),
});

/** Baixa manual: parcial ou total, com a data em que o pagamento aconteceu. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId, nomeUsuario } = await exigirSessao("COBRANCAS");
    const { id } = await params;
    const corpo = baixa.safeParse(await req.json());
    if (!corpo.success) return NextResponse.json({ erro: "Informe o valor e a data do pagamento." }, { status: 400 });
    const valorCentavos = paraCentavos(corpo.data.valor);
    if (valorCentavos === null || valorCentavos <= 0) return NextResponse.json({ erro: "Valor inválido." }, { status: 400 });
    const r = await registrarBaixaManual(
      escritorioId,
      id,
      { valorCentavos, data: new Date(`${corpo.data.data}T12:00:00Z`), observacao: corpo.data.observacao },
      nomeUsuario,
    );
    return NextResponse.json({ quitou: r.quitou }, { status: 201 });
  } catch (erro) {
    return respostaDaCobranca(erro) ?? tratarErro(erro);
  }
}

/** Desfaz uma baixa manual (?baixa=<id>). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId } = await exigirSessao("COBRANCAS");
    const { id } = await params;
    const baixaId = new URL(req.url).searchParams.get("baixa");
    if (!baixaId) return NextResponse.json({ erro: "Qual baixa?" }, { status: 400 });
    await desfazerBaixa(escritorioId, id, baixaId);
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return respostaDaCobranca(erro) ?? tratarErro(erro);
  }
}
