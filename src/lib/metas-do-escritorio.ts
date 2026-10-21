// A meta no banco, e o ano do escritorio mes a mes.
//
// A conta do ritmo mora em metas.ts, pura e testada. Aqui so se busca e se
// grava.
import { comEscritorio, semEscritorio } from "./prisma";
import { ritmoDaMeta, type Ritmo } from "./metas";

export class MetaInvalida extends Error {
  readonly status = 400;
  constructor(motivo: string) {
    super(motivo);
    this.name = "MetaInvalida";
  }
}

/** Ate onde se aceita uma meta. Acima disso quase sempre e erro de digitacao. */
const TETO_CENTAVOS = 1_000_000_000_00; // R$ 1 bilhao

export async function definirMeta(
  escritorioId: string,
  ano: number,
  valorCentavos: number,
): Promise<{ id: string }> {
  if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) {
    throw new MetaInvalida("Ano inválido.");
  }
  if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) {
    throw new MetaInvalida("O valor da meta precisa ser maior que zero.");
  }
  if (valorCentavos > TETO_CENTAVOS) {
    throw new MetaInvalida("Valor fora do razoável: confira o que foi digitado.");
  }

  const meta = await comEscritorio(escritorioId, (db) =>
    db.meta.upsert({
      where: { escritorioId_ano: { escritorioId, ano } },
      update: { valorCentavos },
      create: semEscritorio({ ano, valorCentavos }),
      select: { id: true },
    }),
  );
  return meta;
}

export async function apagarMeta(escritorioId: string, ano: number): Promise<void> {
  await comEscritorio(escritorioId, (db) =>
    db.meta.deleteMany({ where: { ano } }),
  );
}

export type MesDoAno = {
  mes: number;
  /** Receita que entrou de verdade: lancamento de receita com baixa. */
  realizadoCentavos: number;
  despesasCentavos: number;
  /** O que ainda esta para entrar: cobranca em aberto com vencimento no mes. */
  previstoCentavos: number;
};

export type AnoDoEscritorio = {
  ano: number;
  meses: MesDoAno[];
  realizadoCentavos: number;
  despesasCentavos: number;
  previstoCentavos: number;
  metaCentavos: number | null;
  ritmo: Ritmo | null;
  /**
   * Media do que ENTROU nos meses ja fechados do ano (o mes corrente fica de
   * fora: pela metade, so puxaria a media para baixo). Nulo antes de fevereiro.
   */
  mediaMensalCentavos: number | null;
  /**
   * Para onde o ano caminha: o realizado ate aqui mais o que esta previsto
   * de agora ate dezembro (parcelas de contrato e cobrancas em aberto). Nao
   * depende de meta cadastrada.
   */
  projecaoCentavos: number;
};

/**
 * O ano fechado mes a mes, com a meta ao lado.
 *
 * A meta e comparada com o REALIZADO, nunca com o previsto: cobranca emitida
 * nao e dinheiro, e bater a meta no papel por causa de boleto que ninguem
 * pagou seria o pior jeito de se enganar.
 */
export async function anoDoEscritorio(
  escritorioId: string,
  ano: number,
  hojeISO: string,
): Promise<AnoDoEscritorio> {
  const de = new Date(Date.UTC(ano, 0, 1));
  const ate = new Date(Date.UTC(ano + 1, 0, 1));

  const { lancamentos, emAberto, meta } = await comEscritorio(
    escritorioId,
    async (db) => ({
      lancamentos: await db.lancamento.findMany({
        where: { competencia: { startsWith: `${ano}-` } },
        select: {
          tipo: true,
          competencia: true,
          valorCentavos: true,
          pagoEm: true,
          cobrancaId: true,
        },
      }),
      emAberto: await db.cobranca.findMany({
        where: {
          status: { in: ["ABERTA", "VENCIDA"] },
          vencimento: { gte: de, lt: ate },
        },
        select: { id: true, vencimento: true, valorCentavos: true },
      }),
      meta: await db.meta.findFirst({ where: { ano } }),
    }),
  );

  const meses: MesDoAno[] = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    realizadoCentavos: 0,
    despesasCentavos: 0,
    previstoCentavos: 0,
  }));

  for (const l of lancamentos) {
    const mes = Number(l.competencia.slice(5, 7));
    if (mes < 1 || mes > 12) continue;
    const linha = meses[mes - 1];
    if (l.tipo === "RECEITA") {
      // So com baixa: receita prevista nao e receita.
      if (l.pagoEm) linha.realizadoCentavos += l.valorCentavos;
      else linha.previstoCentavos += l.valorCentavos;
    } else if (l.pagoEm) {
      linha.despesasCentavos += l.valorCentavos;
    }
  }

  // Cobranca em aberto que ja e a parcela prevista de um contrato (o
  // lancamento a receber aponta para ela) nao entra duas vezes no previsto.
  const jaPrevistas = new Set(
    lancamentos.filter((l) => l.tipo === "RECEITA" && !l.pagoEm && l.cobrancaId).map((l) => l.cobrancaId),
  );
  for (const c of emAberto) {
    if (jaPrevistas.has(c.id)) continue;
    meses[c.vencimento.getUTCMonth()].previstoCentavos += c.valorCentavos;
  }

  const soma = (campo: keyof MesDoAno) =>
    meses.reduce((t, m) => t + (m[campo] as number), 0);

  const realizadoCentavos = soma("realizadoCentavos");
  const metaCentavos = meta?.valorCentavos ?? null;

  // Mes corrente (1 a 12) quando o ano e o de hoje; ano passado tem os 12
  // fechados; ano futuro nao tem nenhum.
  const anoDeHoje = Number(hojeISO.slice(0, 4));
  const mesDeHoje = Number(hojeISO.slice(5, 7));
  const fechados = ano < anoDeHoje ? 12 : ano > anoDeHoje ? 0 : mesDeHoje - 1;
  const mediaMensalCentavos = fechados > 0
    ? Math.round(meses.slice(0, fechados).reduce((t, m) => t + m.realizadoCentavos, 0) / fechados)
    : null;
  const projecaoCentavos =
    realizadoCentavos + meses.slice(fechados).reduce((t, m) => t + m.previstoCentavos, 0);

  return {
    ano,
    meses,
    realizadoCentavos,
    despesasCentavos: soma("despesasCentavos"),
    previstoCentavos: soma("previstoCentavos"),
    metaCentavos,
    ritmo: metaCentavos
      ? ritmoDaMeta(metaCentavos, realizadoCentavos, ano, hojeISO)
      : null,
    mediaMensalCentavos,
    projecaoCentavos,
  };
}
