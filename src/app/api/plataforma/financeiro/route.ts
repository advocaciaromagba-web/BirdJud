import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirOperador, SemOperador } from "@/lib/plataforma";
import {
  TabelaInvalida,
  reajustarTabela,
  salvarTabela,
  tabelaVigente,
  voltarATabelaPadrao,
} from "@/lib/tabela-de-precos";

export const dynamic = "force-dynamic";

const percentual = z.number().min(-50).max(100);

const acao = z.discriminatedUnion("acao", [
  // A tabela inteira, como a tela mostra (centavos e fracoes).
  z.object({ acao: z.literal("tabela"), tabela: z.unknown() }),
  z.object({ acao: z.literal("padrao") }),
  // Reajuste da tabela por percentual, cada preco arredondado ao real.
  z.object({ acao: z.literal("reajustarTabela"), percentual }),
]);

/**
 * Financeiro da plataforma: a tabela de precos que vale para quem assina a
 * partir de agora. Contrato ja assinado nao muda por aqui: o valor fechado
 * de cada escritorio fica na assinatura dele.
 */
export async function POST(req: Request) {
  try {
    const operador = await exigirOperador();
    const corpo = acao.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      return NextResponse.json({ erro: corpo.error.issues[0]?.message ?? "Pedido inválido." }, { status: 400 });
    }
    const d = corpo.data;
    const quem = operador.nome ?? operador.operadorId;

    if (d.acao === "tabela") {
      const tabela = await salvarTabela(d.tabela, quem);
      return NextResponse.json({ ok: true, tabela, detalhe: "Tabela gravada. Vale para os cadastros e para os escritórios sem valor fechado." });
    }
    if (d.acao === "padrao") {
      await voltarATabelaPadrao(quem);
      return NextResponse.json({ ok: true, tabela: await tabelaVigente(), detalhe: "Tabela padrão restaurada." });
    }
    const atual = await tabelaVigente();
    const tabela = await salvarTabela(reajustarTabela(atual, d.percentual), quem);
    return NextResponse.json({ ok: true, tabela, detalhe: `Tabela reajustada em ${d.percentual}%, cada preço arredondado ao real.` });
  } catch (erro) {
    if (erro instanceof SemOperador || erro instanceof TabelaInvalida) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    console.error(erro);
    return NextResponse.json({ erro: "Erro interno." }, { status: 500 });
  }
}
