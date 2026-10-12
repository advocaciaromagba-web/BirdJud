import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { LIMITE_DE_CARACTERES } from "@/lib/ia";
import { EntrevistaNaoEncontrada, anotar } from "@/lib/entrevista-do-escritorio";

export const dynamic = "force-dynamic";

const corpo = z.object({
  // O teto e o mesmo da chamada de IA: anotacao maior nao teria como ser
  // organizada depois, e descobrir isso so na hora de organizar seria pior.
  transcricao: z.string().max(LIMITE_DE_CARACTERES),
  anotacoes: z.string().max(LIMITE_DE_CARACTERES).nullish(),
  /** Como a transcricao foi feita: vai para o PDF. */
  origem: z.enum(["LOCAL", "NUVEM", "DIGITADA", "AUDIO_ENVIADO"]).nullish(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId } = await exigirSessao(undefined, "ENTREVISTAS");
    const { id } = await params;
    const { transcricao, anotacoes, origem } = corpo.parse(await req.json());
    return NextResponse.json({
      entrevista: await anotar(escritorioId, id, transcricao, { anotacoes, origem }),
    });
  } catch (erro) {
    if (erro instanceof EntrevistaNaoEncontrada) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
