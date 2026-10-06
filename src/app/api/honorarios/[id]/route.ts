import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { encerrarContrato, gerarProximaParcela } from "@/lib/honorarios-do-escritorio";
import { erroDeDominio } from "@/lib/honorarios-respostas";

export const dynamic = "force-dynamic";

const acao = z.discriminatedUnion("acao", [
  // Antecipar e decisao de quem olha a tela: "sei que falta, quero ja".
  z.object({ acao: z.literal("EMITIR"), antecipar: z.boolean().optional() }),
  z.object({ acao: z.literal("ENCERRAR") }),
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId } = await exigirSessao("COBRANCAS");
    const { id } = await params;
    const corpo = acao.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      return NextResponse.json({ erro: "Acao invalida." }, { status: 400 });
    }

    if (corpo.data.acao === "ENCERRAR") {
      await encerrarContrato(escritorioId, id);
      return NextResponse.json({ ok: true });
    }

    const r = await gerarProximaParcela(escritorioId, id, {
      forcar: corpo.data.antecipar === true,
    });
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 });
    return NextResponse.json({ cobrancaId: r.cobrancaId, parcela: r.parcela });
  } catch (erro) {
    return erroDeDominio(erro) ?? tratarErro(erro);
  }
}
