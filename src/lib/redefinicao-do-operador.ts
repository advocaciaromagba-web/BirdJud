// "Esqueci a senha" do console da plataforma (17/10/2026).
//
// Mesmas regras do escritorio (redefinicao.ts), mais apertadas, porque esta
// e a conta que enxerga todos os escritorios:
//
// - o link vale UMA vez e por 30 minutos (no escritorio, uma hora);
// - o banco guarda o hash do token, nunca o token;
// - pedir de novo derruba o link anterior;
// - trocar a senha derruba as sessoes de operador abertas e zera o limite de
//   tentativas de entrada daquela conta (quem esqueceu costuma ter errado);
// - a resposta ao pedido e a mesma para conta que existe e que nao existe;
// - senha nova de pelo menos 12 caracteres.
import { gerarHash } from "./senhas";
import { prismaPlataforma } from "./prisma";
import { gerarToken, hashConfere, hashDoToken, TokenInvalido } from "./redefinicao";

export { TokenInvalido };

export const VALIDADE_DO_LINK_DO_OPERADOR_MINUTOS = 30;
export const SENHA_MINIMA_DO_OPERADOR = 12;

/** Cria o pedido de um operador ativo; null se o e-mail nao e de operador ativo. */
export async function pedirRedefinicaoDoOperador(
  email: string,
  pedidoDe: string | null,
  agora = new Date(),
): Promise<{ token: string; nome: string; email: string } | null> {
  const operador = await prismaPlataforma().operadorPlataforma.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, nome: true, email: true, ativo: true },
  });
  if (!operador?.ativo) return null;

  const token = gerarToken();
  await prismaPlataforma().$transaction([
    prismaPlataforma().redefinicaoDoOperador.updateMany({
      where: { operadorId: operador.id, usadoEm: null },
      data: { usadoEm: agora },
    }),
    prismaPlataforma().redefinicaoDoOperador.create({
      data: {
        operadorId: operador.id,
        tokenHash: hashDoToken(token),
        expiraEm: new Date(agora.getTime() + VALIDADE_DO_LINK_DO_OPERADOR_MINUTOS * 60_000),
        pedidoDe,
      },
    }),
  ]);
  return { token, nome: operador.nome, email: operador.email };
}

/** Troca a senha pelo token. Uso unico; derruba as sessoes antigas. */
export async function redefinirSenhaDoOperador(
  token: string,
  novaSenha: string,
  agora = new Date(),
): Promise<void> {
  if (novaSenha.length < SENHA_MINIMA_DO_OPERADOR) {
    throw new Error(`A senha do console precisa ter ao menos ${SENHA_MINIMA_DO_OPERADOR} caracteres.`);
  }
  const hash = hashDoToken(token);
  const senhaHash = await gerarHash(novaSenha);

  const email = await prismaPlataforma().$transaction(async (db) => {
    const pedido = await db.redefinicaoDoOperador.findUnique({
      where: { tokenHash: hash },
      include: { operador: { select: { id: true, email: true, ativo: true } } },
    });
    if (
      !pedido ||
      !hashConfere(pedido.tokenHash, hash) ||
      pedido.usadoEm ||
      pedido.expiraEm <= agora ||
      !pedido.operador.ativo
    ) {
      throw new TokenInvalido();
    }
    // Marca como usado SO se ainda nao foi: dois envios simultaneos do mesmo
    // link nao trocam a senha duas vezes.
    const marcado = await db.redefinicaoDoOperador.updateMany({
      where: { id: pedido.id, usadoEm: null },
      data: { usadoEm: agora },
    });
    if (marcado.count !== 1) throw new TokenInvalido();
    await db.operadorPlataforma.update({
      where: { id: pedido.operador.id },
      data: { senhaHash, sessoesValidasApos: agora },
    });
    return pedido.operador.email;
  });

  // Quem esqueceu a senha costuma ter errado varias vezes antes.
  await prismaPlataforma().limiteDeTaxa.deleteMany({ where: { chave: `operador:${email}` } });
}

export function mensagemDeRedefinicaoDoOperador(dados: { nome: string; link: string }): {
  assunto: string;
  texto: string;
} {
  return {
    assunto: "BirdJud — redefinir a senha do console da plataforma",
    texto: [
      `${dados.nome},`,
      "",
      "Recebemos um pedido para redefinir a senha do console da plataforma BirdJud.",
      "",
      `Escolher a senha nova: ${dados.link}`,
      "",
      `O link vale por ${VALIDADE_DO_LINK_DO_OPERADOR_MINUTOS} minutos e uma unica vez. Trocar a senha encerra as sessoes abertas do console.`,
      "",
      "Se nao foi voce, ignore este e-mail: a senha atual continua valendo. Pedidos que voce nao fez podem indicar que alguem esta tentando entrar.",
      "",
      "BirdJud, by Blackbird",
    ].join("\n"),
  };
}
