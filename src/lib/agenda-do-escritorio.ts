// A agenda por dentro: o que acontece com um compromisso depois de criado.
//
// Criar fica na rota (src/app/api/compromissos/route.ts), com as regras de
// cliente e tarefa de src/lib/compromissos.ts. Aqui mora o resto: editar,
// apagar, arquivar o que venceu — e, em cada um, o rastro que a auditoria
// precisa deixar.
//
// A regra que atravessa tudo: NADA SOME SEM REGISTRO. Compromisso apagado
// vira linha em CompromissoExcluido; aviso pendente de compromisso apagado e
// cancelado, nao deletado; aviso ja enviado fica como esta, porque e a prova
// de que a pessoa foi avisada.
import { comEscritorio, semEscritorio } from "./prisma";
import { TIPOS_COM_REGUA } from "./regua-de-lembretes";
import { ROTULO_DO_TIPO_DE_AVISO, TIPOS_DE_AVISO_DA_AGENDA } from "./agenda-rotulos";

/**
 * Quanto tempo depois do horario marcado o compromisso pode ser arquivado.
 *
 * Audiencia atrasa, pericia se estende. Arquivar na hora exata faria o
 * compromisso sumir da agenda no meio dele — e quem esta no forum olhando o
 * celular nao encontraria o link da sala.
 */
export const HORAS_DE_SEGURANCA = 4;

export {
  ROTULO_DO_ESTADO,
  ROTULO_DO_TIPO_DE_AVISO,
  TEXTO_DO_MOTIVO,
  TIPOS_DE_AVISO_DA_AGENDA,
  type MotivoDaExclusao,
} from "./agenda-rotulos";

export class CompromissoNaoEncontrado extends Error {
  constructor() {
    super("Compromisso nao encontrado.");
  }
}

const COM_TUDO = {
  processo: { select: { numero: true } },
  cliente: { select: { nome: true } },
  responsavel: { select: { nome: true } },
  participantes: {
    orderBy: { criadoEm: "asc" as const },
    include: { cliente: { select: { nome: true } } },
  },
} as const;

export type CamposEditaveis = {
  titulo?: string;
  tipo?: string;
  inicio?: Date;
  fim?: Date | null;
  local?: string | null;
  link?: string | null;
  observacoes?: string | null;
  processoId?: string | null;
  clienteId?: string | null;
  responsavelId?: string | null;
  concluido?: boolean;
};

/**
 * Altera o compromisso. Devolve se a DATA mudou: quando muda, os lembretes
 * ja gerados para a data velha nao servem mais — quem chama decide o que
 * fazer com isso (ver cancelarLembretesPendentes).
 */
export async function editarCompromisso(
  escritorioId: string,
  id: string,
  campos: CamposEditaveis,
): Promise<{ mudouAData: boolean }> {
  return comEscritorio(escritorioId, async (db) => {
    const atual = await db.compromisso.findFirst({ where: { id } });
    if (!atual) throw new CompromissoNaoEncontrado();

    if (campos.processoId) {
      const processo = await db.processo.findFirst({ where: { id: campos.processoId } });
      if (!processo) throw new Error("Processo nao encontrado.");
    }
    if (campos.clienteId) {
      const cliente = await db.cliente.findFirst({ where: { id: campos.clienteId } });
      if (!cliente) throw new Error("Cliente nao encontrado.");
    }
    if (campos.responsavelId) {
      const pessoa = await db.usuario.findFirst({
        where: { id: campos.responsavelId, ativo: true },
      });
      if (!pessoa) throw new Error("Responsavel nao encontrado.");
    }

    await db.compromisso.update({ where: { id }, data: campos });

    const mudouAData =
      campos.inicio !== undefined &&
      campos.inicio.getTime() !== atual.inicio.getTime();

    // Lembrete gerado para a data velha diria a hora errada. Cancelar e
    // deixar a regua gerar de novo para a data nova — a chave leva o marco
    // e o compromisso, nao a data, entao e preciso soltar a chave velha.
    if (mudouAData) await cancelarLembretesPendentes(db, id, "data alterada");

    return { mudouAData };
  });
}

type Db = Parameters<Parameters<typeof comEscritorio>[1]>[0];

/**
 * Aviso pendente vira CANCELADO — nunca e apagado. A chave e trocada para
 * liberar a original: a regua, na proxima rodada, grava o lembrete certo
 * com a chave de sempre.
 */
async function cancelarLembretesPendentes(
  db: Db,
  compromissoId: string,
  motivo: string,
): Promise<number> {
  const pendentes = await db.aviso.findMany({
    where: { compromissoId, estado: "PENDENTE" },
    select: { id: true, chave: true },
  });
  for (const a of pendentes) {
    await db.aviso.update({
      where: { id: a.id },
      data: {
        estado: "CANCELADO",
        erro: `Cancelado: ${motivo}.`,
        chave: `cancelado:${a.id}:${a.chave}`.slice(0, 200),
      },
    });
  }
  return pendentes.length;
}

/**
 * Apaga o compromisso, deixando o registro de auditoria.
 *
 * Os avisos ja enviados NAO sao desfeitos: a pessoa recebeu, e isso
 * aconteceu. Se o escritorio precisar desmarcar com o cliente, avisa — o
 * sistema nao finge que o aviso nao saiu.
 */
export async function excluirCompromisso(
  escritorioId: string,
  id: string,
  quem: { usuarioId: string | null; nome: string | null },
): Promise<void> {
  await comEscritorio(escritorioId, async (db) => {
    const c = await db.compromisso.findFirst({ where: { id }, include: COM_TUDO });
    if (!c) throw new CompromissoNaoEncontrado();

    await cancelarLembretesPendentes(db, id, "compromisso excluido");
    await db.compromissoExcluido.create({
      data: semEscritorio({
        ...retrato(c),
        motivo: "EXCLUIDO",
        excluidoPorId: quem.usuarioId,
        nomeDeQuemExcluiu: quem.nome,
      }),
    });
    await db.compromisso.delete({ where: { id } });
  });
}

/** O que o compromisso era, no formato da auditoria. */
function retrato(c: {
  id: string;
  titulo: string;
  tipo: string;
  inicio: Date;
  fim: Date | null;
  local: string | null;
  link: string | null;
  processo: { numero: string | null } | null;
  cliente: { nome: string } | null;
  responsavel: { nome: string } | null;
  participantes: { nome: string | null; cliente: { nome: string } | null }[];
}) {
  return {
    compromissoId: c.id,
    titulo: c.titulo,
    tipo: c.tipo,
    inicio: c.inicio,
    fim: c.fim,
    local: c.local,
    link: c.link,
    numeroProcesso: c.processo?.numero ?? null,
    nomeDoCliente: c.cliente?.nome ?? null,
    nomeDoResponsavel: c.responsavel?.nome ?? null,
    participantes: c.participantes
      .map((p) => p.cliente?.nome ?? p.nome ?? "")
      .filter(Boolean),
  };
}

/**
 * Arquiva o que venceu: audiencia, pericia e reuniao cujo horario passou ha
 * mais de HORAS_DE_SEGURANCA. Sai da agenda e entra na auditoria.
 *
 * PRAZO e TAREFA ficam. Prazo vencido nao e historia, e problema: tem de
 * continuar na frente de alguem ate ser dado como cumprido. Esses saem pela
 * conclusao, nunca pelo relogio.
 */
export async function arquivarVencidos(
  escritorioId: string,
  agora = new Date(),
): Promise<{ arquivados: number; titulos: string[] }> {
  const limite = new Date(agora.getTime() - HORAS_DE_SEGURANCA * 60 * 60 * 1000);

  return comEscritorio(escritorioId, async (db) => {
    const vencidos = await db.compromisso.findMany({
      where: {
        tipo: { in: [...TIPOS_COM_REGUA] },
        OR: [{ fim: { lt: limite } }, { fim: null, inicio: { lt: limite } }],
      },
      include: COM_TUDO,
      take: 200,
    });

    for (const c of vencidos) {
      await cancelarLembretesPendentes(db, c.id, "compromisso vencido");
      await db.compromissoExcluido.create({
        data: semEscritorio({ ...retrato(c), motivo: "VENCIDO" }),
      });
      await db.compromisso.delete({ where: { id: c.id } });
    }

    return { arquivados: vencidos.length, titulos: vencidos.map((c) => c.titulo) };
  });
}

/** A auditoria: o que saiu da agenda, do mais recente para o mais antigo. */
export async function excluidosDoEscritorio(escritorioId: string) {
  return comEscritorio(escritorioId, (db) =>
    db.compromissoExcluido.findMany({
      orderBy: { excluidoEm: "desc" },
      take: 300,
    }),
  );
}


/**
 * A prova de envio: todo aviso de compromisso, com destino, hora e desfecho.
 *
 * Inclui os cancelados e os que falharam. Auditoria que so mostra sucesso
 * nao e auditoria — a pergunta que ela responde e "a pessoa foi avisada?",
 * e "tentamos e falhou" e uma resposta.
 */
export async function notificacoesDaAgenda(escritorioId: string) {
  const avisos = await comEscritorio(escritorioId, (db) =>
    db.aviso.findMany({
      where: { tipo: { in: [...TIPOS_DE_AVISO_DA_AGENDA] } },
      orderBy: { criadoEm: "desc" },
      take: 300,
      include: {
        usuario: { select: { nome: true } },
        compromisso: {
          select: {
            id: true,
            titulo: true,
            tipo: true,
            inicio: true,
            responsavel: { select: { nome: true } },
            cliente: { select: { nome: true } },
            participantes: {
              select: {
                nome: true,
                telefone: true,
                email: true,
                cliente: { select: { nome: true, telefone: true, email: true } },
              },
            },
          },
        },
      },
    }),
  );

  return avisos.map((a) => ({
    id: a.id,
    canal: a.canal,
    tipo: a.tipo,
    rotulo: ROTULO_DO_TIPO_DE_AVISO[a.tipo] ?? a.tipo,
    destino: a.destino,
    destinatario: nomeDoDestinatario(a),
    assunto: a.assunto,
    corpo: a.corpo,
    estado: a.estado,
    erro: a.erro,
    tentativas: a.tentativas,
    criadoEm: a.criadoEm,
    enviadoEm: a.enviadoEm,
    idNaMeta: a.idNaMeta,
    entregueEm: a.entregueEm,
    lidoEm: a.lidoEm,
    compromisso: a.compromisso
      ? {
          id: a.compromisso.id,
          titulo: a.compromisso.titulo,
          tipo: a.compromisso.tipo,
          inicio: a.compromisso.inicio,
          nomeDoResponsavel: a.compromisso.responsavel?.nome ?? null,
          nomeDoCliente: a.compromisso.cliente?.nome ?? null,
        }
      : null,
  }));
}

/** So os digitos, para "+55 (16) 99999-0001" e "5516999990001" serem o mesmo numero. */
function digitos(texto: string | null | undefined): string {
  return (texto ?? "").replace(/\D/g, "");
}

/** O mesmo telefone, com ou sem o 55 na frente. */
function mesmoTelefone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = digitos(a);
  const y = digitos(b);
  if (x.length < 8 || y.length < 8) return false;
  return x.endsWith(y) || y.endsWith(x);
}

/**
 * Quem recebeu, pelo nome — casando telefone ou e-mail com os participantes.
 * O destino e gravado ja no formato de envio; o cadastro guarda como a pessoa
 * digitou. Por isso a comparacao e pelos digitos, nao pelo texto.
 */
export function nomeDoDestinatario(a: {
  destino: string;
  usuario: { nome: string } | null;
  compromisso: {
    participantes: {
      nome: string | null;
      telefone: string | null;
      email: string | null;
      cliente: { nome: string; telefone: string | null; email: string | null } | null;
    }[];
  } | null;
}): string {
  if (a.usuario) return a.usuario.nome;
  const alvo = a.destino.trim().toLowerCase();
  for (const p of a.compromisso?.participantes ?? []) {
    const emails = [p.email, p.cliente?.email].map((e) => e?.trim().toLowerCase());
    if (
      emails.includes(alvo) ||
      mesmoTelefone(p.telefone, a.destino) ||
      mesmoTelefone(p.cliente?.telefone, a.destino)
    ) {
      return p.cliente?.nome ?? p.nome ?? "—";
    }
  }
  return "—";
}
