import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio, semEscritorio } from "@/lib/prisma";
import { exigirAdmin, exigirSessao } from "@/lib/sessao";
import { gerarHash } from "@/lib/senhas";
import { PAPEIS } from "@/lib/papeis";
import { ehDuplicado, tratarErro } from "@/lib/respostas";

const novoUsuario = z.object({
  nome: z.string().min(2).max(120),
  email: z.string().email(),
  senha: z.string().min(10, "A senha precisa ter ao menos 10 caracteres."),
  papel: z.enum(PAPEIS),
  oab: z.string().max(20).optional(),
});

export async function GET() {
  try {
    const { escritorioId } = await exigirSessao();
    const usuarios = await comEscritorio(escritorioId, (db) =>
      db.usuario.findMany({
        orderBy: { nome: "asc" },
        // Nunca devolver hash de senha nem segredo de 2FA.
        select: {
          id: true,
          nome: true,
          email: true,
          papel: true,
          advogado: true,
          ativo: true,
          oab: true,
          ultimoAcesso: true,
          doisFatores: false,
        },
      })
    );
    return NextResponse.json({ usuarios });
  } catch (erro) {
    return tratarErro(erro);
  }
}

export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirAdmin();
    const corpo = novoUsuario.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json(
        { erro: corpo.error.issues[0]?.message ?? "Dados invalidos." },
        { status: 400 }
      );
    }

    const { senha, email, papel, ...resto } = corpo.data;
    const senhaHash = await gerarHash(senha);
    const usuario = await comEscritorio(escritorioId, (db) =>
      db.usuario.create({
        data: semEscritorio({
          ...resto,
          email: email.toLowerCase(),
          papel,
          // Quem conta para a faixa de advogados do escritorio.
          advogado: papel === "ADVOGADO" || papel === "ADMIN",
          senhaHash,
        }),
        select: { id: true, nome: true, email: true, papel: true },
      })
    );
    return NextResponse.json({ usuario }, { status: 201 });
  } catch (erro) {
    if (ehDuplicado(erro)) {
      return NextResponse.json(
        { erro: "Ja existe um usuario com este e-mail neste escritorio." },
        { status: 409 }
      );
    }
    return tratarErro(erro);
  }
}
