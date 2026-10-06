// Contas a pagar no banco: gerar o mes e avisar quem vence.
//
// A regra de quando vale e quando avisar mora em contas-a-pagar.ts, pura e
// testada. Aqui so se busca e se grava.
import { comEscritorio, semEscritorio } from "./prisma";
import { competenciaDaData, vencimentoNaCompetencia } from "./financeiro";
import { emReais } from "./dinheiro";
import { diaBR } from "./datas";
import {
  comoTexto,
  diasAte,
  limiteDaBusca,
  urgencia,
  vigenteNaCompetencia,
} from "./contas-a-pagar";

/** O dia de hoje em Brasilia, "AAAA-MM-DD". O escritorio nao vive em UTC. */
export function hojeNoEscritorio(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

function emISO(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/**
 * Gera os lancamentos do mes a partir das despesas fixas vigentes.
 *
 * Idempotente: se a conta daquela competencia ja existe, nao cria de novo.
 * Importa porque isto roda todo dia pelo cron E por um botao na tela, e quem
 * clica "gerar" e gente com pressa — clicar duas vezes e o normal.
 *
 * O valor entra como PREVISAO: conta de agua muda todo mes, e o lancamento e
 * corrigido quando a conta chega.
 */
export async function gerarContasDoMes(
  escritorioId: string,
  competencia = competenciaDaData(new Date()),
): Promise<{ criados: number; jaExistiam: number; foraDeVigencia: number }> {
  return comEscritorio(escritorioId, async (db) => {
    const fixas = await db.despesaFixa.findMany({ where: { ativo: true } });

    let criados = 0;
    let jaExistiam = 0;
    let foraDeVigencia = 0;

    for (const fixa of fixas) {
      if (
        !vigenteNaCompetencia(
          { inicioEm: emISO(fixa.inicioEm), fimEm: emISO(fixa.fimEm), ativo: fixa.ativo },
          competencia,
        )
      ) {
        foraDeVigencia += 1;
        continue;
      }

      const jaTem = await db.lancamento.findFirst({
        where: { despesaFixaId: fixa.id, competencia },
        select: { id: true },
      });
      if (jaTem) {
        jaExistiam += 1;
        continue;
      }

      await db.lancamento.create({
        data: semEscritorio({
          descricao: fixa.descricao,
          valorCentavos: fixa.valorCentavos,
          tipo: "DESPESA",
          categoria: fixa.categoria,
          fornecedor: fixa.fornecedor,
          competencia,
          vencimento: vencimentoNaCompetencia(competencia, fixa.diaDoVencimento),
          despesaFixaId: fixa.id,
          observacoes: fixa.observacoes ?? "Gerado da despesa fixa. Valor previsto.",
        }),
      });
      criados += 1;
    }

    return { criados, jaExistiam, foraDeVigencia };
  });
}

export type ContaParaAvisar = {
  tipo: string;
  titulo: string;
  corpo: string;
  /** Chave de idempotencia: um aviso por conta, por ponto da regua, por dia. */
  chave: string;
};

/**
 * O que vence e precisa de aviso hoje — contas a pagar e cobrancas a receber.
 *
 * A regua e a mesma dos prazos: 3 dias antes, 1 dia antes, no dia, e quando
 * atrasa. Nao se inventa um segundo jeito de avisar, e avisar todo dia e o
 * jeito certo de o aviso virar ruido que ninguem le.
 */
export async function contasParaAvisar(
  escritorioId: string,
  agora = new Date(),
): Promise<ContaParaAvisar[]> {
  const hoje = hojeNoEscritorio(agora);
  // Sem teto para tras: a conta atrasada ha meses tem de continuar aparecendo.
  const ate = limiteDaBusca(hoje);

  const { aPagar, aReceber } = await comEscritorio(escritorioId, async (db) => ({
    aPagar: await db.lancamento.findMany({
      where: {
        tipo: "DESPESA",
        pagoEm: null,
        vencimento: { not: null, lte: ate },
      },
      orderBy: { vencimento: "asc" },
      take: 200,
    }),
    aReceber: await db.cobranca.findMany({
      where: { status: { in: ["ABERTA", "VENCIDA"] }, vencimento: { lte: ate } },
      include: { cliente: { select: { nome: true } } },
      orderBy: { vencimento: "asc" },
      take: 200,
    }),
  }));

  const avisos: ContaParaAvisar[] = [];

  for (const conta of aPagar) {
    const venc = emISO(conta.vencimento)!;
    const u = urgencia(venc, hoje);
    if (!u) continue;
    const quando = comoTexto(u, diasAte(venc, hoje));
    avisos.push({
      tipo: `CONTA_${u}`,
      titulo: `Conta a pagar ${quando}: ${conta.descricao}`,
      corpo:
        `${emReais(conta.valorCentavos)} — vencimento ${diaBR(conta.vencimento!)}` +
        `${conta.fornecedor ? `, ${conta.fornecedor}` : ""}.`,
      chave: `conta:${conta.id}:${u}:${hoje}`,
    });
  }

  for (const cobranca of aReceber) {
    const venc = emISO(cobranca.vencimento)!;
    const u = urgencia(venc, hoje);
    if (!u) continue;
    const quando = comoTexto(u, diasAte(venc, hoje));
    avisos.push({
      tipo: `RECEBIMENTO_${u}`,
      titulo: `Recebimento ${quando}: ${cobranca.cliente.nome}`,
      corpo:
        `${emReais(cobranca.valorCentavos)} — ${cobranca.descricao}, ` +
        `vencimento ${diaBR(cobranca.vencimento)}.`,
      chave: `recebimento:${cobranca.id}:${u}:${hoje}`,
    });
  }

  return avisos;
}
