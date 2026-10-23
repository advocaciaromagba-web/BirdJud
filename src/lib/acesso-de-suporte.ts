// Entrar no escritorio como suporte.
//
// O operador pede no console, com o motivo; o registro de acesso de suporte
// (exigido pelos Termos de Uso, item 5) nasce ANTES da entrada, com operador,
// escritorio, motivo e momento. O console recebe um link de uso unico que
// vale 2 minutos; o link abre uma sessao no subdominio do escritorio que vale
// 1 hora, como o administrador mais antigo, com uma faixa visivel em toda
// tela e botao para encerrar. Encerrado (ou vencido), a sessao cai na proxima
// tela.
//
// O que a sessao de suporte NAO faz: destravar a area de administracao (o
// financeiro do escritorio pede a senha do proprio administrador). Isso e de
// proposito: o dinheiro do escritorio continua fechado para nos.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { prismaPlataforma } from "./prisma";
import { dominioDaPlataforma } from "./dominio";

export const VALIDADE_DO_LINK_MS = 2 * 60_000;
export const DURACAO_DA_SESSAO_MS = 60 * 60_000;

export class AcessoDeSuporteRecusado extends Error {
  readonly status = 400;
  constructor(motivo: string) {
    super(motivo);
    this.name = "AcessoDeSuporteRecusado";
  }
}

/** Segredo proprio, derivado da NEXTAUTH_SECRET: nao e a chave da sessao. */
function segredo(): Buffer {
  const base = process.env.NEXTAUTH_SECRET?.trim();
  if (!base) throw new Error("NEXTAUTH_SECRET ausente.");
  return createHmac("sha256", base).update("birdjud:acesso-de-suporte").digest();
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** Token = base64url(dados) + "." + base64url(hmac). */
export function assinarToken(dados: { acessoId: string; escritorioId: string; expiraEm: number }): string {
  const corpo = b64(JSON.stringify({ a: dados.acessoId, e: dados.escritorioId, x: dados.expiraEm, n: randomUUID() }));
  const assinatura = createHmac("sha256", segredo()).update(corpo).digest();
  return `${corpo}.${b64(assinatura)}`;
}

/** Confere assinatura e prazo. Null quando nao confere: sem dizer por que. */
export function lerToken(token: string, agora = Date.now()): { acessoId: string; escritorioId: string } | null {
  const [corpo, assinatura] = token.split(".");
  if (!corpo || !assinatura) return null;
  const esperada = createHmac("sha256", segredo()).update(corpo).digest();
  const recebida = Buffer.from(assinatura, "base64url");
  if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) return null;
  try {
    const d = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")) as { a?: string; e?: string; x?: number };
    if (!d.a || !d.e || typeof d.x !== "number" || d.x < agora) return null;
    return { acessoId: d.a, escritorioId: d.e };
  } catch {
    return null;
  }
}

/**
 * Abre o acesso: registra e devolve o link de uso unico. Entra como o
 * administrador ativo mais antigo; sem administrador, como a pessoa ativa
 * mais antiga.
 */
export async function abrirAcessoDeSuporte(
  operadorId: string,
  escritorioId: string,
  motivo: string,
  agora = new Date(),
): Promise<{ url: string; acessoId: string; comoQuem: string }> {
  if (motivo.trim().length < 10) throw new AcessoDeSuporteRecusado("Explique o motivo com pelo menos 10 caracteres: fica registrado.");
  const db = prismaPlataforma();
  const escritorio = await db.escritorio.findUnique({ where: { id: escritorioId }, select: { slug: true, status: true } });
  if (!escritorio) throw new AcessoDeSuporteRecusado("Escritório não encontrado.");
  if (escritorio.status === "ENCERRADO") throw new AcessoDeSuporteRecusado("Escritório encerrado: não há o que atender lá dentro.");
  const pessoa =
    (await db.usuario.findFirst({ where: { escritorioId, ativo: true, papel: "ADMIN" }, orderBy: { criadoEm: "asc" } })) ??
    (await db.usuario.findFirst({ where: { escritorioId, ativo: true }, orderBy: { criadoEm: "asc" } }));
  if (!pessoa) throw new AcessoDeSuporteRecusado("O escritório não tem ninguém ativo para o suporte entrar no lugar.");

  const acesso = await db.acessoSuporte.create({
    data: {
      operadorId,
      escritorioId,
      motivo: `Entrada no escritório: ${motivo.trim()}`,
      comoUsuarioId: pessoa.id,
      expiraEm: new Date(agora.getTime() + DURACAO_DA_SESSAO_MS),
    },
  });
  const token = assinarToken({ acessoId: acesso.id, escritorioId, expiraEm: agora.getTime() + VALIDADE_DO_LINK_MS });
  return {
    url: `https://${escritorio.slug}.${dominioDaPlataforma()}/suporte/entrar?t=${encodeURIComponent(token)}`,
    acessoId: acesso.id,
    comoQuem: pessoa.nome,
  };
}

/**
 * Usa o link: confere token, escritorio do endereco e uso unico. Devolve o
 * usuario e o prazo da sessao. O uso e marcado de forma atomica: dois cliques
 * no mesmo link nao abrem duas sessoes.
 */
export async function usarLinkDeSuporte(token: string, escritorioDoEndereco: string, agora = new Date()) {
  const lido = lerToken(token, agora.getTime());
  if (!lido || lido.escritorioId !== escritorioDoEndereco) return null;
  const db = prismaPlataforma();
  const marcado = await db.acessoSuporte.updateMany({
    where: {
      id: lido.acessoId,
      escritorioId: escritorioDoEndereco,
      linkUsadoEm: null,
      encerradoEm: null,
      expiraEm: { gt: agora },
    },
    data: { linkUsadoEm: agora },
  });
  if (marcado.count !== 1) return null;
  const acesso = await db.acessoSuporte.findUniqueOrThrow({
    where: { id: lido.acessoId },
    include: { operador: { select: { nome: true } } },
  });
  return {
    acessoId: acesso.id,
    usuarioId: acesso.comoUsuarioId!,
    expiraEm: acesso.expiraEm!,
    operador: acesso.operador.nome,
  };
}

/** A sessao de suporte ainda vale? Encerrada no console ou vencida, nao. */
export async function acessoDeSuporteValido(acessoId: string, agora = new Date()): Promise<boolean> {
  const a = await prismaPlataforma().acessoSuporte.findUnique({
    where: { id: acessoId },
    select: { encerradoEm: true, expiraEm: true, linkUsadoEm: true },
  });
  return Boolean(a && !a.encerradoEm && a.linkUsadoEm && a.expiraEm && a.expiraEm > agora);
}

export async function encerrarAcessoDeSuporte(acessoId: string, agora = new Date()): Promise<void> {
  await prismaPlataforma().acessoSuporte.updateMany({
    where: { id: acessoId, encerradoEm: null },
    data: { encerradoEm: agora },
  });
}
