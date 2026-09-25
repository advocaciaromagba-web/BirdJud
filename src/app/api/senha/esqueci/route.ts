import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { escritorioDoEndereco } from "@/lib/sessao";
import { registrarTentativa } from "@/lib/limite";
import { ipDaRequisicao } from "@/lib/aceite";
import { tratarErro } from "@/lib/respostas";
import {
  criarPedido,
  mensagemDeRedefinicao,
  VALIDADE_MINUTOS,
} from "@/lib/redefinicao";
import {
  enviarPelaPlataforma,
  PlataformaSemRemetente,
  temRemetenteDaPlataforma,
} from "@/lib/email-plataforma";
import { dominioDaPlataforma } from "@/lib/dominio";

export const dynamic = "force-dynamic";

/**
 * Tetos por hora.
 *
 * Por origem, contra quem varre e-mails para descobrir quem tem conta. Por
 * conta, para que ninguem possa encher a caixa de outra pessoa pedindo
 * redefinicao em serie — o e-mail sai do nosso remetente, e quem paga o
 * preco de reputacao somos nos.
 */
const POR_ORIGEM = 10;
const POR_CONTA = 5;
const JANELA = 60 * 60;

const pedido = z.object({ email: z.string().email().max(200) });

// A MESMA resposta para conta que existe e para conta que nao existe. Dizer
// "este e-mail nao esta cadastrado" entrega a lista de usuarios do escritorio
// a qualquer um que tente.
const RESPOSTA = {
  ok: true,
  detalhe:
    "Se este e-mail estiver cadastrado neste escritorio, o link de redefinicao chega em instantes.",
};

export async function POST(req: Request) {
  try {
    // O escritorio vem do endereco, nunca do corpo: cada subdominio so
    // redefine senha de quem e dele.
    const marca = await escritorioDoEndereco();
    if (!marca?.id) {
      return NextResponse.json(
        { erro: "Cada escritorio redefine a senha pelo proprio endereco." },
        { status: 400 },
      );
    }

    // Sem remetente configurado, dizer que nao da — em vez de fingir que o
    // e-mail saiu e deixar a pessoa esperando por um link que nao existe.
    if (!temRemetenteDaPlataforma()) throw new PlataformaSemRemetente();

    const corpo = pedido.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json(
        { erro: "Informe um e-mail valido." },
        { status: 400 },
      );
    }
    const email = corpo.data.email.trim().toLowerCase();
    const ip = ipDaRequisicao(req) ?? "sem-ip";

    for (const [chave, teto] of [
      [`senha-esqueci:origem:${ip}`, POR_ORIGEM],
      [`senha-esqueci:conta:${marca.id}:${email}`, POR_CONTA],
    ] as const) {
      const limite = await registrarTentativa(chave, teto, JANELA);
      if (!limite.permitido) {
        return NextResponse.json(
          { erro: "Muitos pedidos em pouco tempo. Tente de novo mais tarde." },
          {
            status: 429,
            headers: { "Retry-After": String(limite.esperarSegundos) },
          },
        );
      }
    }

    const usuario = await comEscritorio(marca.id, (db) =>
      db.usuario.findFirst({
        where: { email, ativo: true },
        select: { id: true },
      }),
    );

    // Conta que nao existe (ou desativada) sai por aqui, com a mesma resposta.
    if (!usuario) return NextResponse.json(RESPOSTA);

    const { token } = await criarPedido(marca.id, usuario.id, ip);
    const dominio = dominioDaPlataforma();
    const link = `https://${marca.slug}.${dominio}/redefinir-senha?t=${token}`;

    const mensagem = mensagemDeRedefinicao({
      nomeDoEscritorio: marca.nome,
      link,
      validadeMinutos: VALIDADE_MINUTOS,
    });
    await enviarPelaPlataforma({ para: email, ...mensagem });

    return NextResponse.json(RESPOSTA);
  } catch (erro) {
    if (erro instanceof PlataformaSemRemetente) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
