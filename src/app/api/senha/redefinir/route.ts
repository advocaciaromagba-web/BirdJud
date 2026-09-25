import { NextResponse } from "next/server";
import { z } from "zod";
import { escritorioDoEndereco } from "@/lib/sessao";
import { registrarTentativa } from "@/lib/limite";
import { ipDaRequisicao } from "@/lib/aceite";
import { tratarErro } from "@/lib/respostas";
import { redefinirComToken, TokenInvalido } from "@/lib/redefinicao";

export const dynamic = "force-dynamic";

// Teto contra quem tenta adivinhar token. Sao 32 bytes aleatorios — adivinhar
// e impossivel na pratica —, mas tentativa em massa tambem e sinal de ataque
// e nao precisa ser aceita.
const POR_ORIGEM = 20;
const JANELA = 60 * 60;

const pedido = z.object({
  token: z.string().min(20).max(200),
  novaSenha: z
    .string()
    .min(10, "A senha precisa ter ao menos 10 caracteres.")
    .max(200),
});

export async function POST(req: Request) {
  try {
    const marca = await escritorioDoEndereco();
    if (!marca?.id) {
      return NextResponse.json(
        { erro: "Cada escritorio redefine a senha pelo proprio endereco." },
        { status: 400 },
      );
    }

    const ip = ipDaRequisicao(req) ?? "sem-ip";
    const limite = await registrarTentativa(
      `senha-redefinir:${ip}`,
      POR_ORIGEM,
      JANELA,
    );
    if (!limite.permitido) {
      return NextResponse.json(
        { erro: "Muitas tentativas. Tente de novo mais tarde." },
        {
          status: 429,
          headers: { "Retry-After": String(limite.esperarSegundos) },
        },
      );
    }

    const corpo = pedido.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json(
        { erro: corpo.error.issues[0]?.message ?? "Dados invalidos." },
        { status: 400 },
      );
    }

    await redefinirComToken(marca.id, corpo.data.token, corpo.data.novaSenha);

    return NextResponse.json({
      ok: true,
      detalhe: "Senha trocada. Entre com a senha nova.",
    });
  } catch (erro) {
    if (erro instanceof TokenInvalido) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
