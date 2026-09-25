import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { conferirSenha } from "@/lib/senhas";
import { conferirCodigo } from "@/lib/dois-fatores";
import { tratarErro } from "@/lib/respostas";

const corpoEsperado = z.object({
  senha: z.string().min(1),
  codigo: z.string().min(6).max(8),
});

/** Desligar o segundo fator exige senha E um codigo valido. */
export async function POST(req: Request) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao();
    const corpo = corpoEsperado.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }

    const resultado = await comEscritorio(escritorioId, async (db) => {
      const usuario = await db.usuario.findFirst({ where: { id: usuarioId } });
      if (!usuario?.doisFatores) return "nao-ativo" as const;
      if (!(await conferirSenha(corpo.data.senha, usuario.senhaHash)))
        return "recusado" as const;
      if (!(await conferirCodigo(corpo.data.codigo, usuario.doisFatores)))
        return "recusado" as const;

      await db.usuario.update({
        where: { id: usuario.id },
        data: { doisFatores: null },
      });
      return "ok" as const;
    });

    if (resultado === "nao-ativo") {
      return NextResponse.json(
        { erro: "O segundo fator nao esta ativo." },
        { status: 400 },
      );
    }
    if (resultado === "recusado") {
      return NextResponse.json(
        { erro: "Senha ou codigo invalido." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return tratarErro(erro);
  }
}
