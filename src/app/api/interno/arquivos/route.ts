import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  apagarDoDisco,
  apagarTudoDoDisco,
  existeNoDisco,
  fluxoDoDisco,
  gravarNoDisco,
  lerDoDisco,
} from "@/lib/armazenamento";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * O disco de arquivos, para o TRABALHADOR (ver armazenamento.ts).
 *
 * O volume do Railway fica preso a aplicacao; o trabalhador copia para a
 * nuvem e faz a purga pedindo aqui. Duas travas, e as duas tem de passar:
 *
 * 1. so pela REDE INTERNA: com RAILWAY_PRIVATE_DOMAIN definido, pedido que
 *    chegue por outro host (birdjud.com.br, o dominio publico) recebe 404 —
 *    para quem esta do lado de fora, este endereco nao existe;
 * 2. o segredo ARQUIVOS_SEGREDO, comparado em tempo constante.
 *
 * Sem ARQUIVOS_SEGREDO configurado, o endereco nao existe em lugar nenhum.
 */
function autorizado(req: Request): boolean {
  const segredo = process.env.ARQUIVOS_SEGREDO?.trim();
  if (!segredo) return false;
  const interno = process.env.RAILWAY_PRIVATE_DOMAIN?.trim();
  if (interno) {
    const host = (req.headers.get("host") ?? "").split(":")[0];
    if (host !== interno) return false;
  }
  const veio = Buffer.from(req.headers.get("x-segredo-arquivos") ?? "");
  const certo = Buffer.from(segredo);
  return veio.length === certo.length && timingSafeEqual(veio, certo);
}

const NAO_EXISTE = () => new NextResponse(null, { status: 404 });

function ids(req: Request): { e: string; a: string | null } | null {
  const q = new URL(req.url).searchParams;
  const e = q.get("e");
  if (!e) return null;
  return { e, a: q.get("a") };
}

/** Le um arquivo. */
export async function GET(req: Request) {
  if (!autorizado(req)) return NAO_EXISTE();
  const p = ids(req);
  if (!p?.a) return NextResponse.json({ erro: "Falta o arquivo." }, { status: 400 });
  try {
    // Aos poucos: a gravacao de entrevista pode ter centenas de MB.
    const aberto = await fluxoDoDisco(p.e, p.a);
    if (aberto) {
      return new NextResponse(aberto.fluxo, {
        headers: { "content-type": "application/octet-stream", "content-length": String(aberto.tamanho) },
      });
    }
    const conteudo = await lerDoDisco(p.e, p.a);
    return new NextResponse(new Uint8Array(conteudo), { headers: { "content-type": "application/octet-stream" } });
  } catch (erro) {
    return (erro as { code?: string }).code === "ENOENT" ? NAO_EXISTE() : NextResponse.json({ erro: "Falha ao ler." }, { status: 500 });
  }
}

/** Grava um arquivo. */
export async function PUT(req: Request) {
  if (!autorizado(req)) return NAO_EXISTE();
  const p = ids(req);
  if (!p?.a) return NextResponse.json({ erro: "Falta o arquivo." }, { status: 400 });
  const r = await gravarNoDisco(p.e, p.a, Buffer.from(await req.arrayBuffer()));
  return NextResponse.json(r);
}

/** Apaga um arquivo; sem `a`, a pasta inteira do escritorio (purga). */
export async function DELETE(req: Request) {
  if (!autorizado(req)) return NAO_EXISTE();
  const p = ids(req);
  if (!p) return NextResponse.json({ erro: "Falta o escritório." }, { status: 400 });
  if (p.a) await apagarDoDisco(p.e, p.a);
  else await apagarTudoDoDisco(p.e);
  return new NextResponse(null, { status: 204 });
}

/** Existe? Sem parametros: so a conferencia de que o trabalhador alcanca aqui. */
export async function HEAD(req: Request) {
  if (!autorizado(req)) return NAO_EXISTE();
  const p = ids(req);
  if (!p) return new NextResponse(null, { status: 204 });
  if (!p.a) return new NextResponse(null, { status: 400 });
  return new NextResponse(null, { status: (await existeNoDisco(p.e, p.a)) ? 200 : 404 });
}
