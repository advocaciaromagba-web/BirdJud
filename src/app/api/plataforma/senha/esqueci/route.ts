import { NextResponse } from "next/server";
import { z } from "zod";
import { headers } from "next/headers";
import { registrarTentativa } from "@/lib/limite";
import { ipDaRequisicao } from "@/lib/aceite";
import { CABECALHO_SLUG } from "@/lib/subdominio";
import { dominioDaPlataforma } from "@/lib/dominio";
import { enviarPelaPlataforma, PlataformaSemRemetente, temRemetenteDaPlataforma } from "@/lib/email-plataforma";
import { mensagemDeRedefinicaoDoOperador, pedirRedefinicaoDoOperador } from "@/lib/redefinicao-do-operador";

export const dynamic = "force-dynamic";

// Mais apertado que no escritorio: e a conta que enxerga todos.
const POR_ORIGEM = 5;
const POR_CONTA = 3;
const JANELA = 60 * 60;

const pedido = z.object({ email: z.string().email().max(200) });

// A MESMA resposta exista ou nao a conta: dizer "nao e operador" entregaria
// quem tem acesso ao console.
const RESPOSTA = {
  ok: true,
  detalhe: "Se este e-mail for de um operador, o link para escolher a senha nova chega em instantes.",
};

/** "Esqueci a senha" do console: manda o link ao e-mail do operador. */
export async function POST(req: Request) {
  try {
    if ((await headers()).get(CABECALHO_SLUG)) {
      return NextResponse.json({ erro: "O console fica no endereço da plataforma." }, { status: 400 });
    }
    if (!temRemetenteDaPlataforma()) throw new PlataformaSemRemetente();

    const corpo = pedido.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return NextResponse.json({ erro: "Informe um e-mail válido." }, { status: 400 });
    const email = corpo.data.email.trim().toLowerCase();
    const ip = ipDaRequisicao(req) ?? "sem-ip";

    for (const [chave, teto] of [
      [`operador-esqueci:origem:${ip}`, POR_ORIGEM],
      [`operador-esqueci:conta:${email}`, POR_CONTA],
    ] as const) {
      const limite = await registrarTentativa(chave, teto, JANELA);
      if (!limite.permitido) {
        return NextResponse.json(
          { erro: "Muitos pedidos em pouco tempo. Tente de novo mais tarde." },
          { status: 429, headers: { "Retry-After": String(limite.esperarSegundos) } },
        );
      }
    }

    const criado = await pedirRedefinicaoDoOperador(email, ip);
    if (!criado) return NextResponse.json(RESPOSTA);

    const link = `https://${dominioDaPlataforma()}/plataforma/redefinir-senha?t=${criado.token}`;
    await enviarPelaPlataforma({ para: criado.email, ...mensagemDeRedefinicaoDoOperador({ nome: criado.nome, link }) });
    return NextResponse.json(RESPOSTA);
  } catch (erro) {
    if (erro instanceof PlataformaSemRemetente) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    console.error(erro);
    return NextResponse.json({ erro: "Erro interno." }, { status: 500 });
  }
}
