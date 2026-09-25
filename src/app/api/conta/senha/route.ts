import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { conferirSenha, gerarHash } from "@/lib/senhas";
import { tratarErro } from "@/lib/respostas";

const corpoEsperado = z.object({
  senhaAtual: z.string().min(1),
  novaSenha: z
    .string()
    .min(10, "A nova senha precisa ter ao menos 10 caracteres."),
});

export async function POST(req: Request) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao();
    const corpo = corpoEsperado.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json(
        { erro: corpo.error.issues[0]?.message ?? "Dados invalidos." },
        { status: 400 },
      );
    }

    const resultado = await comEscritorio(escritorioId, async (db) => {
      const usuario = await db.usuario.findFirst({ where: { id: usuarioId } });
      if (!usuario) return "nao-encontrado" as const;
      if (!(await conferirSenha(corpo.data.senhaAtual, usuario.senhaHash))) {
        return "senha-atual-errada" as const;
      }
      await db.usuario.update({
        where: { id: usuario.id },
        data: {
          senhaHash: await gerarHash(corpo.data.novaSenha),
          // Derruba as sessoes abertas, inclusive a de quem trocou a senha.
          sessoesValidasApos: new Date(),
        },
      });
      return "ok" as const;
    });

    if (resultado !== "ok") {
      return NextResponse.json(
        { erro: "Senha atual incorreta." },
        { status: 400 },
      );
    }
    // O proprio autor da troca precisa entrar de novo: e o preco de a
    // revogacao valer para todas as sessoes, inclusive a de quem roubou uma.
    return NextResponse.json({ ok: true, reentrar: true });
  } catch (erro) {
    return tratarErro(erro);
  }
}
