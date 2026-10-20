import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { comEscritorio, semEscritorio } from "@/lib/prisma";
import { exigirSessao, exigirAdmin } from "@/lib/sessao";
import { paraCentavos } from "@/lib/dinheiro";
import { tratarErro } from "@/lib/respostas";
import { avisarNotaParaAssinar } from "@/lib/avisos";
import { enfileirar } from "@/lib/fila";
import { NotaInvalida, prepararNota } from "@/lib/nfse";
import { cadastroFiscal, dadosDoCadastroFiscal } from "@/lib/nfse/cadastro";

export const dynamic = "force-dynamic";

const novaNota = z.object({
  clienteId: z.string().min(1),
  cobrancaId: z.string().min(1).nullish(),
  descricao: z.string().min(3).max(2000),
  valor: z.string().min(1),
  dataCompetencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  informacoesComplementares: z.string().max(2000).nullish(),
  envioCliente: z.array(z.enum(["EMAIL", "WHATSAPP"])).max(2).optional(),
});

const acao = z.object({ acao: z.literal("CADASTRO"), dados: cadastroFiscal });

function respostaDoDominio(erro: unknown): NextResponse | null {
  if (erro instanceof NotaInvalida) return NextResponse.json({ erro: erro.message }, { status: erro.status });
  return null;
}

export async function GET() {
  try {
    const { escritorioId } = await exigirSessao("NFSE", "NOTAS");
    const notas = await comEscritorio(escritorioId, (db) =>
      db.notaFiscal.findMany({ orderBy: { criadoEm: "desc" }, take: 200 }),
    );
    return NextResponse.json({ notas });
  } catch (erro) {
    return tratarErro(erro);
  }
}

/** Prepara a nota: fica aguardando a assinatura do titular do certificado. */
export async function POST(req: Request) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao("NFSE", "NOTAS");
    const corpo = novaNota.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      return NextResponse.json({ erro: corpo.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
    }
    const valorCentavos = paraCentavos(corpo.data.valor);
    if (valorCentavos === null || valorCentavos <= 0) {
      return NextResponse.json({ erro: "Valor inválido." }, { status: 400 });
    }

    const r = await prepararNota(escritorioId, {
      clienteId: corpo.data.clienteId,
      cobrancaId: corpo.data.cobrancaId ?? null,
      descricao: corpo.data.descricao,
      valorCentavos,
      dataCompetencia: corpo.data.dataCompetencia ?? null,
      informacoesComplementares: corpo.data.informacoesComplementares ?? null,
      criadoPorId: usuarioId,
      envioCliente: corpo.data.envioCliente,
    });
    if ((await avisarNotaParaAssinar(escritorioId, r.nota.id, r.titularId, usuarioId)) > 0) {
      await enfileirar("LEMBRAR", escritorioId);
    }
    return NextResponse.json({ status: r.nota.status, notaId: r.nota.id, avisos: r.avisos }, { status: 201 });
  } catch (erro) {
    return respostaDoDominio(erro) ?? tratarErro(erro);
  }
}

/** Cadastro fiscal: e do escritorio, nao de cada pessoa — so admin mexe. */
export async function PATCH(req: Request) {
  try {
    const { escritorioId } = await exigirAdmin("NFSE");
    const corpo = acao.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      return NextResponse.json({ erro: corpo.error.issues[0]?.message ?? "Cadastro inválido." }, { status: 400 });
    }
    const dados = {
      ...dadosDoCadastroFiscal(corpo.data.dados),
      regime: corpo.data.dados.opSimpNac === 3 ? "SIMPLES" : corpo.data.dados.opSimpNac === 2 ? "MEI" : "NORMAL",
    };
    await comEscritorio(escritorioId, async (db) => {
      const existente = await db.fiscal.findFirst();
      if (existente) return db.fiscal.update({ where: { id: existente.id }, data: dados });
      return db.fiscal.create({ data: semEscritorio(dados) });
    });
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return respostaDoDominio(erro) ?? tratarErro(erro);
  }
}
