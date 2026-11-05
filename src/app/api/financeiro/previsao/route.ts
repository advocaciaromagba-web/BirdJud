import { NextResponse } from "next/server";
import { exigirAdministracao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { competenciaSeguinte, hojeEmBrasilia, previsaoDeArrecadacao } from "@/lib/previsao-de-arrecadacao";

export const dynamic = "force-dynamic";

/**
 * Previsao de arrecadacao. Rota separada da pagina de proposito: o Asaas e
 * servico de fora e pode demorar; o resto do Financeiro nao espera por ele.
 */
export async function GET(req: Request) {
  try {
    const { escritorioId } = await exigirAdministracao("FINANCEIRO");
    const pedido = new URL(req.url).searchParams.get("de") ?? "";
    // Padrao: do mes passado em diante (o fechamento olha para tras, o
    // planejamento para frente).
    const inicio = /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) ? pedido : competenciaSeguinte(hojeEmBrasilia().slice(0, 7), -1);
    return NextResponse.json(await previsaoDeArrecadacao(escritorioId, inicio));
  } catch (erro) {
    return tratarErro(erro);
  }
}
