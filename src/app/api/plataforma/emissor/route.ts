import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirOperador, SemOperador } from "@/lib/plataforma";
import { prismaPlataforma } from "@/lib/prisma";
import { cadastroFiscal, dadosDoCadastroFiscal } from "@/lib/nfse/cadastro";
import { certificadoDaPlataforma, pendenciasDaPlataforma } from "@/lib/nota-da-plataforma";

export const dynamic = "force-dynamic";

const PADRAO_DA_DESCRICAO = "Licença de uso do sistema BirdJud (software como serviço)";

const acao = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("CADASTRO"), dados: cadastroFiscal }),
  // Emitir sozinho quando a fatura e paga.
  z.object({ acao: z.literal("AUTOMATICA"), ligar: z.boolean() }),
]);

/**
 * Cadastro fiscal da Blackbird, a emissora da nota da mensalidade. Mesmo
 * formulario e mesma validacao do emissor do escritorio (ConfigFiscal).
 */
export async function PATCH(req: Request) {
  try {
    await exigirOperador();
    const corpo = acao.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      return NextResponse.json({ erro: corpo.error.issues[0]?.message ?? "Cadastro inválido." }, { status: 400 });
    }
    if (corpo.data.acao === "AUTOMATICA") {
      const existente = await prismaPlataforma().fiscalDaPlataforma.findUnique({ where: { id: "PLATAFORMA" } });
      if (!existente) return NextResponse.json({ erro: "Cadastre o emissor primeiro." }, { status: 409 });
      if (corpo.data.ligar) {
        // Ligada com pendencia, cada pagamento viraria um trabalho com falha.
        let pendencias: string[];
        try {
          pendencias = pendenciasDaPlataforma(existente, certificadoDaPlataforma());
        } catch (e) {
          pendencias = [`O certificado das variáveis não abriu: ${(e as Error).message}`];
        }
        if (pendencias.length) return NextResponse.json({ erro: pendencias.join(" ") }, { status: 428 });
      }
      await prismaPlataforma().fiscalDaPlataforma.update({
        where: { id: "PLATAFORMA" },
        data: { automatica: corpo.data.ligar },
      });
      return NextResponse.json({
        ok: true,
        detalhe: corpo.data.ligar
          ? "Emissão automática ligada: cada fatura paga gera a nota e manda ao escritório."
          : "Emissão automática desligada: a nota só sai pelo console.",
      });
    }
    const dados = dadosDoCadastroFiscal(corpo.data.dados);
    const comDescricao = { ...dados, descricaoPadrao: dados.descricaoPadrao?.trim() || PADRAO_DA_DESCRICAO };
    await prismaPlataforma().fiscalDaPlataforma.upsert({
      where: { id: "PLATAFORMA" },
      create: { id: "PLATAFORMA", ...comDescricao },
      update: comDescricao,
    });
    return NextResponse.json({ ok: true });
  } catch (erro) {
    if (erro instanceof SemOperador) return NextResponse.json({ erro: erro.message }, { status: erro.status });
    console.error(erro);
    return NextResponse.json({ erro: "Erro interno." }, { status: 500 });
  }
}
