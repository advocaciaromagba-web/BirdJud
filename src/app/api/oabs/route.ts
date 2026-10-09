import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirAdmin, exigirSessao } from "@/lib/sessao";
import { ehDuplicado, tratarErro } from "@/lib/respostas";
import { adicionarOab, novaOab } from "@/lib/oabs";

export const dynamic = "force-dynamic";



export async function GET() {
  try {
    const { escritorioId } = await exigirSessao("PUBLICACOES_DJEN");
    const oabs = await comEscritorio(escritorioId, (db) =>
      db.oabMonitorada.findMany({ orderBy: { criadoEm: "asc" } }),
    );
    return NextResponse.json({ oabs });
  } catch (erro) {
    return tratarErro(erro);
  }
}

/** Cadastrar OAB muda o que o escritorio paga por consumo: so administrador. */
export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirAdmin("PUBLICACOES_DJEN");
    const corpo = novaOab.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json(
        { erro: "Numero ou UF invalidos." },
        { status: 400 },
      );
    }

    const oab = await adicionarOab(escritorioId, corpo.data);
    return NextResponse.json({ oab }, { status: 201 });
  } catch (erro) {
    if (ehDuplicado(erro)) {
      return NextResponse.json(
        { erro: "Esta OAB ja esta sendo monitorada." },
        { status: 409 },
      );
    }
    return tratarErro(erro);
  }
}
