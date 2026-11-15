import { NextResponse } from "next/server";
import { exigirSessao, recusarSuporte } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { gerarCodigosFaltantes } from "@/lib/codigos-do-escritorio";

export const dynamic = "force-dynamic";

/** Gera o codigo de quem ainda nao tem. Nao envia nada a ninguem. */
export async function POST() {
  try {
    const contexto = await exigirSessao(undefined, "CODIGOS");
    recusarSuporte(contexto, "O código de atendimento dos clientes");
    const r = await gerarCodigosFaltantes(contexto.escritorioId);
    return NextResponse.json({
      ok: r.falharam === 0,
      texto: `${r.criados} código(s) criado(s).${r.falharam ? ` ${r.falharam} não puderam ser criados; tente de novo.` : ""}`,
    });
  } catch (erro) {
    return tratarErro(erro);
  }
}
