import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio, semEscritorio } from "@/lib/prisma";
import { exigirSessao, exigirAdmin } from "@/lib/sessao";
import { paraCentavos } from "@/lib/dinheiro";
import { tratarErro } from "@/lib/respostas";
import {
  cancelarNota,
  CancelamentoInvalido,
  CertificadoInvalido,
  emitirNota,
  FalhaNaNfse,
  NotaInvalida,
  SemCadastroFiscal,
  SemCertificado,
} from "@/lib/nfse";
import { aliquotaEmMilesimos, REGIMES } from "@/lib/nfse/layout";

const novaNota = z.object({
  clienteId: z.string().min(1),
  cobrancaId: z.string().min(1).optional(),
  descricao: z.string().min(3).max(500),
  valor: z.string().min(1),
});

const cadastroFiscal = z.object({
  razaoSocial: z.string().min(2).max(200),
  cnpj: z.string().min(11).max(20),
  inscricaoMunicipal: z.string().min(1).max(30),
  codigoMunicipio: z.string().regex(/^\d{7}$/),
  regime: z.enum(REGIMES),
  codigoTributacao: z.string().min(2).max(20),
  aliquota: z.string().min(1), // percentual como digitado: "2" ou "2,5"
  serie: z.string().min(1).max(5).optional(),
  ambiente: z.enum(["HOMOLOGACAO", "PRODUCAO"]),
});

const acao = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("CANCELAR"), id: z.string().min(1) }),
  z.object({ acao: z.literal("CADASTRO"), dados: cadastroFiscal }),
]);

function respostaDoDominio(erro: unknown): NextResponse | null {
  if (
    erro instanceof SemCadastroFiscal ||
    erro instanceof SemCertificado ||
    erro instanceof NotaInvalida ||
    erro instanceof CancelamentoInvalido ||
    erro instanceof CertificadoInvalido ||
    erro instanceof FalhaNaNfse
  ) {
    return NextResponse.json({ erro: erro.message }, { status: erro.status });
  }
  return null;
}

export async function GET() {
  try {
    const { escritorioId } = await exigirSessao("NFSE");
    const [notas, fiscal] = await Promise.all([
      comEscritorio(escritorioId, (db) =>
        db.notaFiscal.findMany({ orderBy: { criadoEm: "desc" }, take: 200 }),
      ),
      comEscritorio(escritorioId, (db) => db.fiscal.findFirst()),
    ]);
    return NextResponse.json({ notas, fiscal });
  } catch (erro) {
    return tratarErro(erro);
  }
}

export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirSessao("NFSE");
    const corpo = novaNota.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }

    const valorCentavos = paraCentavos(corpo.data.valor);
    if (valorCentavos === null || valorCentavos <= 0) {
      return NextResponse.json({ erro: "Valor invalido." }, { status: 400 });
    }

    const nota = await emitirNota(escritorioId, {
      clienteId: corpo.data.clienteId,
      cobrancaId: corpo.data.cobrancaId ?? null,
      descricao: corpo.data.descricao,
      valorCentavos,
    });
    return NextResponse.json({ nota }, { status: 201 });
  } catch (erro) {
    return respostaDoDominio(erro) ?? tratarErro(erro);
  }
}

export async function PATCH(req: Request) {
  try {
    const corpo = acao.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Acao invalida." }, { status: 400 });
    }

    if (corpo.data.acao === "CANCELAR") {
      const { escritorioId } = await exigirSessao("NFSE");
      await cancelarNota(escritorioId, corpo.data.id);
      return NextResponse.json({ ok: true });
    }

    // Cadastro fiscal e do escritorio, nao de cada pessoa: so admin mexe.
    const { escritorioId } = await exigirAdmin("NFSE");
    const dados = corpo.data.dados;
    const aliquotaMilesimos = aliquotaEmMilesimos(dados.aliquota);
    if (aliquotaMilesimos === null) {
      return NextResponse.json({ erro: "Aliquota invalida." }, { status: 400 });
    }

    const { aliquota, serie, ...resto } = dados;
    await comEscritorio(escritorioId, async (db) => {
      const existente = await db.fiscal.findFirst();
      if (existente) {
        return db.fiscal.update({
          where: { id: existente.id },
          data: { ...resto, aliquotaMilesimos, ...(serie ? { serie } : {}) },
        });
      }
      return db.fiscal.create({
        data: semEscritorio({
          ...resto,
          aliquotaMilesimos,
          ...(serie ? { serie } : {}),
        }),
      });
    });
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return respostaDoDominio(erro) ?? tratarErro(erro);
  }
}
