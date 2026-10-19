// O que vem pela frente na agenda de uma pessoa, para o alerta da tela.
// Regras do alerta em alerta-da-agenda.ts.
import { comEscritorio } from "./prisma";
import { TIPOS_DA_AGENDA } from "./natureza";
import { ANTECEDENCIAS_MINUTOS, type ProximoCompromisso } from "./alerta-da-agenda";

/** O que vem nas proximas horas para esta pessoa, e se ela quer som. */
export async function proximosDoUsuario(
  escritorioId: string,
  usuarioId: string,
  agora = new Date(),
): Promise<{ alertaSonoro: boolean; compromissos: ProximoCompromisso[] }> {
  const ate = new Date(agora.getTime() + (ANTECEDENCIAS_MINUTOS[0] + 120) * 60_000);
  const [usuario, compromissos] = await comEscritorio(escritorioId, (db) =>
    Promise.all([
      db.usuario.findFirst({ where: { id: usuarioId }, select: { alertaSonoro: true } }),
      db.compromisso.findMany({
        where: {
          concluido: false,
          tipo: { in: [...TIPOS_DA_AGENDA] },
          inicio: { gt: agora, lte: ate },
          OR: [{ responsavelId: usuarioId }, { responsavelId: null }],
        },
        orderBy: { inicio: "asc" },
        take: 50,
        select: { id: true, titulo: true, tipo: true, inicio: true, local: true, link: true },
      }),
    ]),
  );
  return {
    alertaSonoro: usuario?.alertaSonoro ?? true,
    compromissos: compromissos.map((c) => ({ ...c, inicio: c.inicio.toISOString() })),
  };
}
