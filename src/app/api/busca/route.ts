import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { buscar, MINIMO_DE_LETRAS } from "@/lib/busca";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { escritorioId } = await exigirSessao();
    const termo = new URL(req.url).searchParams.get("q") ?? "";

    if (termo.trim().length < MINIMO_DE_LETRAS) {
      return NextResponse.json({ achados: [], minimo: MINIMO_DE_LETRAS });
    }
    return NextResponse.json({ achados: await buscar(escritorioId, termo) });
  } catch (erro) {
    return tratarErro(erro);
  }
}
