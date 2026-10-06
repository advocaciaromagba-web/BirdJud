import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { importarExtrato } from "@/lib/extrato";
import { dataValida } from "@/lib/prazos";

export const dynamic = "force-dynamic";

const pedido = z.object({
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Importa o extrato do periodo. Reimportar nao duplica: ver extrato.ts. */
export async function POST(req: Request) {
  try {
    // COBRANCAS porque e a conta do provedor que o extrato le; FINANCEIRO
    // decide se vira linha de livro-caixa, la dentro.
    const { escritorioId } = await exigirSessao("COBRANCAS");
    const corpo = pedido.safeParse(await req.json().catch(() => null));
    if (!corpo.success || !dataValida(corpo.data.de) || !dataValida(corpo.data.ate)) {
      return NextResponse.json({ erro: "Periodo invalido." }, { status: 400 });
    }
    if (corpo.data.de > corpo.data.ate) {
      return NextResponse.json(
        { erro: "A data inicial e depois da final." },
        { status: 400 },
      );
    }

    const r = await importarExtrato(escritorioId, corpo.data.de, corpo.data.ate);
    return NextResponse.json(r);
  } catch (erro) {
    return tratarErro(erro);
  }
}
