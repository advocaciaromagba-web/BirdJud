import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { prismaPlataforma } from "@/lib/prisma";
import { conferirComOAsaas, trazerCobrancasDoAsaas } from "@/lib/conferencia-do-asaas";
import { respostaDaCobranca } from "@/lib/respostas-de-cobranca";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Compara o Asaas com o sistema. Nao altera nada, em lugar nenhum. */
export async function GET() {
  try {
    const { escritorioId } = await exigirSessao("COBRANCAS", "COBRANCAS");
    const c = await conferirComOAsaas(escritorioId);
    // O aviso da tela acompanha a conferencia feita na mao tambem.
    await prismaPlataforma().escritorio.update({
      where: { id: escritorioId },
      data: { asaasForaDoSistema: c.deFora.filter((d) => !d.daMensalidade).length, asaasConferidoEm: c.conferidoEm },
    });
    return NextResponse.json(c);
  } catch (erro) {
    return respostaDaCobranca(erro) ?? tratarErro(erro);
  }
}

const trazer = z.object({
  ids: z.array(z.string().min(1).max(100)).min(1, "Marque ao menos uma cobrança.").max(200),
  lancarReceita: z.boolean(),
});

/** Traz as cobrancas marcadas. Nada entra sem alguem marcar. */
export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirSessao("COBRANCAS", "COBRANCAS_EMITIR");
    const corpo = trazer.safeParse(await req.json());
    if (!corpo.success) return NextResponse.json({ erro: corpo.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
    return NextResponse.json(await trazerCobrancasDoAsaas(escritorioId, corpo.data.ids, { lancarReceita: corpo.data.lancarReceita }));
  } catch (erro) {
    return respostaDaCobranca(erro) ?? tratarErro(erro);
  }
}
