// Relacao de despesas e aviso de vencimento (03/11/2026, vindo do sistema da
// Advocacia Roma).
//
// O Financeiro so mostrava o mes da competencia, e Cobrancas so o que esta em
// aberto nos proximos dias. Quem precisasse saber quanto o escritorio gastou
// de energia no semestre nao tinha onde olhar. A relacao junta pagas e a
// pagar, com filtro de periodo, categoria, situacao e busca.
import type { Prisma } from "@prisma/client";
import { comEscritorio } from "./prisma";
import { hojeNoEscritorio } from "./contas-do-escritorio";

export const SITUACOES_DA_DESPESA = ["todas", "pagas", "a-pagar", "vencidas"] as const;
export type SituacaoDaDespesa = (typeof SITUACOES_DA_DESPESA)[number];

export type FiltroDeDespesas = {
  ano: number;
  /** 1 a 12; ausente = o ano inteiro. */
  mes?: number;
  categoria?: string;
  situacao: SituacaoDaDespesa;
  busca?: string;
};

/** Le o filtro da URL, recusando o que nao faz sentido em vez de adivinhar. */
export function filtroDaUrl(p: Record<string, string | undefined>, hoje = hojeNoEscritorio()): FiltroDeDespesas {
  const anoHoje = Number(hoje.slice(0, 4));
  const ano = Number(p.ano);
  const mes = Number(p.mes);
  const situacao = (SITUACOES_DA_DESPESA as readonly string[]).includes(p.situacao ?? "") ? (p.situacao as SituacaoDaDespesa) : "todas";
  return {
    ano: Number.isInteger(ano) && ano >= 2000 && ano <= anoHoje + 5 ? ano : anoHoje,
    mes: Number.isInteger(mes) && mes >= 1 && mes <= 12 ? mes : undefined,
    categoria: p.categoria?.trim() || undefined,
    situacao,
    busca: p.busca?.trim().slice(0, 80) || undefined,
  };
}

/** O "where" do filtro. A competencia manda no periodo: e o mes da conta. */
export function ondeDoFiltro(f: FiltroDeDespesas, hoje: string): Prisma.LancamentoWhereInput {
  const competencia = f.mes ? `${f.ano}-${String(f.mes).padStart(2, "0")}` : undefined;
  const inicioDeHoje = new Date(`${hoje}T00:00:00-03:00`);
  const where: Prisma.LancamentoWhereInput = {
    tipo: "DESPESA",
    competencia: competencia ?? { startsWith: `${f.ano}-` },
  };
  if (f.categoria) where.categoria = f.categoria === "SEM" ? null : f.categoria;
  if (f.situacao === "pagas") where.pagoEm = { not: null };
  if (f.situacao === "a-pagar") where.pagoEm = null;
  if (f.situacao === "vencidas") Object.assign(where, { pagoEm: null, vencimento: { lt: inicioDeHoje } });
  if (f.busca) {
    where.OR = [
      { descricao: { contains: f.busca, mode: "insensitive" } },
      { fornecedor: { contains: f.busca, mode: "insensitive" } },
      { observacoes: { contains: f.busca, mode: "insensitive" } },
    ];
  }
  return where;
}

type LinhaParaSomar = { valorCentavos: number; pagoEm: Date | null; vencimento: Date | null; categoria: string | null };

export type Totais = {
  total: number;
  pago: number;
  aPagar: number;
  vencido: number;
  porCategoria: { categoria: string | null; centavos: number; quantas: number }[];
};

export function somarDespesas(linhas: LinhaParaSomar[], hoje: string): Totais {
  const inicioDeHoje = new Date(`${hoje}T00:00:00-03:00`).getTime();
  const t: Totais = { total: 0, pago: 0, aPagar: 0, vencido: 0, porCategoria: [] };
  const mapa = new Map<string | null, { centavos: number; quantas: number }>();
  for (const l of linhas) {
    t.total += l.valorCentavos;
    if (l.pagoEm) t.pago += l.valorCentavos;
    else {
      t.aPagar += l.valorCentavos;
      if (l.vencimento && l.vencimento.getTime() < inicioDeHoje) t.vencido += l.valorCentavos;
    }
    const c = mapa.get(l.categoria) ?? { centavos: 0, quantas: 0 };
    c.centavos += l.valorCentavos;
    c.quantas += 1;
    mapa.set(l.categoria, c);
  }
  t.porCategoria = [...mapa.entries()].map(([categoria, v]) => ({ categoria, ...v })).sort((a, b) => b.centavos - a.centavos);
  return t;
}

const LIMITE_DA_LISTA = 1000;

export async function relacaoDeDespesas(escritorioId: string, f: FiltroDeDespesas, hoje = hojeNoEscritorio()) {
  const where = ondeDoFiltro(f, hoje);
  // Os totais somam TUDO o que o filtro pega; a lista para no limite.
  const [linhas, todas] = await comEscritorio(escritorioId, async (db) => [
    await db.lancamento.findMany({ where, orderBy: [{ vencimento: { sort: "desc", nulls: "last" } }, { criadoEm: "desc" }], take: LIMITE_DA_LISTA }),
    await db.lancamento.findMany({ where, select: { valorCentavos: true, pagoEm: true, vencimento: true, categoria: true } }),
  ] as const);
  const ids = linhas.map((l) => l.id);
  // Despesa que veio do extrato ou de cobranca nao se exclui por aqui: a
  // conferencia ficaria apontando para nada.
  const presas = await comEscritorio(escritorioId, async (db) => {
    const doExtrato = await db.entradaDeExtrato.findMany({ where: { lancamentoId: { in: ids } }, select: { lancamentoId: true } });
    return new Set(doExtrato.map((e) => e.lancamentoId));
  });
  return {
    linhas: linhas.map((l) => ({ ...l, excluivel: !l.cobrancaId && !l.contratoId && !presas.has(l.id) })),
    cortada: todas.length > linhas.length,
    totais: somarDespesas(todas, hoje),
  };
}

/** Quantos dias para frente o aviso da tela inicial olha. */
export const DIAS_DO_AVISO = 7;

export type ContasVencendo = {
  vencidas: number;
  proximas: number;
  centavosVencidas: number;
  centavosProximas: number;
  primeiras: { id: string; descricao: string; valorCentavos: number; vencimento: Date }[];
};

/**
 * Despesas em aberto vencidas e dos proximos dias, para a tela inicial. So
 * aparece quando ha o que avisar: quadro permanente dizendo "nada vencendo"
 * vira ruido numa tela que se abre dez vezes por dia.
 */
export async function contasVencendo(escritorioId: string, hoje = hojeNoEscritorio()): Promise<ContasVencendo | null> {
  const inicioDeHoje = new Date(`${hoje}T00:00:00-03:00`);
  const limite = new Date(inicioDeHoje.getTime() + (DIAS_DO_AVISO + 1) * 86_400_000);
  const contas = await comEscritorio(escritorioId, (db) =>
    db.lancamento.findMany({
      where: { tipo: "DESPESA", pagoEm: null, vencimento: { not: null, lt: limite } },
      orderBy: { vencimento: "asc" },
      select: { id: true, descricao: true, valorCentavos: true, vencimento: true },
      take: 500,
    }),
  );
  if (!contas.length) return null;
  const r: ContasVencendo = { vencidas: 0, proximas: 0, centavosVencidas: 0, centavosProximas: 0, primeiras: [] };
  for (const c of contas) {
    if (c.vencimento! < inicioDeHoje) {
      r.vencidas += 1;
      r.centavosVencidas += c.valorCentavos;
    } else {
      r.proximas += 1;
      r.centavosProximas += c.valorCentavos;
    }
  }
  r.primeiras = contas.slice(0, 5).map((c) => ({ ...c, vencimento: c.vencimento! }));
  return r;
}
