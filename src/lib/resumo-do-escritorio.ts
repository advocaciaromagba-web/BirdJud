// Os fatos do dia, buscados no banco.
//
// O que dizer e quando calar mora em resumo-do-dia.ts, puro e testado. Aqui so
// se busca.
import { comEscritorio } from "./prisma";
import { hojeNoEscritorio } from "./contas-do-escritorio";
import { horaBR } from "./datas";
import type { FatosDoDia } from "./resumo-do-dia";

function emISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** O dia seguinte, em "AAAA-MM-DD". */
function amanhaDe(hojeISO: string): string {
  const d = new Date(`${hojeISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return emISO(d);
}

/**
 * Junta o que o dia reserva no escritorio.
 *
 * Prazo e compromisso de TODO o escritorio, nao so de quem recebe: um prazo
 * sem responsavel marcado nao pode sumir do resumo de todo mundo e virar
 * problema de ninguem.
 */
export async function fatosDoDia(
  escritorioId: string,
  agora = new Date(),
): Promise<FatosDoDia> {
  const hoje = hojeNoEscritorio(agora);
  const amanha = amanhaDe(hoje);

  const inicioDeHoje = new Date(`${hoje}T00:00:00Z`);
  const inicioDeAmanha = new Date(`${amanha}T00:00:00Z`);
  const inicioDeDepois = new Date(`${amanhaDe(amanha)}T00:00:00Z`);

  const dados = await comEscritorio(escritorioId, async (db) => ({
    prazos: await db.prazo.findMany({
      where: {
        cumpridoEm: null,
        vencimento: { lt: inicioDeDepois },
      },
      orderBy: { vencimento: "asc" },
      take: 100,
      include: { processo: { select: { numero: true } } },
    }),
    compromissos: await db.compromisso.findMany({
      where: {
        concluido: false,
        inicio: { gte: inicioDeHoje, lt: inicioDeAmanha },
      },
      orderBy: { inicio: "asc" },
      take: 50,
    }),
    audienciasAmanha: await db.compromisso.count({
      where: {
        concluido: false,
        tipo: "AUDIENCIA",
        inicio: { gte: inicioDeAmanha, lt: inicioDeDepois },
      },
    }),
    publicacoesNovas: await db.publicacao.count({
      where: { lida: false, arquivada: false },
    }),
  }));

  const comoPrazo = (p: (typeof dados.prazos)[number]) => ({
    titulo: p.titulo,
    vencimento: emISO(p.vencimento),
    numeroProcesso: p.processo?.numero ?? null,
  });

  return {
    prazosVencidos: dados.prazos.filter((p) => emISO(p.vencimento) < hoje).map(comoPrazo),
    prazosHoje: dados.prazos.filter((p) => emISO(p.vencimento) === hoje).map(comoPrazo),
    prazosAmanha: dados.prazos.filter((p) => emISO(p.vencimento) === amanha).map(comoPrazo),
    compromissosHoje: dados.compromissos.map((c) => ({
      titulo: c.titulo,
      tipo: c.tipo,
      hora: horaBR.format(c.inicio),
      local: c.local,
    })),
    audienciasAmanha: dados.audienciasAmanha,
    publicacoesNovas: dados.publicacoesNovas,
  };
}
