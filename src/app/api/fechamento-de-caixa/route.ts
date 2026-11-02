import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirAdministracao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { fecharMes } from "@/lib/fechamento-de-caixa";
import { respostaDaCobranca } from "@/lib/respostas-de-cobranca";

export const dynamic = "force-dynamic";

const pedido = z.object({ competencia: z.string().regex(/^\d{4}-\d{2}$/) });

/** Fecha o mes ou refaz a foto. Fica registrado quem refez, quando e quantas vezes. */
export async function POST(req: Request) {
  try {
    const { escritorioId, nomeUsuario } = await exigirAdministracao("FINANCEIRO");
    const corpo = pedido.safeParse(await req.json());
    if (!corpo.success) return NextResponse.json({ erro: "Mês inválido." }, { status: 400 });
    const f = await fecharMes(escritorioId, corpo.data.competencia, nomeUsuario);
    return NextResponse.json({ ok: true, refeito: f.refeito });
  } catch (erro) {
    return respostaDaCobranca(erro) ?? tratarErro(erro);
  }
}
