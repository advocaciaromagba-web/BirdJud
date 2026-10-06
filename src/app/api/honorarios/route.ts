import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { paraCentavos } from "@/lib/dinheiro";
import { FORMAS } from "@/lib/cobrancas";
import { MAXIMO_DE_PARCELAS, TIPOS } from "@/lib/honorarios";
import { salvarContrato } from "@/lib/honorarios-do-escritorio";
import { erroDeDominio } from "@/lib/honorarios-respostas";

export const dynamic = "force-dynamic";

const contrato = z.object({
  clienteId: z.string().min(1),
  processoId: z.string().min(1).nullish(),
  tipo: z.enum(TIPOS),
  // Em reais, como digitado. A conversao para centavos e uma so, aqui.
  valor: z.string().max(20).nullish(),
  // Quanto do total e pago a vista, na assinatura.
  entrada: z.string().max(20).nullish(),
  // Em por cento, como digitado: "30" ou "12,5".
  percentual: z.string().max(10).nullish(),
  parcelas: z.number().int().min(1).max(MAXIMO_DE_PARCELAS),
  primeiroVencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  forma: z.enum(FORMAS),
  emissaoAutomatica: z.boolean(),
  descricao: z.string().max(120).nullish(),
});

/** "12,5" -> 1250 centesimos. Nenhum percentual de dinheiro em float. */
function paraCentesimos(texto: string): number | null {
  const limpo = texto.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(limpo)) return null;
  const n = Math.round(Number(limpo) * 100);
  return n > 0 && n <= 10_000 ? n : null;
}

export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirSessao("COBRANCAS");
    const corpo = contrato.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      return NextResponse.json({ erro: "Contrato invalido." }, { status: 400 });
    }
    const d = corpo.data;

    let valorCentavos: number | null = null;
    if (d.valor?.trim()) {
      valorCentavos = paraCentavos(d.valor);
      if (valorCentavos === null || valorCentavos <= 0) {
        return NextResponse.json({ erro: "Valor invalido." }, { status: 400 });
      }
    }

    let entradaCentavos: number | null = null;
    if (d.entrada?.trim()) {
      entradaCentavos = paraCentavos(d.entrada);
      if (entradaCentavos === null || entradaCentavos < 0) {
        return NextResponse.json({ erro: "Entrada invalida." }, { status: 400 });
      }
    }

    let percentualBp: number | null = null;
    if (d.percentual?.trim()) {
      percentualBp = paraCentesimos(d.percentual);
      if (percentualBp === null) {
        return NextResponse.json({ erro: "Percentual invalido." }, { status: 400 });
      }
    }

    // O que cada tipo exige. Guardar um contrato pela metade seria guardar um
    // numero que ninguem vai conseguir cobrar depois.
    if (d.tipo !== "PERCENTUAL" && valorCentavos === null) {
      return NextResponse.json({ erro: "Informe o valor dos honorarios." }, { status: 400 });
    }
    if (d.tipo !== "VALOR" && percentualBp === null) {
      return NextResponse.json({ erro: "Informe o percentual de exito." }, { status: 400 });
    }
    if (d.tipo !== "PERCENTUAL" && !d.primeiroVencimento) {
      return NextResponse.json({ erro: "Informe a data do primeiro vencimento." }, { status: 400 });
    }

    const r = await salvarContrato(escritorioId, {
      clienteId: d.clienteId,
      processoId: d.processoId ?? null,
      tipo: d.tipo,
      valorCentavos,
      entradaCentavos,
      percentualBp,
      parcelas: d.tipo === "PERCENTUAL" ? 1 : d.parcelas,
      primeiroVencimento: d.primeiroVencimento ?? null,
      forma: d.forma,
      emissaoAutomatica: d.emissaoAutomatica,
      descricao: d.descricao ?? null,
    });
    return NextResponse.json(r);
  } catch (erro) {
    return erroDeDominio(erro) ?? tratarErro(erro);
  }
}
