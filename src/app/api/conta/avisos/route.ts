import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { paraE164BR } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const preferencias = z.object({
  recebeResumo: z.boolean(),
  recebeLembretes: z.boolean(),
  recebeWhatsapp: z.boolean().optional(),
  telefone: z.string().max(40).optional(),
});

/** Cada pessoa decide o que recebe. Ninguem decide pelos outros. */
export async function POST(req: Request) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao();
    const corpo = preferencias.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }

    const { telefone, ...resto } = corpo.data;

    // Telefone que o sistema nao consegue ler nao vira aviso silenciosamente
    // perdido: recusa aqui, com a pessoa olhando para o campo.
    if (telefone !== undefined && telefone.trim() && !paraE164BR(telefone)) {
      return NextResponse.json(
        { erro: "Telefone invalido. Use DDD e numero, como (71) 99999-8888." },
        { status: 400 }
      );
    }
    if (resto.recebeWhatsapp && !paraE164BR(telefone ?? "")) {
      return NextResponse.json(
        { erro: "Para receber no WhatsApp e preciso informar um telefone valido." },
        { status: 400 }
      );
    }

    await comEscritorio(escritorioId, (db) =>
      db.usuario.update({
        where: { id: usuarioId },
        data: {
          ...resto,
          ...(telefone === undefined ? {} : { telefone: telefone.trim() || null }),
        },
      })
    );
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return tratarErro(erro);
  }
}
