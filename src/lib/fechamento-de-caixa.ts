// Fechamento de caixa mensal (03/11/2026, vindo do sistema da Advocacia Roma).
//
// O resumo do mes se recalculava a cada consulta: nunca havia um numero
// definitivo para comparar com a meta nem para fechar faturamento. O
// fechamento e uma FOTO com os totais congelados, mais a quebra por forma de
// pagamento e por quem recebeu — o que o escritorio confere no caixa.
//
// Decisoes:
// - fecha sozinho na rotina diaria, olhando para TRAS: qualquer mes completo
//   sem fechamento e fechado, e nao so o anterior (sistema fora do ar na
//   virada nao pode deixar um mes sem fechar para sempre);
// - mes que ainda nao terminou nao fecha: foto no meio do mes engana;
// - o mes fechado NAO trava: lancamento atrasado continua entrando. A tela
//   compara a foto com a soma de agora e mostra a diferenca; refazer guarda
//   quem, quando e quantas vezes.
import type { Prisma } from "@prisma/client";
import { comEscritorio, semEscritorio } from "./prisma";
import { PedidoInvalido } from "./cobrancas";

const FUSO = "America/Sao_Paulo";

/** "aaaa-mm" de uma data, em Brasilia. */
export function competenciaDe(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: FUSO }).format(d).slice(0, 7);
}

/** Primeiro instante do mes e do mes seguinte, em Brasilia. */
export function limitesDoMes(competencia: string): { de: Date; ate: Date } {
  const [ano, mes] = competencia.split("-").map(Number);
  const seguinte = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
  return { de: new Date(`${competencia}-01T00:00:00-03:00`), ate: new Date(`${seguinte}-01T00:00:00-03:00`) };
}

export function mesAnterior(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number);
  return mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
}

const ROTULO_DA_FORMA: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  TRANSFERENCIA: "Transferência",
  CARTAO: "Cartão",
  BOLETO: "Boleto",
  CHEQUE: "Cheque",
  OUTRO: "Outro",
  QUALQUER: "Asaas (cliente escolheu)",
};

export type Soma = {
  receitaCentavos: number;
  despesaCentavos: number;
  lancamentos: number;
  porForma: Record<string, number>;
  porQuemRecebeu: Record<string, number>;
};

/** A soma de agora do mes: livro-caixa pago no mes, com a origem de cada receita. */
export async function somarMes(escritorioId: string, competencia: string): Promise<Soma> {
  const { de, ate } = limitesDoMes(competencia);
  const [lancamentos, baixas, cobrancas] = await comEscritorio(escritorioId, async (db) => {
    const ls = await db.lancamento.findMany({
      where: { pagoEm: { gte: de, lt: ate } },
      select: { id: true, tipo: true, valorCentavos: true, cobrancaId: true },
    });
    const ids = ls.map((l) => l.id);
    return [
      ls,
      await db.baixaDeCobranca.findMany({ where: { lancamentoId: { in: ids } }, select: { lancamentoId: true, forma: true, recebidoPor: true } }),
      await db.cobranca.findMany({
        where: { OR: [{ lancamentoId: { in: ids } }, { id: { in: ls.map((l) => l.cobrancaId).filter((x): x is string => !!x) } }] },
        select: { id: true, lancamentoId: true, forma: true, provedor: true },
      }),
    ] as const;
  });
  const soma: Soma = { receitaCentavos: 0, despesaCentavos: 0, lancamentos: lancamentos.length, porForma: {}, porQuemRecebeu: {} };
  const somar = (mapa: Record<string, number>, chave: string, v: number) => (mapa[chave] = (mapa[chave] ?? 0) + v);
  for (const l of lancamentos) {
    if (l.tipo !== "RECEITA") {
      soma.despesaCentavos += l.valorCentavos;
      continue;
    }
    soma.receitaCentavos += l.valorCentavos;
    const baixa = baixas.find((b) => b.lancamentoId === l.id);
    const cobranca = cobrancas.find((c) => c.lancamentoId === l.id || c.id === l.cobrancaId);
    let forma = "Não informada";
    let quem = "Não informado";
    if (baixa) {
      forma = baixa.forma ? (ROTULO_DA_FORMA[baixa.forma] ?? baixa.forma) : forma;
      quem = baixa.recebidoPor ?? quem;
    } else if (cobranca) {
      forma = ROTULO_DA_FORMA[cobranca.forma] ?? cobranca.forma;
      quem = cobranca.provedor === "INFINITEPAY" ? "Conta InfinitePay" : "Conta Asaas";
    }
    somar(soma.porForma, forma, l.valorCentavos);
    somar(soma.porQuemRecebeu, quem, l.valorCentavos);
  }
  return soma;
}

/** Fecha (ou refaz) a foto de um mes que ja terminou. */
export async function fecharMes(escritorioId: string, competencia: string, quem: string | null, agora = new Date()) {
  if (!/^\d{4}-\d{2}$/.test(competencia)) throw new PedidoInvalido("Mês inválido.");
  if (competencia >= competenciaDe(agora)) throw new PedidoInvalido("Mês que ainda não terminou não fecha: a foto no meio do mês engana.");
  const soma = await somarMes(escritorioId, competencia);
  const dados = {
    receitaCentavos: soma.receitaCentavos,
    despesaCentavos: soma.despesaCentavos,
    lancamentos: soma.lancamentos,
    porForma: soma.porForma as Prisma.InputJsonValue,
    porQuemRecebeu: soma.porQuemRecebeu as Prisma.InputJsonValue,
  };
  return comEscritorio(escritorioId, async (db) => {
    const ja = await db.fechamentoDeCaixa.findFirst({ where: { competencia } });
    if (ja) {
      return db.fechamentoDeCaixa.update({
        where: { id: ja.id },
        data: { ...dados, refeito: { increment: 1 }, refeitoEm: agora, refeitoPor: quem ?? "rotina" },
      });
    }
    return db.fechamentoDeCaixa.create({ data: semEscritorio({ competencia, ...dados, fechadoEm: agora, fechadoPor: quem }) });
  });
}

/**
 * Rotina: fecha todo mes completo que ficou sem fechamento, do primeiro mes
 * com movimento ate o mes passado. Nunca refaz o que ja foi fechado.
 */
export async function fecharMesesPendentes(escritorioId: string, agora = new Date()): Promise<string[]> {
  const primeiro = await comEscritorio(escritorioId, (db) =>
    db.lancamento.findFirst({ where: { pagoEm: { not: null } }, orderBy: { pagoEm: "asc" }, select: { pagoEm: true } }),
  );
  if (!primeiro?.pagoEm) return [];
  const fechados = new Set(
    (await comEscritorio(escritorioId, (db) => db.fechamentoDeCaixa.findMany({ select: { competencia: true } }))).map((f) => f.competencia),
  );
  const feitos: string[] = [];
  const atual = competenciaDe(agora);
  let mes = mesAnterior(atual);
  const inicio = competenciaDe(primeiro.pagoEm);
  // No maximo 36 meses para tras de uma vez: o resto fica para a proxima rodada.
  for (let i = 0; i < 36 && mes >= inicio; i++, mes = mesAnterior(mes)) {
    if (fechados.has(mes)) continue;
    await fecharMes(escritorioId, mes, null, agora);
    feitos.push(mes);
  }
  return feitos;
}

export type FechamentoNaTela = {
  competencia: string;
  foto: Soma & { fechadoEm: Date; fechadoPor: string | null; refeito: number; refeitoEm: Date | null; refeitoPor: string | null };
  agora: Soma;
  /** A soma de agora difere da foto: entrou ou saiu lancamento depois de fechar. */
  mudou: boolean;
};

/** Os ultimos fechamentos, cada um com a soma de agora ao lado. */
export async function fechamentosRecentes(escritorioId: string, quantos = 6): Promise<FechamentoNaTela[]> {
  const fotos = await comEscritorio(escritorioId, (db) => db.fechamentoDeCaixa.findMany({ orderBy: { competencia: "desc" }, take: quantos }));
  const lista: FechamentoNaTela[] = [];
  for (const f of fotos) {
    const agora = await somarMes(escritorioId, f.competencia);
    lista.push({
      competencia: f.competencia,
      foto: {
        receitaCentavos: f.receitaCentavos,
        despesaCentavos: f.despesaCentavos,
        lancamentos: f.lancamentos,
        porForma: f.porForma as Record<string, number>,
        porQuemRecebeu: f.porQuemRecebeu as Record<string, number>,
        fechadoEm: f.fechadoEm,
        fechadoPor: f.fechadoPor,
        refeito: f.refeito,
        refeitoEm: f.refeitoEm,
        refeitoPor: f.refeitoPor,
      },
      agora,
      mudou: agora.receitaCentavos !== f.receitaCentavos || agora.despesaCentavos !== f.despesaCentavos || agora.lancamentos !== f.lancamentos,
    });
  }
  return lista;
}
