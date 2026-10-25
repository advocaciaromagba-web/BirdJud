import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirAdmin } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { ClienteNaoEncontrado, definirEnvioDoCliente } from "@/lib/envio-do-cliente";
import { comEscritorio } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const pedido = z
  .object({ notificarWhatsapp: z.boolean().optional(), notificarEmail: z.boolean().optional() })
  .refine((d) => d.notificarWhatsapp !== undefined || d.notificarEmail !== undefined, "Nada para alterar.");

/**
 * Liga ou desliga o envio automatico de um cliente, por canal. So o
 * administrador: deixar de avisar um cliente e decisao de quem responde pelo
 * escritorio, nao de quem esta com a tela aberta.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId, usuarioId } = await exigirAdmin();
    const corpo = pedido.safeParse(await req.json().catch(() => ({})));
    if (!corpo.success) {
      return NextResponse.json({ erro: corpo.error.issues[0]?.message ?? "Pedido inválido." }, { status: 400 });
    }
    const quem = await comEscritorio(escritorioId, (db) =>
      db.usuario.findFirst({ where: { id: usuarioId }, select: { nome: true } }),
    );
    const { id } = await params;
    const r = await definirEnvioDoCliente(escritorioId, id, corpo.data, quem?.nome ?? "administrador");
    const partes = [
      `WhatsApp ${r.notificarWhatsapp ? "ligado" : "desligado"}, e-mail ${r.notificarEmail ? "ligado" : "desligado"}.`,
    ];
    if (r.avisosCancelados) partes.push(`${r.avisosCancelados} aviso(s) que estavam na fila foram cancelados.`);
    if (r.asaas === "ok") partes.push("Os avisos de cobrança do Asaas acompanharam.");
    if (r.asaas === "falhou") partes.push("Atenção: o Asaas não recebeu a mudança; os avisos de cobrança de lá podem continuar.");
    return NextResponse.json({ ...r, mensagem: partes.join(" ") });
  } catch (erro) {
    if (erro instanceof ClienteNaoEncontrado) return NextResponse.json({ erro: erro.message }, { status: 404 });
    return tratarErro(erro);
  }
}
