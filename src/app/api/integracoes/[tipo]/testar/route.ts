import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/sessao";
import { anotarTeste, IntegracaoAusente, obterIntegracao } from "@/lib/integracao";
import { CONECTORES, ehTipoDeIntegracao } from "@/lib/conectores";
import { tratarErro } from "@/lib/respostas";

/**
 * Testa a integracao ja guardada, sem pedir a credencial de novo — e o que
 * permite ao escritorio conferir sozinho, depois, se ainda esta funcionando.
 */
export async function POST(_req: Request, { params }: { params: { tipo: string } }) {
  try {
    const { escritorioId } = await exigirAdmin();
    if (!ehTipoDeIntegracao(params.tipo)) {
      return NextResponse.json({ erro: "Integracao desconhecida." }, { status: 400 });
    }

    const conector = CONECTORES[params.tipo];
    let dados: Record<string, string>;
    try {
      dados = await obterIntegracao<Record<string, string>>(escritorioId, params.tipo, {
        mesmoComErro: true,
      });
    } catch (erro) {
      if (erro instanceof IntegracaoAusente) {
        return NextResponse.json({ erro: erro.message }, { status: 404 });
      }
      throw erro;
    }

    const resultado = await conector.testar(dados);
    await anotarTeste(escritorioId, conector.tipo, resultado.ok, resultado.detalhe);

    return NextResponse.json(resultado);
  } catch (erro) {
    return tratarErro(erro);
  }
}
