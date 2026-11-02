import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { paraCentavos } from "@/lib/dinheiro";
import { FORMAS, completarDocumentoDoCliente } from "@/lib/cobrancas";
import { NOMES_DOS_CICLOS, criarMensalidade } from "@/lib/mensalidades";
import { respostaDaCobranca } from "@/lib/respostas-de-cobranca";

export const dynamic = "force-dynamic";

const nova = z.object({
  clienteId: z.string().min(1),
  descricao: z.string().trim().min(2).max(200),
  valor: z.string().min(1),
  ciclo: z.enum(NOMES_DOS_CICLOS as [string, ...string[]]),
  forma: z.enum(FORMAS),
  primeiroVencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  documentoDoCliente: z.string().max(20).optional(),
});

/** Cria a mensalidade (assinatura no Asaas). Daqui em diante, quem gera os boletos e o Asaas. */
export async function POST(req: Request) {
  try {
    const { escritorioId, acesso } = await exigirSessao("COBRANCAS", "COBRANCAS_EMITIR");
    const corpo = nova.safeParse(await req.json());
    if (!corpo.success) return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
    const valorCentavos = paraCentavos(corpo.data.valor);
    if (valorCentavos === null || valorCentavos <= 0) return NextResponse.json({ erro: "Valor inválido." }, { status: 400 });
    if (corpo.data.documentoDoCliente?.trim()) {
      if (acesso.CLIENTES !== true) {
        return NextResponse.json({ erro: "O cliente está sem CPF/CNPJ e seu acesso a Clientes está fechado." }, { status: 403 });
      }
      await completarDocumentoDoCliente(escritorioId, corpo.data.clienteId, corpo.data.documentoDoCliente);
    }
    const mensalidade = await criarMensalidade(escritorioId, {
      clienteId: corpo.data.clienteId,
      descricao: corpo.data.descricao,
      valorCentavos,
      ciclo: corpo.data.ciclo as never,
      forma: corpo.data.forma,
      primeiroVencimento: new Date(`${corpo.data.primeiroVencimento}T12:00:00Z`),
    });
    return NextResponse.json({ mensalidade }, { status: 201 });
  } catch (erro) {
    return respostaDaCobranca(erro) ?? tratarErro(erro);
  }
}
