import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/sessao";
import { exportarEscritorio } from "@/lib/exportacao";
import { tratarErro } from "@/lib/respostas";

// Depende da sessao, entao nunca e estatica.
export const dynamic = "force-dynamic";

/** Baixa tudo do escritorio em um JSON. So administrador. */
export async function GET() {
  try {
    const { escritorioId, marca } = await exigirAdmin();
    const dados = await exportarEscritorio(escritorioId);

    const nome = `birdjud-${marca.slug ?? escritorioId}-${dados.geradoEm.slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(dados, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nome}"`,
      },
    });
  } catch (erro) {
    return tratarErro(erro);
  }
}
