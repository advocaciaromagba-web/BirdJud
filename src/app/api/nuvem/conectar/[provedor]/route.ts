import { NextResponse } from "next/server";
import { exigirAdmin, SemSessao } from "@/lib/sessao";
import { SemPermissao } from "@/lib/papeis";
import { ModuloNaoContratado } from "@/lib/modulos";
import { COOKIE_NONCE, NUVENS, assinarEstado } from "@/lib/nuvem";
import {
  baseDoEscritorio,
  enderecoDeRetorno,
  provedorDoCaminho,
} from "@/lib/nuvem/enderecos";
import { nuvemConectada } from "@/lib/nuvem-do-escritorio";

export const dynamic = "force-dynamic";

/**
 * Ida: leva o administrador a Microsoft ou ao Google, com o bilhete assinado
 * (state) e o nonce num cookie deste subdominio.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ provedor: string }> },
) {
  const provedor = provedorDoCaminho((await params).provedor);
  if (!provedor) return NextResponse.json({ erro: "Nuvem desconhecida." }, { status: 404 });

  let contexto;
  try {
    contexto = await exigirAdmin("NUVEM");
  } catch (erro) {
    if (erro instanceof SemSessao) return NextResponse.json({ erro: "Entre no sistema primeiro." }, { status: 401 });
    if (erro instanceof SemPermissao || erro instanceof ModuloNaoContratado) {
      return NextResponse.json({ erro: "So o administrador, com o modulo Arquivos contratado." }, { status: 403 });
    }
    throw erro;
  }

  const slug = contexto.marca.slug;
  if (!slug) return NextResponse.json({ erro: "Abra pelo endereco do escritorio." }, { status: 400 });
  const voltar = (motivo: string) =>
    NextResponse.redirect(
      `${baseDoEscritorio(slug)}/integracoes?nuvem=erro&motivo=${encodeURIComponent(motivo)}`,
    );

  const nuvem = NUVENS[provedor];
  if (!nuvem.configurada()) {
    return voltar(`A conexao com o ${nuvem.rotulo} ainda nao foi liberada pela plataforma.`);
  }
  const ligada = await nuvemConectada(contexto.escritorioId);
  if (ligada && ligada.provedor !== provedor) {
    return voltar(`Desconecte o ${NUVENS[ligada.provedor].rotulo} antes: os documentos ficam em uma nuvem so.`);
  }

  const { estado, nonce } = assinarEstado({
    e: contexto.escritorioId,
    u: contexto.usuarioId,
    s: slug,
    p: provedor,
  });

  const resposta = NextResponse.redirect(nuvem.urlDeAutorizacao(estado, enderecoDeRetorno(provedor)));
  resposta.cookies.set(COOKIE_NONCE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: baseDoEscritorio(slug).startsWith("https:"),
    path: "/api/nuvem",
    maxAge: 15 * 60,
  });
  return resposta;
}
