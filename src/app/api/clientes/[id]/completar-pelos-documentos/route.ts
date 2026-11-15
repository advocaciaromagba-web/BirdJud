import { NextResponse } from "next/server";
import { exigirSessao, recusarSuporte } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { registrarTentativa } from "@/lib/limite";
import { AnexoRecusado, IARecusou, SemChaveDeIA } from "@/lib/ia";
import { LeituraIlegivel } from "@/lib/leitura-documento";
import { ClienteNaoEncontrado, completarPelosDocumentos } from "@/lib/completar-cadastro";

export const dynamic = "force-dynamic";
// Um cliente por chamada: a leitura de varios documentos leva dezenas de
// segundos, e a fila inteira num pedido so passaria do tempo do proxy.
export const maxDuration = 120;

/** O mesmo teto da leitura de documento na tela: e a mesma chamada cara. */
const POR_ESCRITORIO = 40;
const JANELA = 60 * 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const contexto = await exigirSessao("IA", "CLIENTES");
    // Le os documentos pessoais do cliente e grava no cadastro: nao e ato de
    // quem entrou como suporte.
    recusarSuporte(contexto, "Completar o cadastro pelos documentos do cliente");
    const limite = await registrarTentativa(`ia-leitura:${contexto.escritorioId}`, POR_ESCRITORIO, JANELA);
    if (!limite.permitido) {
      return NextResponse.json(
        { erro: "Muitas leituras em pouco tempo. Continue mais tarde: a fila fica onde parou." },
        { status: 429, headers: { "Retry-After": String(limite.esperarSegundos) } },
      );
    }
    const resultado = await completarPelosDocumentos(contexto.escritorioId, (await params).id, contexto.usuarioId);
    return NextResponse.json(resultado);
  } catch (erro) {
    if (erro instanceof ClienteNaoEncontrado || erro instanceof SemChaveDeIA || erro instanceof IARecusou || erro instanceof AnexoRecusado || erro instanceof LeituraIlegivel) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro);
  }
}
