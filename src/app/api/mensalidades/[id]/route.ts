import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { paraCentavos } from "@/lib/dinheiro";
import {
  alterarValor,
  encerrarMensalidade,
  reativarMensalidade,
  sincronizarMensalidade,
  suspenderMensalidade,
} from "@/lib/mensalidades";
import { respostaDaCobranca } from "@/lib/respostas-de-cobranca";

export const dynamic = "force-dynamic";

const acao = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("SUSPENDER") }),
  z.object({ acao: z.literal("REATIVAR") }),
  z.object({ acao: z.literal("SINCRONIZAR") }),
  z.object({ acao: z.literal("ENCERRAR"), motivo: z.string().max(300).nullish() }),
  z.object({ acao: z.literal("VALOR"), valor: z.string().min(1) }),
]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId } = await exigirSessao("COBRANCAS");
    const { id } = await params;
    const corpo = acao.safeParse(await req.json());
    if (!corpo.success) return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });
    const a = corpo.data;
    if (a.acao === "SUSPENDER") await suspenderMensalidade(escritorioId, id);
    if (a.acao === "REATIVAR") await reativarMensalidade(escritorioId, id);
    if (a.acao === "ENCERRAR") await encerrarMensalidade(escritorioId, id, a.motivo ?? null);
    if (a.acao === "SINCRONIZAR") return NextResponse.json({ resultado: await sincronizarMensalidade(escritorioId, id) });
    if (a.acao === "VALOR") {
      const centavos = paraCentavos(a.valor);
      if (centavos === null || centavos <= 0) return NextResponse.json({ erro: "Valor inválido." }, { status: 400 });
      await alterarValor(escritorioId, id, centavos);
    }
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return respostaDaCobranca(erro) ?? tratarErro(erro);
  }
}
