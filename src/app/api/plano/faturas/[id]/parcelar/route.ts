import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { FalhaNoAsaas, PedidoInvalido } from "@/lib/cobrancas";
import {
  AssinanteSemDocumento,
  PlataformaSemCobranca,
  parcelarFaturaNoCartao,
} from "@/lib/cobranca-plataforma";

export const dynamic = "force-dynamic";

/**
 * "Parcelar no cartao": troca a cobranca a vista da fatura anual por um
 * parcelamento no cartao. So o administrador, e so a fatura do proprio
 * escritorio (o id vem da sessao, nunca do corpo).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId } = await exigirAdmin();
    const { id } = await params;
    const r = await parcelarFaturaNoCartao(escritorioId, id);
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
