import { NextResponse } from "next/server";
import { saudeDoEspaco } from "@/lib/saude-do-espaco";

export const dynamic = "force-dynamic";

/**
 * O disco dos arquivos e o banco passaram de 70%? Para o vigia externo.
 *
 * Publica como /api/saude, e pelo mesmo motivo diz o minimo: tudo bem, ou
 * qual dos dois passou e em quanto. Abaixo do limiar, nem o percentual.
 */
export async function GET() {
  try {
    const s = await saudeDoEspaco();
    return NextResponse.json(s.ok ? { ok: true } : s, {
      status: s.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
