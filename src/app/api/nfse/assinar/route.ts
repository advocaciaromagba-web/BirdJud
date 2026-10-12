import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { NotaInvalida, assinarNotas, depoisDeEmitida } from "@/lib/nfse";

export const dynamic = "force-dynamic";
// Assinar varias notas e falar com a Sefin uma a uma leva tempo.
export const maxDuration = 120;

const pedido = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
  senha: z.string().min(1).max(200),
});

/**
 * Assinatura do titular do e-CNPJ. A senha chega aqui, abre o certificado
 * em memoria e NAO e guardada em lugar nenhum.
 */
export async function POST(req: Request) {
  try {
    const { escritorioId, usuarioId, papel } = await exigirSessao("NFSE", "NOTAS");
    const corpo = pedido.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return NextResponse.json({ erro: "Marque as notas e digite a senha." }, { status: 400 });

    const resultados = await assinarNotas(escritorioId, { usuarioId, papel }, corpo.data.ids, corpo.data.senha);
    const comEntrega = [];
    for (const r of resultados) {
      if (r.status !== "EMITIDA") {
        comEntrega.push(r);
        continue;
      }
      const entrega = await depoisDeEmitida(escritorioId, r.id).catch((e) => ({
        enviados: [] as string[],
        falhas: [`entrega: ${(e as Error).message}`],
        guardada: false,
      }));
      comEntrega.push({ ...r, entrega });
    }
    return NextResponse.json({ resultados: comEntrega });
  } catch (erro) {
    if (erro instanceof NotaInvalida) return NextResponse.json({ erro: erro.message }, { status: erro.status });
    return tratarErro(erro);
  }
}
