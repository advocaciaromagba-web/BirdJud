// Bloqueio dos horarios da agenda no NetLead (04/11/2026, vindo do sistema da
// Advocacia Roma, reescrito aqui).
//
// Quem usa o BirdJud e o NetLead tinha o mesmo problema: a audiencia esta
// marcada aqui, o NetLead nao sabe, e alguma coisa e agendada por cima. Agora
// os horarios ocupados aqui ficam bloqueados la.
//
// So de ida e so de HORARIO: inicio, fim e um rotulo generico ("Audiencia",
// "Atendimento"). Nome de cliente, numero de processo, local, link e
// observacoes nao saem do escritorio — nem dentro do "id" do evento, que e o
// id interno do compromisso. O contrato e so a API HTTP do NetLead.
//
// A foto e completa: o que nao vem na lista e liberado do outro lado. Nao ha
// estado a sincronizar, e reenviar sem necessidade nao estraga nada.
import { comEscritorio, semEscritorio } from "./prisma";
import { cifrar, decifrar } from "./segredo";

const ENDERECO_PADRAO = "https://netlead.com.br";
const TEMPO_LIMITE_MS = 15_000;
export const DIAS_A_FRENTE = 180;
/** Compromisso sem fim cadastrado ocupa 1 hora. */
const DURACAO_PADRAO_MS = 60 * 60 * 1000;
/** Prazo e tarefa tem data, mas nao ocupam a pessoa naquela hora. */
const TIPOS_QUE_OCUPAM = new Set(["COMPROMISSO", "AUDIENCIA", "PERICIA"]);
export const AVISO_CHAVE_INVALIDA = "O NetLead recusou a chave. Gere outra no NetLead e cole aqui.";

const ROTULO: Record<string, string> = { AUDIENCIA: "Audiência", PERICIA: "Perícia", COMPROMISSO: "Atendimento" };

const urlDaAgenda = () => `${(process.env.NETLEAD_URL || ENDERECO_PADRAO).replace(/\/+$/, "")}/api/externo/agenda`;

export type Ocupado = { id: string; tipo: string; inicio: Date; fim: Date | null; concluido?: boolean };
export type EventoNetlead = { id: string; inicio: string; fim: string; tipo: string };

/** O que sai do escritorio. Os testes vigiam esta funcao. */
export function montarEventos(compromissos: Ocupado[]): EventoNetlead[] {
  const eventos: EventoNetlead[] = [];
  for (const c of compromissos) {
    if (!TIPOS_QUE_OCUPAM.has(c.tipo) || c.concluido) continue;
    if (!(c.inicio instanceof Date) || Number.isNaN(c.inicio.getTime())) continue;
    // Fim antes do inicio e cadastro errado: bloqueia a duracao padrao.
    const fim = c.fim && c.fim.getTime() > c.inicio.getTime() ? c.fim : new Date(c.inicio.getTime() + DURACAO_PADRAO_MS);
    eventos.push({ id: `evento-${c.id}`, inicio: c.inicio.toISOString(), fim: fim.toISOString(), tipo: ROTULO[c.tipo] ?? "Compromisso" });
  }
  return eventos;
}

type Chamada = { status: number; dados: Record<string, unknown> | null; erroRede?: string };

async function chamar(metodo: "GET" | "PUT", chave: string, corpo?: unknown): Promise<Chamada> {
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    const r = await fetch(urlDaAgenda(), {
      method: metodo,
      headers: { Authorization: `Bearer ${chave}`, ...(corpo ? { "Content-Type": "application/json" } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: controle.signal,
    });
    return { status: r.status, dados: (await r.json().catch(() => null)) as Record<string, unknown> | null };
  } catch (e) {
    const motivo = (e as Error)?.name === "AbortError" ? "o NetLead não respondeu em 15 segundos" : "não foi possível falar com o NetLead agora";
    return { status: 0, dados: null, erroRede: motivo };
  } finally {
    clearTimeout(limite);
  }
}

export type ResultadoDoTeste = { ok: true; pessoa: string } | { ok: false; chaveInvalida: boolean; erro: string };

export async function testarChave(chave: string): Promise<ResultadoDoTeste> {
  const { status, dados, erroRede } = await chamar("GET", chave);
  if (status === 401) return { ok: false, chaveInvalida: true, erro: AVISO_CHAVE_INVALIDA };
  if (status === 200) {
    const pessoa = typeof dados?.pessoa === "string" ? dados.pessoa.trim() : "";
    return pessoa ? { ok: true, pessoa } : { ok: false, chaveInvalida: false, erro: "O NetLead respondeu sem dizer de quem é a agenda." };
  }
  return { ok: false, chaveInvalida: false, erro: erroRede ?? `O NetLead respondeu HTTP ${status}.` };
}

export type ResultadoDoEnvio =
  | { situacao: "ENVIADO"; eventos: number; bloqueados: number }
  | { situacao: "DESLIGADO" | "SEM_CHAVE" }
  | { situacao: "PAUSADO" | "CHAVE_INVALIDA" | "FALHOU"; erro: string };

/** Manda a foto. Sem banco: cada resposta do NetLead pode ser testada. */
export async function enviarFoto(chave: string, eventos: EventoNetlead[]): Promise<ResultadoDoEnvio> {
  const { status, dados, erroRede } = await chamar("PUT", chave, { eventos });
  if (status === 401) return { situacao: "CHAVE_INVALIDA", erro: AVISO_CHAVE_INVALIDA };
  if (status === 200) return { situacao: "ENVIADO", eventos: eventos.length, bloqueados: Number(dados?.bloqueados) || 0 };
  // Rede ou 5xx: tenta de novo na proxima rodada; nao marca a chave como ruim.
  return { situacao: "FALHOU", erro: erroRede ?? `O NetLead respondeu HTTP ${status}.` };
}

// ---------------------------------------------------------------------------
// Ligado ao banco
// ---------------------------------------------------------------------------

function inicioDeHoje(agora: Date): Date {
  const dia = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return new Date(`${dia}T00:00:00-03:00`);
}

async function lerLigacao(escritorioId: string, usuarioId: string) {
  const l = await comEscritorio(escritorioId, (db) => db.agendaNoNetlead.findFirst({ where: { usuarioId } }));
  if (!l) return null;
  let chave: string | null = null;
  try {
    chave = decifrar<string>(l.chave);
  } catch {
    // Chave ilegivel (SEGREDO_CHAVE trocada): a tela pede para colar de novo.
  }
  return { ...l, chave };
}

/** Monta e manda a agenda de uma pessoa, do banco ate o NetLead. */
export async function enviarAgendaDe(escritorioId: string, usuarioId: string, agora = new Date()): Promise<ResultadoDoEnvio> {
  const l = await lerLigacao(escritorioId, usuarioId);
  if (!l?.chave) return { situacao: "SEM_CHAVE" };
  if (!l.ativo) return { situacao: "DESLIGADO" };
  if (l.erro) return { situacao: "PAUSADO", erro: l.erro };
  const de = inicioDeHoje(agora);
  const ate = new Date(de.getTime() + DIAS_A_FRENTE * 86_400_000);
  const compromissos = await comEscritorio(escritorioId, (db) =>
    db.compromisso.findMany({
      where: { responsavelId: usuarioId, inicio: { gte: de, lte: ate }, tipo: { in: [...TIPOS_QUE_OCUPAM] }, concluido: false },
      select: { id: true, tipo: true, inicio: true, fim: true, concluido: true },
      orderBy: { inicio: "asc" },
    }),
  );
  const r = await enviarFoto(l.chave, montarEventos(compromissos));
  if (r.situacao === "ENVIADO" || r.situacao === "CHAVE_INVALIDA") {
    await comEscritorio(escritorioId, (db) =>
      db.agendaNoNetlead.update({
        where: { id: l.id },
        data: r.situacao === "ENVIADO" ? { enviadoEm: agora, erro: null } : { erro: r.erro },
      }),
    );
  }
  return r;
}

/** A rodada: todo mundo do escritorio que ligou. Uma pessoa nao segura as outras. */
export async function enviarAgendasDoEscritorio(escritorioId: string, so?: string[]): Promise<number> {
  const ligados = await comEscritorio(escritorioId, (db) =>
    db.agendaNoNetlead.findMany({ where: { ativo: true, erro: null, ...(so ? { usuarioId: { in: so } } : {}) }, select: { usuarioId: true } }),
  );
  let enviados = 0;
  for (const l of ligados) {
    try {
      if ((await enviarAgendaDe(escritorioId, l.usuarioId)).situacao === "ENVIADO") enviados += 1;
    } catch (erro) {
      console.error(`netlead ${escritorioId}/${l.usuarioId}: ${(erro as Error).message}`.slice(0, 300));
    }
  }
  return enviados;
}

/** Guarda (ou troca) a chave. Chave nova destrava a pausa por recusa. */
export async function guardarChave(escritorioId: string, usuarioId: string, chave: string) {
  const limpa = chave.trim();
  const dados = { chave: cifrar(limpa), chaveFinal: limpa.slice(-4), erro: null, pessoa: null };
  await comEscritorio(escritorioId, (db) =>
    db.agendaNoNetlead.upsert({ where: { usuarioId }, update: dados, create: semEscritorio({ usuarioId, ...dados }) }),
  );
}

export async function testarChaveGuardada(escritorioId: string, usuarioId: string): Promise<ResultadoDoTeste> {
  const l = await lerLigacao(escritorioId, usuarioId);
  if (!l?.chave) return { ok: false, chaveInvalida: false, erro: "Nenhuma chave do NetLead guardada." };
  const t = await testarChave(l.chave);
  if (t.ok || t.chaveInvalida) {
    await comEscritorio(escritorioId, (db) =>
      db.agendaNoNetlead.update({ where: { id: l.id }, data: t.ok ? { pessoa: t.pessoa, erro: null } : { erro: AVISO_CHAVE_INVALIDA } }),
    );
  }
  return t;
}

/**
 * Liga ou desliga. Ligar espera o primeiro envio (a pessoa esta olhando a
 * tela). Desligar manda uma ultima foto vazia, que libera os horarios la.
 */
export async function ligarOuDesligar(escritorioId: string, usuarioId: string, ativo: boolean): Promise<ResultadoDoEnvio> {
  const l = await lerLigacao(escritorioId, usuarioId);
  if (!l?.chave) return { situacao: "SEM_CHAVE" };
  await comEscritorio(escritorioId, (db) => db.agendaNoNetlead.update({ where: { id: l.id }, data: { ativo } }));
  if (ativo) return enviarAgendaDe(escritorioId, usuarioId);
  const r = await enviarFoto(l.chave, []);
  if (r.situacao === "ENVIADO") await comEscritorio(escritorioId, (db) => db.agendaNoNetlead.update({ where: { id: l.id }, data: { enviadoEm: new Date() } }));
  return r;
}

/** Apaga a ligacao (liberando os horarios antes, se der). */
export async function desligarDeVez(escritorioId: string, usuarioId: string): Promise<void> {
  const l = await lerLigacao(escritorioId, usuarioId);
  if (!l) return;
  if (l.chave && l.ativo) await enviarFoto(l.chave, []).catch(() => null);
  await comEscritorio(escritorioId, (db) => db.agendaNoNetlead.delete({ where: { id: l.id } }));
}

/**
 * Depois de salvar compromisso: avisa em segundo plano, pela fila, quem
 * tinha e quem tem o horario agora. Nunca falha o salvamento.
 */
export async function avisarMudancaNaAgenda(escritorioId: string, responsaveis: (string | null | undefined)[]): Promise<void> {
  const ids = [...new Set(responsaveis.filter((x): x is string => Boolean(x)))];
  if (!ids.length) return;
  try {
    const ligados = await comEscritorio(escritorioId, (db) => db.agendaNoNetlead.count({ where: { usuarioId: { in: ids }, ativo: true } }));
    if (!ligados) return;
    const { enfileirar } = await import("./fila");
    // Alguns segundos de folga: varias mudancas seguidas viram uma foto so.
    await enfileirar("NETLEAD", escritorioId, { usuarios: ids }, new Date(Date.now() + 3000));
  } catch (erro) {
    console.error(`netlead: aviso de mudanca nao enfileirado: ${(erro as Error).message}`.slice(0, 300));
  }
}
