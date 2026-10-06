// Participantes no banco, e quem avisar.
//
// A regra de quem pode entrar na lista mora em participantes.ts, pura e
// testada. Aqui so se grava e se busca.
import { comEscritorio, semEscritorio } from "./prisma";
import { moduloAtivo } from "./modulos";
import { paraE164BR } from "./whatsapp";
import {
  prepararParticipantes,
  ParticipanteInvalido,
  quemAvisar,
  semComoAvisar,
  type ParticipanteLimpo,
} from "./participantes";

export { ParticipanteInvalido };

export type ParticipanteNaTela = {
  id: string;
  clienteId: string | null;
  nomeNaTela: string;
  telefone: string | null;
  email: string | null;
  papel: string | null;
  avisar: boolean;
};

/**
 * Troca a lista inteira de participantes do compromisso.
 *
 * Apaga e grava de novo, como os representantes: a lista e pequena e vem
 * inteira da tela, e tentar casar linha a linha so inventaria casos de borda
 * sem ganhar nada.
 */
export async function salvarParticipantes(
  escritorioId: string,
  compromissoId: string,
  entrada: unknown,
): Promise<number> {
  const limpos: ParticipanteLimpo[] = prepararParticipantes(entrada);

  // Cliente de outro escritorio nao entra: a lista vem da tela, e a tela de
  // um escritorio nao pode apontar para o cadastro de outro.
  const ids = limpos.map((p) => p.clienteId).filter((id): id is string => !!id);
  if (ids.length > 0) {
    const achados = await comEscritorio(escritorioId, (db) =>
      db.cliente.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    );
    if (achados.length !== ids.length) {
      throw new ParticipanteInvalido("Cliente nao encontrado.");
    }
  }

  const doEscritorio = await comEscritorio(escritorioId, (db) =>
    db.compromisso.findFirst({ where: { id: compromissoId }, select: { id: true } }),
  );
  if (!doEscritorio) throw new ParticipanteInvalido("Compromisso nao encontrado.");

  await comEscritorio(escritorioId, (db) =>
    db.participanteDeCompromisso.deleteMany({ where: { compromissoId } }),
  );
  if (limpos.length === 0) return 0;

  await comEscritorio(escritorioId, (db) =>
    db.participanteDeCompromisso.createMany({
      data: limpos.map((p) => semEscritorio({ ...p, compromissoId })),
    }),
  );
  return limpos.length;
}

export async function participantesDoCompromisso(
  escritorioId: string,
  compromissoId: string,
): Promise<ParticipanteNaTela[]> {
  const linhas = await comEscritorio(escritorioId, (db) =>
    db.participanteDeCompromisso.findMany({
      where: { compromissoId },
      orderBy: { criadoEm: "asc" },
      include: { cliente: { select: { nome: true, telefone: true, email: true } } },
    }),
  );

  return linhas.map((p) => ({
    id: p.id,
    clienteId: p.clienteId,
    // O nome do cliente vem do cadastro, sempre: e por isso que nao ha copia.
    nomeNaTela: p.cliente?.nome ?? p.nome ?? "(sem nome)",
    // O contato proprio do participante tem preferencia sobre o do cadastro:
    // quem digitou um telefone ali digitou por algum motivo.
    //
    // O do participante ja foi normalizado ao gravar; o do CADASTRO nao, e
    // chega como a pessoa digitou — "(11) 99999-0000". Mandar isso para o
    // WhatsApp seria mandar para um numero que nao existe. Normaliza aqui.
    telefone: p.telefone ?? paraE164BR(p.cliente?.telefone ?? null),
    email: p.email ?? p.cliente?.email ?? null,
    papel: p.papel,
    avisar: p.avisar,
  }));
}

export type AvisoAoParticipante = {
  participanteId: string;
  nome: string;
  telefone: string | null;
  email: string | null;
};

/**
 * Quem avisar sobre este compromisso, e quem NAO vai ser avisado — com o
 * motivo.
 *
 * O motivo importa mais do que parece. Sem WhatsApp conectado, quem so tem
 * telefone nao recebe nada: a conta de e-mail nao tem para onde mandar e o
 * WhatsApp nao existe. Sem este retorno, o escritorio clicaria em gravar,
 * veria a testemunha na lista, e acharia que ela foi avisada.
 */
export async function paraAvisarNoCompromisso(
  escritorioId: string,
  compromissoId: string,
): Promise<{
  avisar: AvisoAoParticipante[];
  semContato: string[];
  soPorWhatsappDesligado: string[];
}> {
  const lista = await participantesDoCompromisso(escritorioId, compromissoId);
  const comWhatsapp = await moduloAtivo(escritorioId, "WHATSAPP");

  const podem = quemAvisar(lista);
  return {
    avisar: podem
      .filter((p) => p.email || comWhatsapp)
      .map((p) => ({
        participanteId: p.origem.id,
        nome: p.nome,
        telefone: p.telefone,
        email: p.email,
      })),
    semContato: semComoAvisar(lista),
    soPorWhatsappDesligado: comWhatsapp
      ? []
      : podem.filter((p) => !p.email && p.telefone).map((p) => p.nome),
  };
}
