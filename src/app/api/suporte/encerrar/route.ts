import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { opcoesAuth } from "@/lib/auth";
import { encerrarAcessoDeSuporte } from "@/lib/acesso-de-suporte";

export const dynamic = "force-dynamic";

/** Encerra a sessao de suporte pela faixa: grava o fim no registro do acesso. */
export async function POST() {
  const sessao = await getServerSession(opcoesAuth);
  if (sessao?.suporte) await encerrarAcessoDeSuporte(sessao.suporte.acessoId);
  return NextResponse.json({ ok: true });
}
