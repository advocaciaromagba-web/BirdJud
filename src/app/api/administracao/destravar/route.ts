import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirAdmin } from "@/lib/sessao";
import { conferirSenha } from "@/lib/senhas";
import { ipDaRequisicao } from "@/lib/aceite";
import { registrarTentativa } from "@/lib/limite";
import {
  COOKIE,
  MINUTOS_DESTRAVADO,
  SemSenhaDeAdministracao,
  emitirDestravamento,
  marcaDaSenha,
  segredoDoDestravamento,
} from "@/lib/administracao";
import { tratarErro } from "@/lib/respostas";

export const dynamic = "force-dynamic";

// Tetos por hora. Baixos: esta senha nao se digita o dia inteiro, e quem erra
// dez vezes nao e o dono do escritorio tentando lembrar.
const POR_PESSOA = 10;
const POR_ORIGEM = 20;
const JANELA = 60 * 60;

const pedido = z.object({ senha: z.string().max(200) });

export async function POST(req: Request) {
  try {
    const { escritorioId, usuarioId } = await exigirAdmin();
    const corpo = pedido.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Informe a senha." }, { status: 400 });
    }

    const ip = ipDaRequisicao(req) ?? "sem-ip";
    for (const [chave, teto] of [
      [`adm-destravar:pessoa:${usuarioId}`, POR_PESSOA],
      [`adm-destravar:origem:${ip}`, POR_ORIGEM],
    ] as const) {
      const limite = await registrarTentativa(chave, teto, JANELA);
      if (!limite.permitido) {
        return NextResponse.json(
          { erro: "Muitas tentativas. Tente de novo mais tarde." },
          {
            status: 429,
            headers: { "Retry-After": String(limite.esperarSegundos) },
          },
        );
      }
    }

    const escritorio = await comEscritorio(escritorioId, (db) =>
      db.escritorio.findFirst({
        where: { id: escritorioId },
        select: { senhaAdminHash: true },
      }),
    );
    if (!escritorio?.senhaAdminHash) throw new SemSenhaDeAdministracao();

    if (!(await conferirSenha(corpo.data.senha, escritorio.senhaAdminHash))) {
      // A mesma resposta para senha errada e para qualquer outra recusa de
      // senha: nada aqui ajuda quem esta tentando adivinhar.
      return NextResponse.json(
        { erro: "Senha de administracao incorreta." },
        { status: 403 },
      );
    }

    const valor = emitirDestravamento(
      {
        escritorioId,
        usuarioId,
        marca: marcaDaSenha(escritorio.senhaAdminHash),
      },
      segredoDoDestravamento(),
    );

    const resposta = NextResponse.json({
      ok: true,
      minutos: MINUTOS_DESTRAVADO,
    });
    resposta.cookies.set({
      name: COOKIE,
      value: valor,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MINUTOS_DESTRAVADO * 60,
    });
    return resposta;
  } catch (erro) {
    return tratarErro(erro);
  }
}

/** Trancar de novo, sem esperar o prazo. */
export async function DELETE() {
  try {
    await exigirAdmin();
    const resposta = NextResponse.json({ ok: true });
    resposta.cookies.set({ name: COOKIE, value: "", path: "/", maxAge: 0 });
    return resposta;
  } catch (erro) {
    return tratarErro(erro);
  }
}
