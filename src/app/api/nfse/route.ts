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

/** "6,00" -> 6. Vazio -> null. */
const percentual = z
  .string()
  .max(8)
  .nullish()
  .transform((v, ctx) => {
    if (!v?.trim()) return null;
    const n = Number(v.trim().replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Percentual invalido." });
      return z.NEVER;
    }
    return new Prisma.Decimal(n.toFixed(2));
  });

const data = z
  .string()
  .nullish()
  .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00-03:00`) : null));

const cadastroFiscal = z.object({
  razaoSocial: z.string().min(2).max(200),
  cnpj: z.string().min(14).max(20),
  inscricaoMunicipal: z.string().max(30).nullish(),
  codigoMunicipio: z.string().regex(/^\d{7}$/, "Codigo IBGE com 7 digitos."),
  telefone: z.string().max(30).nullish(),
  email: z.string().max(200).nullish(),
  opSimpNac: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  regApTribSN: z.number().int().min(1).max(3).nullish(),
  regEspTrib: z.number().int().min(0).max(9),
  pTotTribSN: percentual,
  pTotTribFed: percentual,
  pTotTribEst: percentual,
  pTotTribMun: percentual,
  regimeFuturoDesde: data,
  regimeFuturo: z
    .object({
      opSimpNac: z.number().int(),
      regApTribSN: z.number().int().nullish(),
      regEspTrib: z.number().int(),
      pTotTribSN: z.string().nullish(),
      pTotTribFed: z.string().nullish(),
      pTotTribEst: z.string().nullish(),
      pTotTribMun: z.string().nullish(),
    })
    .nullish(),
  ibsCbsDesde: data,
  cIndOp: z.string().max(10).nullish(),
  cstIbsCbs: z.string().max(5).nullish(),
  cClassTribIbsCbs: z.string().max(10).nullish(),
  regApIBSCBSSN: z.number().int().min(1).max(3).nullish(),
  cAtvSN: z.number().int().nullish(),
  codigoTributacao: z.string().regex(/^\d{6}$/, "Codigo de tributacao nacional com 6 digitos."),
  codigoNbs: z.string().max(12).nullish(),
  descricaoPadrao: z.string().max(2000).nullish(),
  serie: z.string().regex(/^\d{1,5}$/).optional(),
  proximoNumero: z.number().int().min(1).optional(),
  ambiente: z.enum(["HOMOLOGACAO", "PRODUCAO"]),
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
      return NextResponse.json({ erro: corpo.error.issues[0]?.message ?? "Dados invalidos." }, { status: 400 });
    }
    const valorCentavos = paraCentavos(corpo.data.valor);
    if (valorCentavos === null || valorCentavos <= 0) {
      return NextResponse.json({ erro: "Valor invalido." }, { status: 400 });
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
      return NextResponse.json({ erro: corpo.error.issues[0]?.message ?? "Cadastro invalido." }, { status: 400 });
    }
    const { regimeFuturo, serie, proximoNumero, ...resto } = corpo.data.dados;
    const dados = {
      ...resto,
      cnpj: resto.cnpj.replace(/\D/g, ""),
      inscricaoMunicipal: resto.inscricaoMunicipal?.trim() || null,
      telefone: resto.telefone?.trim() || null,
      email: resto.email?.trim() || null,
      // Nao optante nao informa regApTribSN (E0162).
      regApTribSN: resto.opSimpNac === 3 ? (resto.regApTribSN ?? 1) : null,
      regime: resto.opSimpNac === 3 ? "SIMPLES" : resto.opSimpNac === 2 ? "MEI" : "NORMAL",
      regimeFuturo: resto.regimeFuturoDesde && regimeFuturo ? (regimeFuturo as Prisma.InputJsonValue) : Prisma.DbNull,
      ...(serie ? { serie } : {}),
      ...(proximoNumero ? { proximoNumero } : {}),
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
