// Resolve o subdominio e repassa o slug para a aplicacao.
//
// O middleware roda no runtime edge, onde nao ha Prisma: por isso ele so le o
// host e coloca o slug em um cabecalho. Quem traduz slug -> escritorio e o
// servidor, com a view EscritorioPublico (src/lib/escritorio.ts).
import { NextResponse, type NextRequest } from "next/server";
import { CABECALHO_SLUG, slugDoHost } from "@/lib/subdominio";

export function middleware(req: NextRequest) {
  const cabecalhos = new Headers(req.headers);
  // Nunca confiar no cabecalho vindo de fora: ele e sempre reescrito aqui.
  cabecalhos.delete(CABECALHO_SLUG);

  const slug = slugDoHost(req.headers.get("host"));
  if (slug) cabecalhos.set(CABECALHO_SLUG, slug);

  return NextResponse.next({ request: { headers: cabecalhos } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
