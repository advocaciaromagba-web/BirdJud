// Tarefas no banco: criar, listar, concluir, editar e apagar.
//
// A regra de ordem e de atraso mora em tarefas.ts, pura. Aqui se grava.
//
// O responsavel e avisado quando a tarefa fica com ele (avisarTarefaDesignada)
// e lembrado 24 horas antes da entrega e do prazo fatal (gerarAvisos). Quem
// chama enfileira um LEMBRAR para o aviso sair na hora.
import { comEscritorio, semEscritorio } from "./prisma";
import { prioridadeDe, situacaoDe } from "./tarefas";

export class TarefaNaoEncontrada extends Error {
  readonly status = 404;
  constructor() {
    super("Tarefa não encontrada.");
    this.name = "TarefaNaoEncontrada";
  }
}

export type DadosDaTarefa = {
  titulo: string;
  descricao?: string | null;
  vencimento: Date;
  /** Prazo fatal do processo, quando houver. `vencimento` e a entrega interna. */
  prazoFatal?: Date | null;
  prioridade?: string | null;
  responsavelId: string;
  clienteId?: string | null;
  numeroProcesso?: string | null;
  meta?: boolean;
};

/**
 * Liga a tarefa ao processo cadastrado, quando o numero digitado existir.
 *
 * O numero fica guardado de qualquer jeito: processo que ainda nao foi
 * cadastrado e cadastrado depois, e perder o vinculo seria pior que guardar
 * um texto solto.
 */
async function processoDoNumero(
  escritorioId: string,
  numero?: string | null,
): Promise<string | null> {
  const limpo = (numero ?? "").replace(/\D/g, "");
  if (limpo.length < 20) return null;
  const achado = await comEscritorio(escritorioId, (db) =>
    db.processo.findFirst({
      where: { numero: { contains: limpo.slice(0, 7) } },
      select: { id: true, numero: true },
    }),
  );
  if (!achado) return null;
  return achado.numero.replace(/\D/g, "") === limpo ? achado.id : null;
}

export async function criarTarefa(
  escritorioId: string,
  dados: DadosDaTarefa,
  criadoPorId: string,
) {
  const processoId = await processoDoNumero(escritorioId, dados.numeroProcesso);

  const tarefa = await comEscritorio(escritorioId, (db) =>
    db.tarefa.create({
      data: semEscritorio({
        titulo: dados.titulo.trim(),
        descricao: dados.descricao?.trim() || null,
        vencimento: dados.vencimento,
        prazoFatal: dados.prazoFatal ?? null,
        prioridade: prioridadeDe(dados.prioridade),
        responsavelId: dados.responsavelId,
        clienteId: dados.clienteId || null,
        numeroProcesso: dados.numeroProcesso?.trim() || null,
        processoId,
        meta: dados.meta ?? false,
        criadoPorId,
      }),
    }),
  );


  return tarefa;
}

export async function tarefasDoEscritorio(
  escritorioId: string,
  concluidas = false,
) {
  return comEscritorio(escritorioId, (db) =>
    db.tarefa.findMany({
      where: concluidas
        ? { situacao: "CONCLUIDA" }
        : { situacao: { not: "CONCLUIDA" } },
      include: {
        responsavel: { select: { nome: true } },
        cliente: { select: { nome: true } },
        anexos: { select: { id: true, nome: true, tamanhoBytes: true }, orderBy: { criadoEm: "asc" } },
      },
      orderBy: concluidas ? { concluidaEm: "desc" } : { vencimento: "asc" },
      take: concluidas ? 200 : 500,
    }),
  );
}

export async function contarTarefas(escritorioId: string) {
  return comEscritorio(escritorioId, async (db) => ({
    ativas: await db.tarefa.count({ where: { situacao: { not: "CONCLUIDA" } } }),
    concluidas: await db.tarefa.count({ where: { situacao: "CONCLUIDA" } }),
  }));
}

async function exigirTarefa(escritorioId: string, id: string) {
  const achada = await comEscritorio(escritorioId, (db) =>
    db.tarefa.findFirst({ where: { id } }),
  );
  if (!achada) throw new TarefaNaoEncontrada();
  return achada;
}

/** Concluir e reabrir pelo mesmo caminho: errar o clique tem de ter volta. */
export async function mudarSituacao(
  escritorioId: string,
  id: string,
  situacao: string,
) {
  await exigirTarefa(escritorioId, id);
  const nova = situacaoDe(situacao);
  return comEscritorio(escritorioId, (db) =>
    db.tarefa.update({
      where: { id },
      data: {
        situacao: nova,
        concluidaEm: nova === "CONCLUIDA" ? new Date() : null,
      },
    }),
  );
}

export async function editarTarefa(
  escritorioId: string,
  id: string,
  dados: Partial<DadosDaTarefa>,
) {
  const antes = await exigirTarefa(escritorioId, id);
  const processoId =
    dados.numeroProcesso === undefined
      ? undefined
      : await processoDoNumero(escritorioId, dados.numeroProcesso);

  const tarefa = await comEscritorio(escritorioId, (db) =>
    db.tarefa.update({
      where: { id },
      data: {
        ...(dados.titulo !== undefined ? { titulo: dados.titulo.trim() } : {}),
        ...(dados.descricao !== undefined
          ? { descricao: dados.descricao?.trim() || null }
          : {}),
        ...(dados.vencimento !== undefined
          ? { vencimento: dados.vencimento }
          : {}),
        ...(dados.prazoFatal !== undefined ? { prazoFatal: dados.prazoFatal } : {}),
        ...(dados.prioridade !== undefined
          ? { prioridade: prioridadeDe(dados.prioridade) }
          : {}),
        ...(dados.responsavelId !== undefined
          ? { responsavelId: dados.responsavelId }
          : {}),
        ...(dados.clienteId !== undefined
          ? { clienteId: dados.clienteId || null }
          : {}),
        ...(dados.numeroProcesso !== undefined
          ? { numeroProcesso: dados.numeroProcesso?.trim() || null, processoId }
          : {}),
        ...(dados.meta !== undefined ? { meta: dados.meta } : {}),
      },
    }),
  );


  return tarefa;
}

export async function apagarTarefa(escritorioId: string, id: string) {
  await exigirTarefa(escritorioId, id);
  await comEscritorio(escritorioId, (db) => db.tarefa.delete({ where: { id } }));
}
