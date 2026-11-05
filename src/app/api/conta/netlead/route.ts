import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { registrarTentativa } from "@/lib/limite";
import { desligarDeVez, guardarChave, ligarOuDesligar, testarChaveGuardada, type ResultadoDoEnvio } from "@/lib/netlead";

export const dynamic = "force-dynamic";

const pedido = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("chave"), chave: z.string().trim().min(8).max(300) }),
  z.object({ acao: z.literal("testar") }),
  z.object({ acao: z.literal("ligar"), ativo: z.boolean() }),
  z.object({ acao: z.literal("remover") }),
]);

function textoDoEnvio(r: ResultadoDoEnvio, ligando: boolean): { ok: boolean; texto: string } {
  switch (r.situacao) {
    case "ENVIADO":
      return ligando
        ? { ok: true, texto: `Ligado: ${r.eventos} horário(s) bloqueado(s) no NetLead, até 180 dias à frente.` }
        : { ok: true, texto: "Desligado: os horários foram liberados no NetLead." };
    case "SEM_CHAVE":
      return { ok: false, texto: "Cole a chave do NetLead primeiro." };
    case "DESLIGADO":
      return { ok: true, texto: "Desligado." };
    default:
      return {
        ok: false,
        texto: ligando
          ? `Ficou ligado, mas o primeiro envio falhou: ${r.erro}`
          : `Ficou desligado aqui, mas não deu para avisar o NetLead (${r.erro}). Os horários podem continuar bloqueados lá.`,
      };
  }
}

/** Cada pessoa liga a sua agenda. Ninguem liga a de outro. */
export async function POST(req: Request) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao();
    const limite = await registrarTentativa(`netlead:${usuarioId}`, 30, 60 * 60);
    if (!limite.permitido) return NextResponse.json({ erro: "Muitas tentativas. Tente de novo mais tarde." }, { status: 429 });
    const corpo = pedido.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
    const d = corpo.data;
    if (d.acao === "chave") {
      await guardarChave(escritorioId, usuarioId, d.chave);
      const t = await testarChaveGuardada(escritorioId, usuarioId);
      return NextResponse.json(
        t.ok ? { ok: true, texto: `Chave guardada. É a agenda de ${t.pessoa} no NetLead.` } : { ok: false, texto: `Chave guardada, mas o teste falhou: ${t.erro}` },
      );
    }
    if (d.acao === "testar") {
      const t = await testarChaveGuardada(escritorioId, usuarioId);
      return NextResponse.json(t.ok ? { ok: true, texto: `Funcionando: agenda de ${t.pessoa}.` } : { ok: false, texto: t.erro });
    }
    if (d.acao === "ligar") return NextResponse.json(textoDoEnvio(await ligarOuDesligar(escritorioId, usuarioId, d.ativo), d.ativo));
    await desligarDeVez(escritorioId, usuarioId);
    return NextResponse.json({ ok: true, texto: "Ligação com o NetLead removida." });
  } catch (erro) {
    return tratarErro(erro);
  }
}
