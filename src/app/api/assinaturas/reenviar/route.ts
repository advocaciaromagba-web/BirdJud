import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { respostaDoDominio } from "@/lib/modelos-respostas";
import { reenviarParaAssinatura } from "@/lib/reenvio-de-assinatura";

export const dynamic = "force-dynamic";

const pedido = z.object({
  ids: z.array(z.string().min(1)).min(1, "Escolha ao menos um documento.").max(50),
  canais: z.array(z.enum(["EMAIL", "WHATSAPP"])).min(1, "Escolha ao menos um canal: e-mail ou WhatsApp."),
  /** So este signatario: o pedido veio da linha dele na tela. */
  email: z.string().max(200).optional().nullable(),
  recado: z.string().max(1000).optional().nullable(),
});

/** Reenvia os links de quem ainda nao assinou, uma mensagem por pessoa. */
export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirSessao("ASSINATURA");
    const corpo = pedido.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: corpo.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
    }
    return NextResponse.json(await reenviarParaAssinatura(escritorioId, corpo.data));
  } catch (erro) {
    return respostaDoDominio(erro) ?? tratarErro(erro);
  }
}
