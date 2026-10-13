import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { AnexoRecusado, IARecusou, MAXIMO_DE_BYTES, SemChaveDeIA } from "@/lib/ia";
import {
  EntrevistaNaoEncontrada,
  ProcuracaoIlegivel,
  roteiroDaProcuracao,
} from "@/lib/entrevista-do-escritorio";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Le a procuracao (PDF ou foto) e gera as perguntas da primeira entrevista,
 * a partir do tipo de acao que ela traz. Exige o modulo de IA.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { escritorioId } = await exigirSessao("IA", "ENTREVISTAS");
    const { id } = await params;
    const formulario = await req.formData();
    const arquivo = formulario.get("procuracao");
    if (!(arquivo instanceof File)) {
      return NextResponse.json({ erro: "Envie a procuracao (PDF ou foto)." }, { status: 400 });
    }
    if (arquivo.size > MAXIMO_DE_BYTES) {
      return NextResponse.json({ erro: "A procuracao passa do tamanho aceito. Envie um PDF menor ou uma foto." }, { status: 413 });
    }
    const resultado = await roteiroDaProcuracao(escritorioId, id, {
      nome: arquivo.name || "procuracao",
      tipo: arquivo.type,
      dados: Buffer.from(await arquivo.arrayBuffer()),
    });
    return NextResponse.json(resultado);
  } catch (erro) {
    if (
      erro instanceof EntrevistaNaoEncontrada ||
      erro instanceof ProcuracaoIlegivel ||
      erro instanceof AnexoRecusado
    ) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    if (erro instanceof SemChaveDeIA || erro instanceof IARecusou) {
      return NextResponse.json({ erro: "A leitura por IA nao esta disponivel agora. Use o tipo de acao para sugerir as perguntas." }, { status: 503 });
    }
    return tratarErro(erro);
  }
}
