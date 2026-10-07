// Textos dos avisos. Separados do envio para poderem ser testados e revistos
// sem tocar em SMTP — e porque e aqui que mora o tom com que o escritorio fala
// com a propria equipe.
import { formatarNumeroProcesso } from "./leitura-publicacao";
import { dataHoraBR as dataHora } from "./datas";

export type PublicacaoNoResumo = {
  numeroProcesso: string | null;
  tribunal: string | null;
  urgente: boolean;
  prazoDias: number | null;
  texto: string;
};

export type CompromissoNoLembrete = {
  titulo: string;
  tipo: string;
  inicio: Date;
  local: string | null;
  numeroProcesso: string | null;
};

function recortar(texto: string, limite = 220): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length <= limite ? limpo : `${limpo.slice(0, limite)}…`;
}

export function assuntoDoResumo(quantidade: number, urgentes: number): string {
  const base = `${quantidade} publicac${quantidade === 1 ? "ao" : "oes"} nova${quantidade === 1 ? "" : "s"}`;
  // A urgencia vai no assunto: e o que decide se a pessoa abre agora ou depois.
  return urgentes > 0 ? `[URGENTE] ${base}` : base;
}

export function corpoDoResumo(
  nomeEscritorio: string,
  publicacoes: PublicacaoNoResumo[],
  endereco: string,
): string {
  const urgentes = publicacoes.filter((p) => p.urgente);
  const demais = publicacoes.filter((p) => !p.urgente);

  const linhas: string[] = [`${nomeEscritorio} — publicacoes do dia`, ""];

  if (urgentes.length > 0) {
    linhas.push(`URGENTE (${urgentes.length}):`, "");
    for (const publicacao of urgentes) linhas.push(...item(publicacao));
  }
  if (demais.length > 0) {
    linhas.push(`Demais (${demais.length}):`, "");
    for (const publicacao of demais) linhas.push(...item(publicacao));
  }

  linhas.push(
    "Abra o sistema para ler o texto completo e marcar como lida:",
    endereco,
    "",
    "O prazo indicado e leitura automatica do texto e serve como alerta —",
    "confira sempre nos autos.",
  );

  return linhas.join("\n");
}

function item(publicacao: PublicacaoNoResumo): string[] {
  const numero = publicacao.numeroProcesso
    ? formatarNumeroProcesso(publicacao.numeroProcesso)
    : "sem numero de processo";
  const prazo =
    publicacao.prazoDias !== null
      ? ` · prazo indicado: ${publicacao.prazoDias} dia(s)`
      : "";
  return [
    `- ${numero}${publicacao.tribunal ? ` (${publicacao.tribunal})` : ""}${prazo}`,
    `  ${recortar(publicacao.texto)}`,
    "",
  ];
}

export function assuntoDoLembrete(compromisso: CompromissoNoLembrete): string {
  return `Lembrete: ${compromisso.titulo} em ${dataHora.format(compromisso.inicio)}`;
}

export function corpoDoLembrete(
  nomeEscritorio: string,
  compromisso: CompromissoNoLembrete,
  endereco: string,
): string {
  const linhas = [
    `${nomeEscritorio} — lembrete de compromisso`,
    "",
    compromisso.titulo,
    `${compromisso.tipo} · ${dataHora.format(compromisso.inicio)}`,
  ];

  if (compromisso.local) linhas.push(`Local: ${compromisso.local}`);
  if (compromisso.numeroProcesso) {
    linhas.push(
      `Processo: ${formatarNumeroProcesso(compromisso.numeroProcesso)}`,
    );
  }

  linhas.push("", "Agenda completa:", endereco);
  return linhas.join("\n");
}

/**
 * O lembrete para quem vai ao compromisso, e nao trabalha no escritorio.
 *
 * Texto diferente do que vai para a equipe, de proposito. Quem recebe e o
 * cliente, a testemunha, o conjuge: precisa saber ONDE e QUANDO estar, nao o
 * que o escritorio chamou aquilo internamente. E nao leva link do sistema, que
 * essa pessoa nao tem como abrir.
 */
export function corpoDoLembreteAoParticipante(
  nomeEscritorio: string,
  nomeDoParticipante: string,
  compromisso: CompromissoNoLembrete,
): string {
  const linhas = [
    `${nomeDoParticipante}, o escritorio ${nomeEscritorio} lembra:`,
    "",
    `${compromisso.titulo} — ${dataHora.format(compromisso.inicio)}`,
  ];

  if (compromisso.local) linhas.push(`Local: ${compromisso.local}`);
  if (compromisso.numeroProcesso) {
    linhas.push(`Processo: ${formatarNumeroProcesso(compromisso.numeroProcesso)}`);
  }

  linhas.push("", "Em caso de duvida, fale com o escritorio.");
  return linhas.join("\n");
}

export function assuntoDoLembreteAoParticipante(
  nomeEscritorio: string,
  compromisso: CompromissoNoLembrete,
): string {
  return `${nomeEscritorio}: lembrete de ${compromisso.titulo.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Avisos que saem NA HORA, e nao pela regua
// ---------------------------------------------------------------------------

/**
 * A tarefa que acabou de ficar com alguem.
 *
 * Vai para a pessoa designada, e so para ela. Tarefa que chega para o
 * escritorio inteiro e tarefa que cada um acha que e do outro.
 */
export function assuntoDaDesignacao(compromisso: CompromissoNoLembrete): string {
  return `Ficou com voce: ${compromisso.titulo}`;
}

export function corpoDaDesignacao(
  nomeEscritorio: string,
  nomeDeQuemDesignou: string | null,
  compromisso: CompromissoNoLembrete,
  endereco: string,
): string {
  const linhas = [
    `${nomeEscritorio} — ${nomeDeQuemDesignou ? `${nomeDeQuemDesignou} designou` : "foi designado"} para voce:`,
    "",
    compromisso.titulo,
    `${compromisso.tipo} · ${dataHora.format(compromisso.inicio)}`,
  ];

  if (compromisso.local) linhas.push(`Local: ${compromisso.local}`);
  if (compromisso.numeroProcesso) {
    linhas.push(`Processo: ${formatarNumeroProcesso(compromisso.numeroProcesso)}`);
  }

  linhas.push("", "Abra o sistema:", endereco);
  return linhas.join("\n");
}

/**
 * O agendamento que acabou de ser marcado, para quem vai comparecer.
 *
 * Nao e lembrete: e a PRIMEIRA noticia. Por isso diz quando sao os lembretes
 * — quem recebe precisa saber que vai ser lembrado, senao fica com a data na
 * cabeca e nada mais.
 */
export function assuntoDoAgendamento(
  nomeEscritorio: string,
  compromisso: CompromissoNoLembrete,
): string {
  return `${nomeEscritorio}: ${compromisso.titulo.toLowerCase()} marcada`;
}

export function corpoDoAgendamento(
  nomeEscritorio: string,
  nomeDoParticipante: string,
  compromisso: CompromissoNoLembrete,
): string {
  const linhas = [
    `${nomeDoParticipante}, o escritorio ${nomeEscritorio} marcou:`,
    "",
    `${compromisso.titulo} — ${dataHora.format(compromisso.inicio)}`,
  ];

  if (compromisso.local) linhas.push(`Local: ${compromisso.local}`);
  if (compromisso.numeroProcesso) {
    linhas.push(`Processo: ${formatarNumeroProcesso(compromisso.numeroProcesso)}`);
  }

  linhas.push(
    "",
    "Voce recebera lembretes 3 dias antes, 1 dia antes e 1 hora antes.",
    "Em caso de duvida, fale com o escritorio.",
  );
  return linhas.join("\n");
}
