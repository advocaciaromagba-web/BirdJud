import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirAdministracao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { paraCentavos } from "@/lib/dinheiro";
import { MetaInvalida, apagarMeta, definirMeta } from "@/lib/metas-do-escritorio";

export const dynamic = "force-dynamic";

const pedido = z.object({
  ano: z.number().int().min(2020).max(2100),
  // Em reais, como digitado. Vazio apaga a meta do ano.
  valor: z.string().max(20).nullish(),
});

export async function PUT(req: Request) {
  try {
    // Meta e numero do financeiro: passa pela senha de administracao, como o
    // resto do financeiro passa.
    const { escritorioId } = await exigirAdministracao("FINANCEIRO");
    const corpo = pedido.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      return NextResponse.json({ erro: "Pedido invalido." }, { status: 400 });
    }

    if (!corpo.data.valor?.trim()) {
      await apagarMeta(escritorioId, corpo.data.ano);
      return NextResponse.json({ ok: true, apagada: true });
    }

    const valorCentavos = paraCentavos(corpo.data.valor);
    if (valorCentavos === null) {
      return NextResponse.json({ erro: "Valor invalido." }, { status: 400 });
    }

    const r = await definirMeta(escritorioId, corpo.data.ano, valorCentavos);
    return NextResponse.json(r);
  } catch (erro) {
    if (erro instanceof MetaInvalida) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
