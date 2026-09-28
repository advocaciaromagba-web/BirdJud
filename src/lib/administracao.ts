// A segunda senha: administracao do escritorio.
//
// POR QUE EXISTE: entrar no sistema e uma coisa; ver o faturamento do
// escritorio, apagar usuario, subir certificado e assinar nota e outra. Com
// uma senha so, um computador deixado aberto na recepcao da acesso a tudo, e
// quem descobre a senha de entrada de um advogado descobre o financeiro junto.
//
// A senha de administracao e do ESCRITORIO, nao da pessoa. Quem a tem destrava
// as areas sensiveis por um tempo curto — como o sudo faz —, e depois disso
// precisa digitar de novo. Nao substitui o papel ADMIN: as duas coisas sao
// exigidas, papel E senha.
//
// O destravamento e um cookie assinado, nao um registro no banco. Assim ele
// nao sobrevive a nada: nem a troca da senha (a marca muda), nem ao relogio
// (vence sozinho), nem a outra pessoa (vai o usuario dentro).
import { createHmac, timingSafeEqual, createHash } from "node:crypto";

/** Quanto tempo o destravamento vale. Curto de proposito. */
export const MINUTOS_DESTRAVADO = 30;

export const COOKIE = "birdjud_adm";

export class SemDestravar extends Error {
  readonly status = 403;
  constructor(
    motivo = "Esta area pede a senha de administracao do escritorio.",
  ) {
    super(motivo);
    this.name = "SemDestravar";
  }
}

export class SemSenhaDeAdministracao extends Error {
  readonly status = 409;
  constructor() {
    super(
      "Este escritorio ainda nao definiu a senha de administracao. Defina-a para continuar.",
    );
    this.name = "SemSenhaDeAdministracao";
  }
}

/**
 * Marca da senha vigente.
 *
 * Entra no cookie para que TROCAR a senha derrube os destravamentos abertos.
 * Sem isso, quem foi demitido com a tela aberta continuaria dentro depois de o
 * escritorio trocar a senha — que e exatamente o momento em que nao deveria.
 */
export function marcaDaSenha(senhaAdminHash: string): string {
  return createHash("sha256").update(senhaAdminHash).digest("hex").slice(0, 16);
}

function assinar(corpo: string, segredo: string): string {
  return createHmac("sha256", segredo).update(corpo).digest("base64url");
}

/** Emite o valor do cookie de destravamento. */
export function emitirDestravamento(
  dados: { escritorioId: string; usuarioId: string; marca: string },
  segredo: string,
  agora: Date = new Date(),
): string {
  const expiraEm = agora.getTime() + MINUTOS_DESTRAVADO * 60_000;
  const corpo = [
    dados.escritorioId,
    dados.usuarioId,
    dados.marca,
    String(expiraEm),
  ].join(".");
  return `${corpo}.${assinar(corpo, segredo)}`;
}

/**
 * Confere o cookie. Devolve o motivo da recusa, ou null quando vale.
 *
 * Funcao pura, e por isso testavel: e aqui que mora a decisao de deixar alguem
 * ver o faturamento do escritorio.
 */
export function conferirDestravamento(
  valor: string | undefined,
  esperado: { escritorioId: string; usuarioId: string; marca: string },
  segredo: string,
  agora: Date = new Date(),
): string | null {
  if (!valor) return "sem destravamento";

  const partes = valor.split(".");
  if (partes.length !== 5) return "destravamento malformado";
  const [escritorioId, usuarioId, marca, expiraEm, assinatura] = partes;

  const corpo = [escritorioId, usuarioId, marca, expiraEm].join(".");
  const esperada = Buffer.from(assinar(corpo, segredo));
  const recebida = Buffer.from(assinatura);
  // Assinatura primeiro, e em tempo constante: so depois de saber que o
  // conteudo e nosso vale a pena olhar o conteudo.
  if (esperada.length !== recebida.length) return "assinatura invalida";
  if (!timingSafeEqual(esperada, recebida)) return "assinatura invalida";

  if (escritorioId !== esperado.escritorioId) return "destravamento de outro escritorio";
  if (usuarioId !== esperado.usuarioId) return "destravamento de outra pessoa";
  if (marca !== esperado.marca) return "a senha de administracao mudou";

  const vence = Number(expiraEm);
  if (!Number.isFinite(vence)) return "destravamento malformado";
  if (vence <= agora.getTime()) return "destravamento vencido";

  return null;
}

/**
 * Segredo que assina o destravamento.
 *
 * Derivado do NEXTAUTH_SECRET, e nao igual a ele: se um dia o cookie vazar,
 * ele nao serve para forjar sessao.
 */
export function segredoDoDestravamento(): string {
  const base = process.env.NEXTAUTH_SECRET?.trim();
  if (!base) throw new Error("NEXTAUTH_SECRET ausente.");
  return createHash("sha256").update(`administracao:${base}`).digest("hex");
}

/** Exigencia minima da senha. Mais longa que a de entrada, de proposito. */
export const MINIMO_DE_CARACTERES = 12;

export function senhaAceitavel(senha: string): string | null {
  if (senha.length < MINIMO_DE_CARACTERES) {
    return `A senha de administracao precisa ter ao menos ${MINIMO_DE_CARACTERES} caracteres.`;
  }
  if (!/[a-zA-Z]/.test(senha) || !/[0-9]/.test(senha)) {
    return "A senha de administracao precisa misturar letras e numeros.";
  }
  return null;
}
