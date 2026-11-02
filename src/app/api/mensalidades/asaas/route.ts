import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { assinaturasDeFora, trazerDoAsaas } from "@/lib/mensalidades";
import { respostaDaCobranca } from "@/lib/respostas-de-cobranca";

export const dynamic = "force-dynamic";

/** O que esta no painel do Asaas e ainda nao esta aqui. */
export async function GET() {
  try {
    const { escritorioId } = await exigirSessao("COBRANCAS", "COBRANCAS");
    return NextResponse.json({ assinaturas: await assinaturasDeFora(escritorioId) });
  } catch (erro) {
    return respostaDaCobranca(erro) ?? tratarErro(erro);
  }
}

const trazer = z.object({ idNoProvedor: z.string().min(1).max(100), clienteId: z.string().min(1) });

/** Liga aqui uma assinatura que ja existe no Asaas, sem criar nada la. */
export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirSessao("COBRANCAS", "COBRANCAS_EMITIR");
    const corpo = trazer.safeParse(await req.json());
    if (!corpo.success) return NextResponse.json({ erro: "Escolha a assinatura e o cliente." }, { status: 400 });
    const mensalidade = await trazerDoAsaas(escritorioId, corpo.data.idNoProvedor, corpo.data.clienteId);
    return NextResponse.json({ mensalidade }, { status: 201 });
  } catch (erro) {
    return respostaDaCobranca(erro) ?? tratarErro(erro);
  }
}
