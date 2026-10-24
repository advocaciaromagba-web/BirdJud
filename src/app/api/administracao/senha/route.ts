import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirAdmin, recusarSuporte } from "@/lib/sessao";
import { conferirSenha, gerarHash } from "@/lib/senhas";
import { senhaAceitavel } from "@/lib/administracao";
import { tratarErro } from "@/lib/respostas";

export const dynamic = "force-dynamic";

const pedido = z.object({
  // Obrigatoria quando ja existe uma senha: trocar exige saber a atual. Sem
  // isso, quem pegasse uma sessao de admin aberta trocaria a senha e tomaria
  // a area — que e justamente o que ela deveria impedir.
  atual: z.string().max(200).optional(),
  nova: z.string().max(200),
});

export async function POST(req: Request) {
  try {
    const contexto = await exigirAdmin();
    // Sem senha definida, quem chegasse aqui pela sessao de suporte criaria
    // uma e destravaria o financeiro do escritorio.
    recusarSuporte(contexto, "Definir a senha de administração");
    const { escritorioId } = contexto;
    const corpo = pedido.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
    }

    const recusa = senhaAceitavel(corpo.data.nova);
    if (recusa) return NextResponse.json({ erro: recusa }, { status: 400 });

    const escritorio = await comEscritorio(escritorioId, (db) =>
      db.escritorio.findFirst({
        where: { id: escritorioId },
        select: { senhaAdminHash: true },
      }),
    );

    if (escritorio?.senhaAdminHash) {
      const atual = corpo.data.atual ?? "";
      if (!(await conferirSenha(atual, escritorio.senhaAdminHash))) {
        return NextResponse.json(
          { erro: "A senha de administração atual não confere." },
          { status: 403 },
        );
      }
    }

    const hash = await gerarHash(corpo.data.nova);
    await comEscritorio(escritorioId, (db) =>
      db.escritorio.update({
        where: { id: escritorioId },
        data: { senhaAdminHash: hash, senhaAdminEm: new Date() },
      }),
    );

    // Trocar a senha derruba os destravamentos abertos, inclusive o de quem
    // trocou: a marca dentro do cookie deixa de bater. E de proposito — a hora
    // de trocar e quando alguem saiu, e nesse momento nada aberto deve valer.
    return NextResponse.json({
      ok: true,
      detalhe: escritorio?.senhaAdminHash
        ? "Senha de administração trocada. Digite-a de novo para continuar."
        : "Senha de administração definida.",
    });
  } catch (erro) {
    return tratarErro(erro);
  }
}
