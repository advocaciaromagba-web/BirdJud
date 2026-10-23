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
import { CupomInvalido, ativarCupom, criarCupom } from "@/lib/cupons";
import { aplicarReajuste, previaDoReajuste } from "@/lib/reajuste";

export const dynamic = "force-dynamic";

const percentual = z.number().min(-50).max(100);

const acao = z.discriminatedUnion("acao", [
  // A tabela inteira, como a tela mostra (centavos e fracoes).
  z.object({ acao: z.literal("tabela"), tabela: z.unknown() }),
  z.object({ acao: z.literal("padrao") }),
  // Reajuste da tabela por percentual, cada preco arredondado ao real.
  z.object({ acao: z.literal("reajustarTabela"), percentual }),
  z.object({
    acao: z.literal("criarCupom"),
    codigo: z.string().trim().min(3).max(30),
    descricao: z.string().trim().max(200).nullish(),
    percentual: z.number().int().min(1).max(100).nullish(),
    valorCentavos: z.number().int().min(1).max(10_000_000).nullish(),
    meses: z.number().int().min(1).max(120).nullish(),
    validoAte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    maxUsos: z.number().int().min(1).max(100_000).nullish(),
  }),
  z.object({ acao: z.literal("ativarCupom"), id: z.string().min(1), ativo: z.boolean() }),
  // Reajuste dos contratos com valor fechado: previa nao grava nada.
  z.object({ acao: z.literal("previaReajuste"), percentual }),
  z.object({
    acao: z.literal("aplicarReajuste"),
    percentual,
    incluirRecentes: z.boolean(),
    avisar: z.boolean(),
  }),
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
    if (d.acao === "criarCupom") {
      // Validade ate o fim do dia escolhido, em Brasilia.
      const validoAte = d.validoAte ? new Date(`${d.validoAte}T03:00:00Z`) : null;
      if (validoAte) validoAte.setUTCDate(validoAte.getUTCDate() + 1);
      const cupom = await criarCupom({ ...d, validoAte }, quem);
      return NextResponse.json({ ok: true, detalhe: `Cupom ${cupom.codigo} criado.` });
    }
    if (d.acao === "ativarCupom") {
      await ativarCupom(d.id, d.ativo);
      return NextResponse.json({ ok: true, detalhe: d.ativo ? "Cupom reativado." : "Cupom desativado: não entra em cadastro novo. Quem já tem segue com o desconto até o prazo." });
    }
    if (d.acao === "previaReajuste") {
      return NextResponse.json({ ok: true, previa: await previaDoReajuste(d.percentual) });
    }
    if (d.acao === "aplicarReajuste") {
      const r = await aplicarReajuste(d.percentual, { incluirRecentes: d.incluirRecentes, avisar: d.avisar, operadorId: operador.operadorId });
      return NextResponse.json({
        ok: true,
        detalhe: `${r.reajustados} contrato(s) reajustado(s) em ${d.percentual}%${r.deFora ? `, ${r.deFora} de fora (reajuste há menos de 12 meses)` : ""}${d.avisar ? `, ${r.avisados} aviso(s) enviado(s)` : ""}.`,
      });
    }
    const atual = await tabelaVigente();
    const tabela = await salvarTabela(reajustarTabela(atual, d.percentual), quem);
    return NextResponse.json({ ok: true, tabela, detalhe: `Tabela reajustada em ${d.percentual}%, cada preço arredondado ao real.` });
  } catch (erro) {
    if (erro instanceof SemOperador || erro instanceof TabelaInvalida || erro instanceof CupomInvalido) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    console.error(erro);
    return NextResponse.json({ erro: "Erro interno." }, { status: 500 });
  }
}
