// Resolve o subdominio, gera o nonce da CSP e aplica os cabecalhos de
// seguranca.
//
// Roda no runtime edge, onde nao ha Prisma: por isso so le o host e coloca o
// slug em um cabecalho. Quem traduz slug -> escritorio e o servidor, com a view
// EscritorioPublico (src/lib/escritorio.ts).
import { NextResponse, type NextRequest } from "next/server";
import { CABECALHO_SLUG, slugDoHost } from "@/lib/subdominio";
import { CABECALHO_NONCE, CABECALHOS_DE_SEGURANCA, montarCSP } from "@/lib/csp";

export function middleware(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  // Atras do proxy do provedor, quem sabe se o cliente veio por HTTPS e o
  // x-forwarded-proto; a URL interna e sempre http.
  const seguro =
    req.headers.get("x-forwarded-proto") === "https" || req.nextUrl.protocol === "https:";
  const csp = montarCSP(nonce, process.env.NODE_ENV === "production", seguro);

  const cabecalhos = new Headers(req.headers);
  // Nunca confiar no que vem de fora: os dois sao sempre reescritos aqui.
  cabecalhos.delete(CABECALHO_SLUG);
  cabecalhos.set(CABECALHO_NONCE, nonce);
  // O Next le a CSP do cabecalho da REQUISICAO para saber onde por o nonce.
  cabecalhos.set("Content-Security-Policy", csp);

  const slug = slugDoHost(req.headers.get("host"));
  if (slug) cabecalhos.set(CABECALHO_SLUG, slug);

  const resposta = NextResponse.next({ request: { headers: cabecalhos } });
  resposta.headers.set("Content-Security-Policy", csp);
  for (const [nome, valor] of CABECALHOS_DE_SEGURANCA) {
    resposta.headers.set(nome, valor);
  }
  return resposta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
