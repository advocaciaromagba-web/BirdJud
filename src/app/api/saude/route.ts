import { NextResponse } from "next/server";
import { prismaPlataforma } from "@/lib/prisma";

// Sempre dinamica: uma saude em cache nao serve para nada.
export const dynamic = "force-dynamic";

/**
 * Saude da aplicacao, para o provedor decidir se o deploy subiu.
 *
 * Responde sem sessao — quem chama e o balanceador, nao uma pessoa — e por
 * isso nao diz nada alem de "o banco respondeu". Versao, nome de host,
 * contagem de escritorios e mensagem de erro do banco ficam de fora: e um
 * endereco publico, e endereco publico que conta detalhe vira mapa para
 * quem estiver procurando.
 *
 * O ping vai ao banco de proposito: aplicacao que responde com o banco fora
 * do ar da deploy verde e tela de erro para o escritorio.
 */
export async function GET() {
  try {
    await prismaPlataforma().$queryRaw`SELECT 1`;
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
