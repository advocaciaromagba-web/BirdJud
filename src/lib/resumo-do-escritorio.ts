// Os fatos do dia, buscados no banco.
//
// O que dizer e quando calar mora em resumo-do-dia.ts, puro e testado. Aqui so
// se busca.
import { comEscritorio } from "./prisma";
import { hojeNoEscritorio } from "./contas-do-escritorio";
import { diaEmBrasilia, horaBR } from "./datas";
import type { FatosDoDia } from "./resumo-do-dia";
import { diasUteisAte } from "./prazos";
import { calendarioDoEscritorio } from "./prazos-do-escritorio";
import { AVISO_DO_FATAL_EM_DIAS_UTEIS } from "./regua-de-lembretes";

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
  // Quatro dias uteis podem atravessar feriado prolongado e o recesso
  // (20/12 a 20/01): a busca olha longe e quem separa e a conta em dias uteis.
  const limite = new Date(inicioDeHoje.getTime() + 45 * 86_400_000);

  const dados = await comEscritorio(escritorioId, async (db) => ({
    // Prazo mora na tarefa (natureza.ts): o fatal quando ha, senao a entrega.
    prazos: await db.tarefa.findMany({
      where: {
        situacao: { not: "CONCLUIDA" },
        meta: false,
        OR: [
          { prazoFatal: { lt: limite } },
          { prazoFatal: null, vencimento: { lt: limite } },
        ],
      },
      orderBy: { vencimento: "asc" },
      take: 300,
      select: { titulo: true, vencimento: true, prazoFatal: true, numeroProcesso: true },
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

  const calendario = await calendarioDoEscritorio(escritorioId);
  const prazos = dados.prazos.map((p) => {
    const vencimento = diaEmBrasilia(p.prazoFatal ?? p.vencimento);
    return {
      titulo: p.titulo,
      vencimento,
      numeroProcesso: p.numeroProcesso,
      // Dias UTEIS: na sexta, o prazo da segunda e o do proximo dia util.
      uteis: vencimento > hoje ? diasUteisAte(hoje, vencimento, calendario) : 0,
    };
  });
  const semConta = ({ uteis: _u, ...p }: (typeof prazos)[number]) => p;

  return {
    prazosVencidos: prazos.filter((p) => p.vencimento < hoje).map(semConta),
    prazosHoje: prazos.filter((p) => p.vencimento === hoje).map(semConta),
    prazosAmanha: prazos.filter((p) => p.vencimento > hoje && p.uteis <= 1).map(semConta),
    prazosProximos: prazos
      .filter((p) => p.vencimento > hoje && p.uteis > 1 && p.uteis <= AVISO_DO_FATAL_EM_DIAS_UTEIS)
      .map(semConta),
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
