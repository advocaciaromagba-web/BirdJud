// A tabela de precos vigente: a padrao do codigo com o que o operador mudou.
//
// Lida pelo plano de controle (a tabela no banco e da plataforma, nao de
// escritorio) e guardada em memoria por 30 segundos: a vitrine e publica e
// nao precisa de uma consulta por visita.
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prismaPlataforma } from "./prisma";
import { FAIXAS, type Faixa } from "./catalogo";
import { PLANOS, type Plano } from "./planos";
import { TABELA_PADRAO, type TabelaDePrecos } from "./precos";
import type { Modulo } from "./modulos";

const ID = "PLATAFORMA";
/** Teto de qualquer preco da tabela: R$ 100.000,00. */
const TETO_CENTAVOS = 10_000_000;
/** Desconto de ciclo vai de 0% a 50%. */
const TETO_DO_DESCONTO = 0.5;

const centavos = z.number().int().min(0).max(TETO_CENTAVOS);
// Mensalidade de plano zerada so por engano (campo apagado): de graca e
// isencao, que tem prazo e registro, nao preco de tabela.
const mensalidade = z.number().int().min(100, "Mensalidade de plano de ao menos R$ 1,00.").max(TETO_CENTAVOS);
const porFaixa = z.object(Object.fromEntries(FAIXAS.map((f) => [f, mensalidade])) as Record<Faixa, typeof mensalidade>);

export const esquemaDaTabela = z.object({
  faixa: porFaixa,
  plano: z.object(Object.fromEntries(PLANOS.map((p) => [p, porFaixa])) as Record<Plano, typeof porFaixa>),
  modulo: z.record(z.string(), centavos),
  descontoAnual: z.number().min(0).max(TETO_DO_DESCONTO),
  descontoTrimestral: z.number().min(0).max(TETO_DO_DESCONTO),
});

export class TabelaInvalida extends Error {
  readonly status = 400;
  constructor(motivo: string) {
    super(motivo);
    this.name = "TabelaInvalida";
  }
}

/**
 * A tabela que vale, a partir do que esta gravado. Campo faltando ou
 * invalido cai no padrao do codigo: uma tabela pela metade nunca deixa a
 * vitrine ou a fatura sem preco.
 */
export function mesclarTabela(gravada: unknown): TabelaDePrecos {
  if (!gravada || typeof gravada !== "object") return TABELA_PADRAO;
  const g = gravada as Partial<Record<keyof TabelaDePrecos, unknown>>;
  const num = (v: unknown, padrao: number, teto: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= teto ? v : padrao;
  const inteiro = (v: unknown, padrao: number) => Math.round(num(v, padrao, TETO_CENTAVOS));
  const faixas = (origem: unknown, padrao: Record<Faixa, number>) =>
    Object.fromEntries(
      FAIXAS.map((f) => [f, inteiro((origem as Record<string, unknown> | undefined)?.[f], padrao[f])]),
    ) as Record<Faixa, number>;
  return {
    faixa: faixas(g.faixa, TABELA_PADRAO.faixa),
    plano: Object.fromEntries(
      PLANOS.map((p) => [p, faixas((g.plano as Record<string, unknown> | undefined)?.[p], TABELA_PADRAO.plano[p])]),
    ) as Record<Plano, Record<Faixa, number>>,
    modulo: Object.fromEntries(
      Object.entries(TABELA_PADRAO.modulo).map(([m, v]) => [
        m,
        inteiro((g.modulo as Record<string, unknown> | undefined)?.[m], v ?? 0),
      ]),
    ) as Partial<Record<Modulo, number>>,
    descontoAnual: num(g.descontoAnual, TABELA_PADRAO.descontoAnual, TETO_DO_DESCONTO),
    descontoTrimestral: num(g.descontoTrimestral, TABELA_PADRAO.descontoTrimestral, TETO_DO_DESCONTO),
  };
}

let cache: { ate: number; tabela: TabelaDePrecos } | null = null;

/** A tabela vigente. Sem nada gravado, a padrao do codigo. */
export async function tabelaVigente(agora = Date.now()): Promise<TabelaDePrecos> {
  if (cache && cache.ate > agora) return cache.tabela;
  const linha = await prismaPlataforma().configuracaoComercial.findUnique({ where: { id: ID } });
  const tabela = mesclarTabela(linha?.tabela);
  cache = { ate: agora + 30_000, tabela };
  return tabela;
}

/** Grava a tabela inteira. Valida antes: preco negativo ou desconto de 90% nao entram. */
export async function salvarTabela(tabela: unknown, quem: string): Promise<TabelaDePrecos> {
  const r = esquemaDaTabela.safeParse(tabela);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new TabelaInvalida(`Valor inválido em ${i.path.join(" › ")}: ${i.message}`);
  }
  // A mensalidade da faixa E o plano Essencial (o nucleo sozinho): os dois
  // andam juntos. Sem isto, mudar so a faixa nao mudaria preco nenhum, porque
  // a conta sempre cobra o menor entre a faixa avulsa e o plano que cobre.
  const limpa = mesclarTabela({ ...r.data, faixa: r.data.plano.ESSENCIAL });
  await prismaPlataforma().configuracaoComercial.upsert({
    where: { id: ID },
    create: { id: ID, tabela: limpa, atualizadaPor: quem },
    update: { tabela: limpa, atualizadaPor: quem },
  });
  cache = null;
  return limpa;
}

/** Volta para a tabela padrao do codigo. */
export async function voltarATabelaPadrao(quem: string): Promise<void> {
  await prismaPlataforma().configuracaoComercial.upsert({
    where: { id: ID },
    create: { id: ID, atualizadaPor: quem },
    update: { tabela: Prisma.DbNull, atualizadaPor: quem },
  });
  cache = null;
}

/** Esquece a tabela em memoria (testes). */
export function esquecerTabela(): void {
  cache = null;
}

/**
 * Reajusta a tabela inteira por um percentual, arredondando cada preco ao
 * real. Os descontos de ciclo nao mudam.
 */
export function reajustarTabela(tabela: TabelaDePrecos, percentual: number): TabelaDePrecos {
  // Pontos-base inteiros, como no reajuste dos contratos (reajuste.ts).
  const fator = Math.round((100 + percentual) * 100);
  const r = (v: number) => Math.round((v * fator) / 1_000_000) * 100;
  const faixas = (o: Record<Faixa, number>) =>
    Object.fromEntries(FAIXAS.map((f) => [f, r(o[f])])) as Record<Faixa, number>;
  return {
    ...tabela,
    faixa: faixas(tabela.faixa),
    plano: Object.fromEntries(PLANOS.map((p) => [p, faixas(tabela.plano[p])])) as Record<Plano, Record<Faixa, number>>,
    modulo: Object.fromEntries(Object.entries(tabela.modulo).map(([m, v]) => [m, r(v ?? 0)])) as Partial<Record<Modulo, number>>,
  };
}
