// Recuperacao de senha.
//
// As decisoes que fazem este arquivo ser o que e:
//
// 1. o link vale uma vez so e por uma hora. Link de redefinicao e uma chave
//    do sistema andando por e-mail — quanto menos tempo existir, melhor;
// 2. o banco guarda o HASH do token, nunca o token. Quem ler a tabela nao
//    consegue entrar na conta de ninguem, do mesmo jeito que acontece com a
//    senha;
// 3. redefinir senha derruba as sessoes abertas e limpa o bloqueio por
//    tentativas. Se a senha vazou, a sessao aberta do invasor tem de cair
//    junto; e quem esqueceu a senha costuma ter errado varias vezes antes;
// 4. a tela nunca diz se o e-mail existe. A resposta e a mesma para conta
//    que existe e para conta que nao existe.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { comEscritorio, prismaPlataforma, semEscritorio } from "./prisma";
import { gerarHash } from "./senhas";

export const TIPOS = ["REDEFINICAO", "CONVITE"] as const;
export type TipoDePedido = (typeof TIPOS)[number];

/**
 * Quanto cada link dura.
 *
 * Redefinicao vale uma hora: quem pediu esta na frente da tela agora, e o
 * link e uma chave do sistema andando por e-mail. Convite vale dias, porque
 * quem recebe pode estar de ferias, de plantao ou sem ler e-mail no fim de
 * semana — e convite vencido antes de ser aberto so gera retrabalho para quem
 * administra.
 */
export const VALIDADE_MINUTOS = 60;
export const VALIDADE_DO_CONVITE_MINUTOS = 7 * 24 * 60;

export function validadeEmMinutos(tipo: TipoDePedido): number {
  return tipo === "CONVITE" ? VALIDADE_DO_CONVITE_MINUTOS : VALIDADE_MINUTOS;
}

export function gerarToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashDoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Comparacao de tempo constante, para o hash nao virar oraculo. */
export function hashConfere(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

export type PedidoCriado = { token: string; expiraEm: Date };

/**
 * Cria o pedido para um usuario, invalidando os anteriores.
 *
 * Pedir de novo derruba o link antigo: dois links validos ao mesmo tempo
 * dobram a janela de quem interceptar o e-mail, sem servir para nada.
 */
export async function criarPedido(
  escritorioId: string,
  usuarioId: string,
  pedidoDe: string | null,
  tipo: TipoDePedido = "REDEFINICAO",
  agora = new Date(),
): Promise<PedidoCriado> {
  const token = gerarToken();
  const expiraEm = new Date(
    agora.getTime() + validadeEmMinutos(tipo) * 60 * 1000,
  );

  await comEscritorio(escritorioId, async (db) => {
    await db.redefinicaoDeSenha.updateMany({
      where: { usuarioId, usadoEm: null },
      data: { usadoEm: agora },
    });
    await db.redefinicaoDeSenha.create({
      data: semEscritorio({
        usuarioId,
        tipo,
        tokenHash: hashDoToken(token),
        expiraEm,
        pedidoDe,
      }),
    });
  });

  return { token, expiraEm };
}

export class TokenInvalido extends Error {
  readonly status = 400;
  constructor() {
    super("Este link nao vale mais. Peca outro na tela de entrada.");
    this.name = "TokenInvalido";
  }
}

/**
 * Troca a senha a partir do token. Devolve o e-mail de quem trocou.
 *
 * Tudo em uma transacao: marcar o token como usado e gravar a senha nova
 * precisam acontecer juntos, senao um erro no meio deixaria o link valido com
 * a senha ja trocada.
 */
export async function redefinirComToken(
  escritorioId: string,
  token: string,
  novaSenha: string,
  agora = new Date(),
): Promise<string> {
  const hash = hashDoToken(token);
  const senhaHash = await gerarHash(novaSenha);

  return comEscritorio(escritorioId, async (db) => {
    const pedido = await db.redefinicaoDeSenha.findFirst({
      where: { tokenHash: hash },
    });

    // O findFirst ja filtrou pelo hash; a conferencia em tempo constante
    // existe para o caminho de erro nao depender de quanto do hash bateu.
    if (!pedido || !hashConfere(pedido.tokenHash, hash))
      throw new TokenInvalido();
    if (pedido.usadoEm !== null) throw new TokenInvalido();
    if (pedido.expiraEm.getTime() <= agora.getTime()) throw new TokenInvalido();

    const usuario = await db.usuario.findFirst({
      where: { id: pedido.usuarioId, ativo: true },
    });
    if (!usuario) throw new TokenInvalido();

    await db.redefinicaoDeSenha.update({
      where: { id: pedido.id },
      data: { usadoEm: agora },
    });

    await db.usuario.update({
      where: { id: usuario.id },
      data: {
        senhaHash,
        // Sessao aberta cai, e o bloqueio por tentativas some.
        sessoesValidasApos: agora,
        tentativasFalhas: 0,
        bloqueadoAte: null,
      },
    });

    return usuario.email;
  });
}

/** Apaga pedido vencido ou ja usado. Chamado pela limpeza periodica. */
export async function limparPedidosVencidos(
  escritorioId: string,
  agora = new Date(),
): Promise<number> {
  const { count } = await comEscritorio(escritorioId, (db) =>
    db.redefinicaoDeSenha.deleteMany({
      where: { OR: [{ expiraEm: { lt: agora } }, { usadoEm: { not: null } }] },
    }),
  );
  return count;
}

/**
 * Limpeza da plataforma inteira, para a rotina noturna.
 *
 * Passa pelo plano de controle de proposito: e faxina de infraestrutura, nao
 * operacao de escritorio, e percorrer um a um so para apagar linha vencida
 * seria uma transacao por escritorio sem ganho nenhum.
 */
export async function limparPedidosVencidosDeTodos(
  agora = new Date(),
): Promise<number> {
  const { count } = await prismaPlataforma().redefinicaoDeSenha.deleteMany({
    where: { OR: [{ expiraEm: { lt: agora } }, { usadoEm: { not: null } }] },
  });
  return count;
}

/** O texto do convite. Quem recebe pode nunca ter ouvido falar do sistema. */
export function mensagemDeConvite(opcoes: {
  nomeDoEscritorio: string;
  nomeDeQuemConvidou: string;
  link: string;
  validadeMinutos: number;
}): { assunto: string; texto: string } {
  const dias = Math.round(opcoes.validadeMinutos / (24 * 60));
  return {
    assunto: `Seu acesso ao sistema de ${opcoes.nomeDoEscritorio}`,
    texto: [
      `${opcoes.nomeDeQuemConvidou} criou um acesso para voce no sistema de ${opcoes.nomeDoEscritorio}.`,
      "",
      "Para escolher sua senha e entrar pela primeira vez, abra o endereco abaixo:",
      opcoes.link,
      "",
      `O link vale por ${dias} dia(s) e so pode ser usado uma vez. Depois disso, peca outro a quem administra o sistema do escritorio.`,
      "",
      "Se voce nao esperava este convite, ignore esta mensagem e avise o escritorio.",
      "",
      "BirdJud · by Blackbird",
    ].join("\n"),
  };
}

/** O texto do e-mail. Curto, sem HTML, e dizendo o que fazer se nao foi voce. */
export function mensagemDeRedefinicao(opcoes: {
  nomeDoEscritorio: string;
  link: string;
  validadeMinutos: number;
}): { assunto: string; texto: string } {
  return {
    assunto: `Redefinir a senha — ${opcoes.nomeDoEscritorio}`,
    texto: [
      `Alguem pediu para redefinir a senha de acesso ao sistema de ${opcoes.nomeDoEscritorio}.`,
      "",
      "Para escolher uma senha nova, abra o endereco abaixo:",
      opcoes.link,
      "",
      `O link vale por ${opcoes.validadeMinutos} minutos e so pode ser usado uma vez.`,
      "",
      "Se nao foi voce quem pediu, ignore esta mensagem: nada muda enquanto o link nao for usado. Sua senha atual continua valendo.",
      "",
      "BirdJud · by Blackbird",
    ].join("\n"),
  };
}
