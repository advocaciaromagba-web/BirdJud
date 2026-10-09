// O "state" do OAuth: o bilhete que vai a Microsoft ou ao Google e volta.
//
// Ele carrega QUAL escritorio, QUEM pediu e QUAL provedor, assinado com o
// segredo da plataforma. O retorno do provedor cai sempre no dominio da
// plataforma (o endereco registrado no aplicativo e um so), e e por este
// bilhete que o retorno sabe para qual subdominio devolver a pessoa.
//
// Sem assinatura, qualquer um montaria um bilhete apontando para outro
// escritorio e ligaria a propria conta ao escritorio alheio. Sem prazo, um
// bilhete vazado valeria para sempre. Sem o nonce (que fica num cookie do
// navegador de quem clicou), alguem poderia fazer o administrador de outro
// escritorio completar um login iniciado por ele.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const PROVEDORES = ["MICROSOFT", "GOOGLE"] as const;
export type Provedor = (typeof PROVEDORES)[number];

export function ehProvedor(valor: string): valor is Provedor {
  return (PROVEDORES as readonly string[]).includes(valor);
}

/** Quanto tempo a pessoa tem para entrar na conta e autorizar. */
export const VALIDADE_MS = 15 * 60 * 1000;

export type Estado = {
  /** escritorio */
  e: string;
  /** usuario que clicou */
  u: string;
  /** slug do escritorio, para voltar ao subdominio certo */
  s: string;
  p: Provedor;
  /** nonce, igual ao do cookie */
  n: string;
  /** expira em (ms desde 1970) */
  x: number;
};

function segredo(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET nao definida.");
  return s;
}

function assinatura(corpo: string): string {
  return createHmac("sha256", `nuvem:${segredo()}`).update(corpo).digest("base64url");
}

export function novoNonce(): string {
  return randomBytes(18).toString("base64url");
}

export function assinarEstado(
  dados: Omit<Estado, "x" | "n"> & { n?: string },
  agora = Date.now(),
): { estado: string; nonce: string } {
  const nonce = dados.n ?? novoNonce();
  const corpo = Buffer.from(
    JSON.stringify({ ...dados, n: nonce, x: agora + VALIDADE_MS }),
  ).toString("base64url");
  return { estado: `${corpo}.${assinatura(corpo)}`, nonce };
}

/** Devolve o estado, ou null quando a assinatura nao confere ou venceu. */
export function lerEstado(texto: string | null | undefined, agora = Date.now()): Estado | null {
  if (!texto) return null;
  const [corpo, assinado] = texto.split(".");
  if (!corpo || !assinado) return null;

  const esperado = Buffer.from(assinatura(corpo));
  const recebido = Buffer.from(assinado);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) {
    return null;
  }

  let dados: Estado;
  try {
    dados = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!dados || typeof dados.x !== "number" || dados.x < agora) return null;
  if (!ehProvedor(dados.p) || !dados.e || !dados.u || !dados.n) return null;
  // O slug vira subdominio no redirecionamento: so letras, numeros e hifen.
  if (!/^[a-z0-9-]{1,63}$/.test(dados.s ?? "")) return null;
  return dados;
}

/** O nonce do cookie confere com o do estado? Comparacao em tempo constante. */
export function nonceConfere(doCookie: string | undefined, doEstado: string): boolean {
  if (!doCookie) return false;
  const a = Buffer.from(doCookie);
  const b = Buffer.from(doEstado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const COOKIE_NONCE = "birdjud_nuvem";
