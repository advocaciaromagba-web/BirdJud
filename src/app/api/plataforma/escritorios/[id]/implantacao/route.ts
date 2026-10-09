import { NextResponse } from "next/server";
import { z } from "zod";
import { prismaPlataforma } from "@/lib/prisma";
import { exigirOperador, registrarAcessoSuporte, SemOperador } from "@/lib/plataforma";
import { entregarEscritorio, incluirNaEquipe } from "@/lib/implantacao";
import { convidarPessoa } from "@/lib/equipe";
import { salvarDadosDoEscritorio, DadoInvalido } from "@/lib/dados-do-escritorio";
import { CorInvalida } from "@/lib/identidade";
import { adicionarOab, novaOab } from "@/lib/oabs";
import { ConexaoRecusada, conectarPorFormulario } from "@/lib/conectores/conectar";
import { ehTipoDeIntegracao } from "@/lib/conectores";
import { FaixaEsgotada } from "@/lib/faixas";
import { PAPEIS } from "@/lib/papeis";
import { CHAVES_DOS_PASSOS } from "@/lib/primeiros-passos";
import { pularPasso, retomarPasso, PassoNaoPulavel } from "@/lib/primeiros-passos-do-escritorio";
import { ehDuplicado } from "@/lib/respostas";

export const dynamic = "force-dynamic";

const chave = z.enum(CHAVES_DOS_PASSOS as [string, ...string[]]);

const acao = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("dados"),
    razaoSocial: z.string().max(200).optional(),
    cnpj: z.string().max(20).optional(),
    telefoneAtendimento: z.string().max(30).optional(),
    cidade: z.string().max(120).optional(),
    corPrimaria: z.string().max(20).optional(),
    corSecundaria: z.string().max(20).optional(),
    sede: z.record(z.string().max(200)).nullable().optional(),
  }),
  z.object({
    acao: z.literal("pessoa"),
    nome: z.string().min(2).max(120),
    email: z.string().email(),
    papel: z.enum(PAPEIS),
    oab: z.string().max(20).optional(),
    telefone: z.string().max(30).optional(),
    recebeWhatsapp: z.boolean().optional(),
  }),
  z.object({ acao: z.literal("oab") }).merge(novaOab),
  z.object({ acao: z.literal("integracao"), tipo: z.string(), dados: z.record(z.string()) }),
  z.object({ acao: z.literal("pular"), chave }),
  z.object({ acao: z.literal("retomar"), chave }),
  z.object({ acao: z.literal("convite"), usuarioId: z.string().min(1) }),
  z.object({ acao: z.literal("entregar") }),
]);

/**
 * Cada passo da implantacao, feito pela plataforma no escritorio. Mesmas
 * regras das telas do escritorio — as funcoes sao as mesmas.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const operador = await exigirOperador();
    const { id } = await params;
    const escritorio = await prismaPlataforma().escritorio.findUnique({
      where: { id },
      select: { id: true, nome: true, slug: true },
    });
    if (!escritorio) return NextResponse.json({ erro: "Escritorio nao encontrado." }, { status: 404 });

    const corpo = acao.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      return NextResponse.json({ erro: corpo.error.issues[0]?.message ?? "Acao invalida." }, { status: 400 });
    }
    const a = corpo.data;
    const anotar = (motivo: string) => registrarAcessoSuporte(operador.operadorId, id, `Implantacao: ${motivo}`);

    switch (a.acao) {
      case "dados": {
        await anotar("dados do escritorio");
        const { acao: _, ...dados } = a;
        const limpos = Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== undefined));
        await salvarDadosDoEscritorio(id, limpos);
        return NextResponse.json({ detalhe: "Dados do escritorio gravados." });
      }
      case "pessoa": {
        const { acao: _, ...pessoa } = a;
        const r = await incluirNaEquipe(operador.operadorId, id, pessoa);
        return NextResponse.json({
          detalhe:
            `${r.pessoa.nome} incluido(a). O convite sai na entrega.` +
            (r.oabMonitorada ? " A OAB entrou no monitoramento do DJEN." : ""),
        });
      }
      case "oab": {
        await anotar("OAB monitorada");
        await adicionarOab(id, { numero: a.numero, uf: a.uf, nomeAdvogado: a.nomeAdvogado });
        return NextResponse.json({ detalhe: "OAB cadastrada. A primeira captura e na madrugada seguinte." });
      }
      case "integracao": {
        if (!ehTipoDeIntegracao(a.tipo)) return NextResponse.json({ erro: "Integracao desconhecida." }, { status: 400 });
        await anotar(`integracao ${a.tipo}`);
        const r = await conectarPorFormulario(id, a.tipo, a.dados);
        return NextResponse.json({ ok: r.ok, detalhe: r.detalhe });
      }
      case "pular":
        await anotar(`passo deixado para depois: ${a.chave}`);
        await pularPasso(id, a.chave, `${operador.nome} (Blackbird)`);
        return NextResponse.json({ detalhe: "Passo deixado para depois." });
      case "retomar":
        await retomarPasso(id, a.chave);
        return NextResponse.json({ detalhe: "Passo de volta ao roteiro." });
      case "convite": {
        await anotar("convite reenviado");
        const r = await convidarPessoa(id, a.usuarioId, {
          nomeDoEscritorio: escritorio.nome,
          slug: escritorio.slug,
          nomeDeQuemConvidou: `${operador.nome}, da Blackbird`,
        });
        return NextResponse.json({ convites: [r] });
      }
      case "entregar": {
        const r = await entregarEscritorio(operador, id);
        return NextResponse.json(r);
      }
    }
  } catch (erro) {
    if (erro instanceof SemOperador) return NextResponse.json({ erro: erro.message }, { status: erro.status });
    if (
      erro instanceof DadoInvalido ||
      erro instanceof CorInvalida ||
      erro instanceof FaixaEsgotada ||
      erro instanceof ConexaoRecusada ||
      erro instanceof PassoNaoPulavel
    ) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    if (ehDuplicado(erro)) {
      return NextResponse.json({ erro: "Ja existe: e-mail de usuario ou OAB repetidos." }, { status: 409 });
    }
    console.error(erro);
    return NextResponse.json({ erro: "Erro interno." }, { status: 500 });
  }
}
