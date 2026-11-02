import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { paraCentavos } from "@/lib/dinheiro";
import { reemitirBoleto } from "@/lib/baixas-de-cobranca";
import { respostaDaCobranca } from "@/lib/respostas-de-cobranca";

export const dynamic = "force-dynamic";

const pedido = z.object({
  vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  valor: z.string().max(20).nullish(),
});

/** Vencimento novo no Asaas. O cliente nao e avisado: o link volta para a tela. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId } = await exigirSessao("COBRANCAS", "COBRANCAS_EMITIR");
    const { id } = await params;
    const corpo = pedido.safeParse(await req.json());
    if (!corpo.success) return NextResponse.json({ erro: "Informe o novo vencimento." }, { status: 400 });
    let valorCentavos: number | null = null;
    if (corpo.data.valor?.trim()) {
      valorCentavos = paraCentavos(corpo.data.valor);
      if (valorCentavos === null || valorCentavos <= 0) return NextResponse.json({ erro: "Valor inválido." }, { status: 400 });
    }
    const r = await reemitirBoleto(escritorioId, id, { vencimento: new Date(`${corpo.data.vencimento}T12:00:00Z`), valorCentavos });
    return NextResponse.json(r);
  } catch (erro) {
    return respostaDaCobranca(erro) ?? tratarErro(erro);
  }
}
