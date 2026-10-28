// Agenda x tarefa: a regra que separa as duas, pura e testada.
//
//   AGENDA  e onde alguem precisa ESTAR: audiencia, pericia, atendimento,
//           reuniao. Tem dia e hora, e faltar nao tem conserto.
//   TAREFA  e onde alguem precisa ESCREVER ou PROVIDENCIAR: inicial,
//           manifestacao, contestacao, recurso. Tem data de entrega e prazo
//           fatal.
//
// As duas telas se recusam a guardar o que e da outra. Misturar faz a
// audiencia sumir no meio das pecas — ou a contestacao virar "compromisso"
// sem prazo fatal, que e o pior dos dois mundos.

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Os unicos tipos que a agenda aceita. */
export const TIPOS_DA_AGENDA = ["AUDIENCIA", "PERICIA", "COMPROMISSO"] as const;
export type TipoDaAgenda = (typeof TIPOS_DA_AGENDA)[number];

export const ROTULO_DO_TIPO_DA_AGENDA: Record<TipoDaAgenda, string> = {
  AUDIENCIA: "Audiência",
  PERICIA: "Perícia",
  COMPROMISSO: "Atendimento / reunião",
};

export function ehTipoDaAgenda(tipo: string): tipo is TipoDaAgenda {
  return (TIPOS_DA_AGENDA as readonly string[]).includes(tipo);
}

/** O que so acontece com alguem presente. */
const DE_AGENDA = [
  "audiencia",
  "pericia",
  "atendimento",
  "reuniao",
  "sessao de julgamento",
  "conciliacao",
  "mediacao",
  "oitiva",
  "depoimento",
  "interrogatorio",
  "inspecao judicial",
  "vistoria",
];

/** O que e trabalho de escrever ou providenciar. */
const DE_TAREFA = [
  "inicial",
  "peticao",
  "peticion",
  "manifest",
  "contest",
  "recurso",
  "recorr",
  "apelacao",
  "agravo",
  "embargos",
  "contrarrazoes",
  "razoes",
  "alegacoes finais",
  "memoriais",
  "replica",
  "impugn",
  "quesito",
  "minuta",
  "protocolar",
  "juntar",
  "juntada",
];

export type Natureza = "AGENDA" | "TAREFA";

/**
 * A natureza que o TITULO deixa clara, ou null quando nao da para dizer
 * (ou quando diz as duas: "quesitos para a pericia" e tarefa sobre uma
 * pericia — ai quem decide e a tela onde a pessoa esta).
 */
export function naturezaDoTitulo(titulo: string): Natureza | null {
  const t = semAcento(titulo.toLowerCase());
  const agenda = DE_AGENDA.some((p) => t.includes(p));
  const tarefa = DE_TAREFA.some((p) => t.includes(p));
  if (agenda && !tarefa) return "AGENDA";
  if (tarefa && !agenda) return "TAREFA";
  return null;
}

export const NA_AGENDA_NAO =
  "Isso é uma tarefa (peça, manifestação, recurso), não um compromisso. Cadastre em Tarefas: lá ela ganha data de entrega e prazo fatal.";

export const EM_TAREFAS_NAO =
  "Audiência, perícia e atendimento vão na Agenda, não em Tarefas: lá eles ganham os lembretes de 3 dias, 24 horas e 1 hora, para o escritório e para o cliente.";

/** Recusa para a agenda, ou null quando pode gravar. */
export function recusaDaAgenda(tipo: string, titulo: string): string | null {
  if (!ehTipoDaAgenda(tipo)) return NA_AGENDA_NAO;
  return naturezaDoTitulo(titulo) === "TAREFA" ? NA_AGENDA_NAO : null;
}

/** Recusa para tarefas, ou null quando pode gravar. */
export function recusaDeTarefa(titulo: string): string | null {
  return naturezaDoTitulo(titulo) === "AGENDA" ? EM_TAREFAS_NAO : null;
}
