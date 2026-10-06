import { NextResponse } from "next/server";
import { avisoDaInfinitePay } from "@/lib/infinitepay";
import { tratarAviso } from "@/lib/infinitepay-do-escritorio";

export const dynamic = "force-dynamic";

/**
 * Aviso de pagamento da InfinitePay.
 *
 * ESTE AVISO NAO VEM ASSINADO. Qualquer um que soubesse os identificadores
 * poderia mandar um "pago" forjado. Entao o conteudo dele NAO decide nada: ele
 * so diz "va olhar agora". Quem decide e a resposta da propria InfinitePay,
 * conferida em tratarAviso.
 *
 * Nao ha token na URL de proposito: um segredo aqui nao seguraria nada que a
 * conferencia ja nao segure, e um segredo desnecessario e so mais uma coisa
 * para vazar.
 *
 * Responde 200 em quase tudo. O provedor reenvia o que falha, e uma cobranca
 * que nao e nossa — ou um aviso forjado — nao pode prender a fila deles.
 */
export async function POST(req: Request) {
  const corpo = avisoDaInfinitePay.safeParse(await req.json().catch(() => null));
  if (!corpo.success) {
    console.log("webhook infinitepay: aviso sem os campos esperados.");
    return NextResponse.json({ ok: true, ignorado: "formato" });
  }

  try {
    const r = await tratarAviso(corpo.data);
    console.log(
      `webhook infinitepay ${corpo.data.order_nsu}: ${r.tratado ? "" : "nao tratado — "}${r.motivo}`,
    );
    return NextResponse.json({ ok: true });
  } catch (erro) {
    // Falha nossa ou da conferencia: 500 para eles reenviarem. E o unico caso
    // em que repetir ajuda.
    console.error("webhook infinitepay: falha ao conferir.", erro);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
