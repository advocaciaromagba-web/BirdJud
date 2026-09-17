import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { conferirCodigo } from "@/lib/dois-fatores";
import { tratarErro } from "@/lib/respostas";

const corpoEsperado = z.object({
  segredo: z.string().min(16),
  codigo: z.string().min(6).max(8),
});

/** Ativa o segundo fator, so depois de o usuario provar que cadastrou. */
export async function POST(req: Request) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao();
    const corpo = corpoEsperado.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }

    if (!(await conferirCodigo(corpo.data.codigo, corpo.data.segredo))) {
      return NextResponse.json({ erro: "Codigo invalido." }, { status: 400 });
    }

    await comEscritorio(escritorioId, (db) =>
      db.usuario.update({
        where: { id: usuarioId },
        data: { doisFatores: corpo.data.segredo },
      })
    );
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return tratarErro(erro);
  }
}
