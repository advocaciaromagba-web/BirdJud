import { NextResponse } from "next/server";
import { saudeDasRotinas } from "@/lib/saude-das-rotinas";

export const dynamic = "force-dynamic";

/**
 * As rotinas internas estao rodando? Para o vigia externo.
 *
 * Publica como /api/saude, e pelo mesmo motivo diz o minimo: se o trabalhador
 * esta de pe e QUANTAS rotinas essenciais estao falhando — nunca qual
 * escritorio, nem a mensagem de erro. O detalhe fica no log do trabalhador.
 */
export async function GET() {
  try {
    const s = await saudeDasRotinas();
    return NextResponse.json(s, { status: s.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
