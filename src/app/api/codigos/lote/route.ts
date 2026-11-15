import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirAdmin, recusarSuporte } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { CodigoIndisponivel, enviarPrimeiroAviso, gerarCodigosFaltantes } from "@/lib/codigos-do-escritorio";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const pedido = z.object({ soEmail: z.boolean().optional(), confirmacao: z.literal("ENVIAR") }).strict();

/**
 * Um pedaco do primeiro aviso a carteira. So o administrador: alcanca todos
 * os clientes, e mensagem entregue nao volta. A tela chama em sequencia
 * enquanto `progrediu` e `faltam`.
 */
export async function POST(req: Request) {
  try {
    const contexto = await exigirAdmin();
    recusarSuporte(contexto, "O aviso do código aos clientes");
    const corpo = pedido.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return NextResponse.json({ erro: "Confirme digitando ENVIAR." }, { status: 400 });
    // Quem entrou depois da ultima geracao tambem recebe.
    await gerarCodigosFaltantes(contexto.escritorioId);
    return NextResponse.json(await enviarPrimeiroAviso(contexto.escritorioId, { soEmail: corpo.data.soEmail, quem: contexto.nomeUsuario }));
  } catch (erro) {
    if (erro instanceof CodigoIndisponivel) return NextResponse.json({ erro: erro.message }, { status: erro.status });
    return tratarErro(erro);
  }
}
