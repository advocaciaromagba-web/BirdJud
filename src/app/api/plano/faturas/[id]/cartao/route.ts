import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { FalhaNoAsaas, PedidoInvalido } from "@/lib/cobrancas";
import {
  AssinanteSemDocumento,
  PlataformaSemCobranca,
  pagarFaturaNoCartao,
} from "@/lib/cobranca-plataforma";

export const dynamic = "force-dynamic";

/**
 * "Pagar no cartao": troca o boleto/Pix da fatura por uma cobranca no cartao,
 * a vista ou (na anual) parcelada, com a tarifa repassada. So o
 * administrador, e so a fatura do proprio escritorio (o escritorio vem da
 * sessao, nunca do corpo).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId } = await exigirAdmin();
    const { id } = await params;
    const corpo = (await req.json().catch(() => ({}))) as { parcelas?: unknown };
    const r = await pagarFaturaNoCartao(escritorioId, id, Number(corpo.parcelas));
    return NextResponse.json(r);
  } catch (erro) {
    if (erro instanceof PedidoInvalido || erro instanceof AssinanteSemDocumento || erro instanceof PlataformaSemCobranca) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    if (erro instanceof FalhaNoAsaas) {
      return NextResponse.json(
        { erro: `O meio de pagamento nao respondeu: ${erro.message} Tente de novo em alguns minutos.` },
        { status: 502 },
      );
    }
    return tratarErro(erro);
  }
}
