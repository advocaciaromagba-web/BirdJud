import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirOperador, SemOperador } from "@/lib/plataforma";
import { implantarEscritorio } from "@/lib/implantacao";
import { EnderecoIndisponivel, slugValido } from "@/lib/nascimento";
import { DadoInvalido } from "@/lib/dados-do-escritorio";
import { CorInvalida } from "@/lib/identidade";
import { FaixaEsgotada, FAIXAS } from "@/lib/faixas";
import { MODULOS } from "@/lib/catalogo";

export const dynamic = "force-dynamic";

const pedido = z.object({
  nome: z.string().min(2).max(120),
  slug: slugValido,
  modulos: z.array(z.enum(MODULOS)).min(1),
  faixa: z.enum(FAIXAS),
  diasDeTeste: z.number().int().min(0).max(90),
  valorCentavos: z.number().int().min(0).max(10_000_000).optional(),
  dados: z.object({
    razaoSocial: z.string().max(200).optional(),
    cnpj: z.string().max(20).optional(),
    telefoneAtendimento: z.string().max(30).optional(),
    cidade: z.string().max(120).optional(),
    corPrimaria: z.string().max(20).optional(),
    corSecundaria: z.string().max(20).optional(),
  }),
  administrador: z.object({
    nome: z.string().min(2).max(120),
    email: z.string().email(),
    oab: z.string().max(20).optional(),
    telefone: z.string().max(30).optional(),
    recebeWhatsapp: z.boolean().optional(),
  }),
});

/** Implantar escritorio novo, ja montado, pelo console da plataforma. */
export async function POST(req: Request) {
  try {
    const operador = await exigirOperador();
    const corpo = pedido.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      return NextResponse.json(
        { erro: corpo.error.issues[0]?.message ?? "Dados invalidos." },
        { status: 400 },
      );
    }
    const r = await implantarEscritorio(operador, corpo.data);
    return NextResponse.json(r, { status: 201 });
  } catch (erro) {
    if (erro instanceof SemOperador) return NextResponse.json({ erro: erro.message }, { status: erro.status });
    if (
      erro instanceof EnderecoIndisponivel ||
      erro instanceof DadoInvalido ||
      erro instanceof CorInvalida ||
      erro instanceof FaixaEsgotada
    ) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    console.error(erro);
    return NextResponse.json({ erro: "Erro interno." }, { status: 500 });
  }
}
