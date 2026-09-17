// Medicao de consumo por escritorio e competencia.
//
// A franquia de cada metrica vem do modulo contratado (ModuloContratado.
// franquia). O que passa da franquia e excedente e vira linha na fatura —
// a fatura em si e da fase 4; aqui so se mede.
import { comEscritorio } from "./prisma";

export { METRICAS, MODULO_DA_METRICA, type Metrica } from "./catalogo";
import { MODULO_DA_METRICA, type Metrica } from "./catalogo";

export function competenciaDe(data = new Date()): string {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Soma quantidade ao consumo do mes. Idempotente por natureza de acumulo:
 * chamar duas vezes soma duas vezes, entao chame uma vez por evento real.
 */
export async function registrarConsumo(
  escritorioId: string,
  metrica: Metrica,
  quantidade: number,
  competencia = competenciaDe()
): Promise<void> {
  if (quantidade === 0) return;
  await comEscritorio(escritorioId, (db) =>
    db.consumoMensal.upsert({
      where: { escritorioId_competencia_metrica: { escritorioId, competencia, metrica } },
      create: { escritorioId, competencia, metrica, quantidade },
      update: { quantidade: { increment: quantidade } },
    })
  );
}

/** Substitui o valor medido — para metricas de retrato, como REGISTROS. */
export async function definirConsumo(
  escritorioId: string,
  metrica: Metrica,
  quantidade: number,
  competencia = competenciaDe()
): Promise<void> {
  await comEscritorio(escritorioId, (db) =>
    db.consumoMensal.upsert({
      where: { escritorioId_competencia_metrica: { escritorioId, competencia, metrica } },
      create: { escritorioId, competencia, metrica, quantidade },
      update: { quantidade },
    })
  );
}

export type LinhaDeConsumo = {
  metrica: Metrica;
  quantidade: number;
  franquia: number | null;
  excedente: number;
};

/** Consumo do mes com franquia e excedente ja calculados. */
export async function consumoDoMes(
  escritorioId: string,
  competencia = competenciaDe()
): Promise<LinhaDeConsumo[]> {
  const { consumos, modulos } = await comEscritorio(escritorioId, async (db) => ({
    consumos: await db.consumoMensal.findMany({ where: { competencia } }),
    modulos: await db.moduloContratado.findMany({ where: { ativo: true } }),
  }));

  const franquiaPorModulo = new Map(modulos.map((m) => [m.modulo, m.franquia]));

  return consumos
    .map((consumo) => {
      const metrica = consumo.metrica as Metrica;
      const modulo = MODULO_DA_METRICA[metrica];
      const franquia = modulo ? franquiaPorModulo.get(modulo) ?? null : null;
      return {
        metrica,
        quantidade: consumo.quantidade,
        franquia,
        excedente: franquia === null ? 0 : Math.max(0, consumo.quantidade - franquia),
      };
    })
    .sort((a, b) => a.metrica.localeCompare(b.metrica));
}
