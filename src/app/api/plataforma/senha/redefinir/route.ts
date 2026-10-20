import { NextResponse } from "next/server";
import { z } from "zod";
import { headers } from "next/headers";
import { registrarTentativa } from "@/lib/limite";
import { ipDaRequisicao } from "@/lib/aceite";
import { CABECALHO_SLUG } from "@/lib/subdominio";
import { redefinirSenhaDoOperador, SENHA_MINIMA_DO_OPERADOR, TokenInvalido } from "@/lib/redefinicao-do-operador";

export const dynamic = "force-dynamic";

const POR_ORIGEM = 10;
const JANELA = 60 * 60;

const pedido = z.object({
  token: z.string().min(20).max(200),
  novaSenha: z
    .string()
    .min(SENHA_MINIMA_DO_OPERADOR, `A senha do console precisa ter ao menos ${SENHA_MINIMA_DO_OPERADOR} caracteres.`)
    .max(200),
});

/** Troca a senha do operador pelo link do e-mail. */
export async function POST(req: Request) {
  try {
    if ((await headers()).get(CABECALHO_SLUG)) {
      return NextResponse.json({ erro: "O console fica no endereço da plataforma." }, { status: 400 });
    }
    const ip = ipDaRequisicao(req) ?? "sem-ip";
    const limite = await registrarTentativa(`operador-redefinir:${ip}`, POR_ORIGEM, JANELA);
    if (!limite.permitido) {
      return NextResponse.json(
        { erro: "Muitas tentativas. Tente de novo mais tarde." },
        { status: 429, headers: { "Retry-After": String(limite.esperarSegundos) } },
      );
    }
    const corpo = pedido.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      return NextResponse.json({ erro: corpo.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
    }
    await redefinirSenhaDoOperador(corpo.data.token, corpo.data.novaSenha);
    return NextResponse.json({ ok: true, detalhe: "Senha trocada. Entre no console com a senha nova." });
  } catch (erro) {
    if (erro instanceof TokenInvalido) {
      return NextResponse.json({ erro: "Este link não vale mais. Peça outro na entrada do console." }, { status: 400 });
    }
    console.error(erro);
    return NextResponse.json({ erro: "Erro interno." }, { status: 500 });
  }
}
