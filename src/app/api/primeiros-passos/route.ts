import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirAdmin } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import {
  dispensarDoInicio,
  PassoNaoPulavel,
  pularPasso,
  retomarPasso,
  roteiroDoEscritorio,
} from "@/lib/primeiros-passos-do-escritorio";
import { CHAVES_DOS_PASSOS } from "@/lib/primeiros-passos";

export const dynamic = "force-dynamic";

const pedido = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("pular"), chave: z.enum(CHAVES_DOS_PASSOS as [string, ...string[]]) }),
  z.object({ acao: z.literal("retomar"), chave: z.enum(CHAVES_DOS_PASSOS as [string, ...string[]]) }),
  z.object({ acao: z.literal("dispensar") }),
  z.object({ acao: z.literal("mostrar") }),
]);

export async function GET() {
  try {
    const { escritorioId } = await exigirAdmin();
    return NextResponse.json(await roteiroDoEscritorio(escritorioId));
  } catch (erro) {
    return tratarErro(erro);
  }
}

/** Decisoes sobre o roteiro. So o administrador decide pelo escritorio. */
export async function POST(req: Request) {
  try {
    const { escritorioId, nomeUsuario } = await exigirAdmin();
    const corpo = pedido.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return NextResponse.json({ erro: "Pedido invalido." }, { status: 400 });

    const p = corpo.data;
    if (p.acao === "pular") await pularPasso(escritorioId, p.chave, nomeUsuario);
    if (p.acao === "retomar") await retomarPasso(escritorioId, p.chave);
    if (p.acao === "dispensar") await dispensarDoInicio(escritorioId, true);
    if (p.acao === "mostrar") await dispensarDoInicio(escritorioId, false);
    return NextResponse.json({ ok: true });
  } catch (erro) {
    if (erro instanceof PassoNaoPulavel) {
      return NextResponse.json({ erro: erro.message }, { status: 400 });
    }
    return tratarErro(erro);
  }
}
