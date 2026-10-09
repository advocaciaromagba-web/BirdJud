import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { AVISOS_MANUAIS, avisarAgora } from "@/lib/avisos";
import { CompromissoNaoEncontrado } from "@/lib/agenda-do-escritorio";
import { enfileirar } from "@/lib/fila";

export const dynamic = "force-dynamic";

const pedido = z.object({ qual: z.enum(AVISOS_MANUAIS) });

/**
 * "Avisar" da agenda: manda agora, para todos os participantes, a
 * confirmacao ou um dos lembretes. O envio e feito pelo trabalhador em
 * segundos; a resposta diz quantos avisos entraram na fila e quem ficou de
 * fora, com o motivo.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao();
    const { id } = await params;
    const corpo = pedido.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }

    const r = await avisarAgora(escritorioId, id, corpo.data.qual, usuarioId);
    if (r.criados > 0) await enfileirar("LEMBRAR", escritorioId);

    const partes: string[] = [];
    if (r.criados === 0) {
      partes.push("Ninguem para avisar: nenhum participante com telefone ou e-mail.");
    } else {
      partes.push(`${r.criados} aviso(s) na fila — saem em instantes.`);
    }
    if (r.semContato.length) partes.push(`Sem contato: ${r.semContato.join(", ")}.`);
    if (r.soPorWhatsappDesligado.length) {
      partes.push(`So tem telefone, e o WhatsApp nao esta ligado: ${r.soPorWhatsappDesligado.join(", ")}.`);
    }

    return NextResponse.json({ ...r, mensagem: partes.join(" ") });
  } catch (erro) {
    if (erro instanceof CompromissoNaoEncontrado) {
      return NextResponse.json({ erro: erro.message }, { status: 404 });
    }
    return tratarErro(erro);
  }
}
