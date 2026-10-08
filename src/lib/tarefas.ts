/**
 * Tarefa do dia a dia, e meta da equipe.
 *
 * Este modulo e so REGRA — nada de banco. O que ele guarda e o que a tela
 * mostra e nao pode errar: o que esta atrasado, em que ordem aparece, e o
 * que vence hoje.
 *
 * TAREFA NAO E PRAZO. Prazo judicial tem termo inicial, numero de dias e
 * contagem em dias uteis com feriado forense, e a data sai de `prazos.ts`.
 * Tarefa tem a data que duas pessoas combinaram. Misturar as duas foi
 * tentador — e seria o jeito de um prazo fatal herdar a frouxidao de um
 * lembrete de ligacao.
 */

export const PRIORIDADES = ["BAIXA", "MEDIA", "ALTA", "URGENTE"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

export const SITUACOES = ["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA"] as const;
export type SituacaoDaTarefa = (typeof SITUACOES)[number];

export const ROTULO_DA_PRIORIDADE: Record<Prioridade, string> = {
  BAIXA: "Baixa",
  MEDIA: "Media",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

export const ROTULO_DA_SITUACAO: Record<SituacaoDaTarefa, string> = {
  PENDENTE: "Pendente",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluida",
};

/** Ordem de gravidade, para ordenar. Maior numero sobe na lista. */
const PESO_DA_PRIORIDADE: Record<Prioridade, number> = {
  URGENTE: 3,
  ALTA: 2,
  MEDIA: 1,
  BAIXA: 0,
};

export type TarefaParaOrdenar = {
  vencimento: Date;
  prioridade: string;
  situacao: string;
};

/** Concluida nunca esta atrasada, por mais que tenha passado da hora. */
export function estaAtrasada(tarefa: TarefaParaOrdenar, agora: Date): boolean {
  if (tarefa.situacao === "CONCLUIDA") return false;
  return tarefa.vencimento.getTime() < agora.getTime();
}

/**
 * Vence hoje, no fuso de quem olha.
 *
 * Comparar so o instante nao serve: "hoje as 17h" ainda nao venceu as 9h,
 * mas precisa aparecer como de hoje desde o comeco do expediente.
 */
export function venceHoje(vencimento: Date, agora: Date): boolean {
  return (
    vencimento.getFullYear() === agora.getFullYear() &&
    vencimento.getMonth() === agora.getMonth() &&
    vencimento.getDate() === agora.getDate()
  );
}

/**
 * A ordem da lista de ativas.
 *
 * Atrasada primeiro, e dentro dela a mais velha no topo — a que esta parada
 * ha mais tempo e a que ninguem viu. Depois, por data; empate de data
 * desempata pela prioridade. Prioridade NAO vence data: uma tarefa "baixa"
 * que vence hoje e mais urgente que uma "alta" da semana que vem, por mais
 * que o rotulo diga o contrario.
 */
export function ordenarAtivas<T extends TarefaParaOrdenar>(
  tarefas: T[],
  agora: Date,
): T[] {
  return [...tarefas].sort((a, b) => {
    const atrasoA = estaAtrasada(a, agora);
    const atrasoB = estaAtrasada(b, agora);
    if (atrasoA !== atrasoB) return atrasoA ? -1 : 1;

    const porData = a.vencimento.getTime() - b.vencimento.getTime();
    if (porData !== 0) return porData;

    return (
      (PESO_DA_PRIORIDADE[b.prioridade as Prioridade] ?? 1) -
      (PESO_DA_PRIORIDADE[a.prioridade as Prioridade] ?? 1)
    );
  });
}

/** Normaliza o que veio de fora, em vez de gravar texto solto na coluna. */
export function prioridadeDe(valor: unknown): Prioridade {
  return PRIORIDADES.includes(valor as Prioridade)
    ? (valor as Prioridade)
    : "MEDIA";
}

export function situacaoDe(valor: unknown): SituacaoDaTarefa {
  return SITUACOES.includes(valor as SituacaoDaTarefa)
    ? (valor as SituacaoDaTarefa)
    : "PENDENTE";
}

/**
 * Busca por texto, sem acento e sem caixa.
 *
 * Procura no titulo, na descricao, no cliente e no numero do processo —
 * porque e assim que a pessoa procura: ela lembra do nome do cliente, nao
 * do titulo que ela mesma escreveu ha tres semanas.
 */
export function combina(
  tarefa: {
    titulo: string;
    descricao?: string | null;
    numeroProcesso?: string | null;
    nomeDoCliente?: string | null;
  },
  termo: string,
): boolean {
  const limpo = normalizar(termo);
  if (!limpo) return true;
  const agulha = [
    tarefa.titulo,
    tarefa.descricao ?? "",
    tarefa.numeroProcesso ?? "",
    tarefa.nomeDoCliente ?? "",
  ]
    .map(normalizar)
    .join(" ");
  // Toda palavra do termo precisa aparecer: quem digita "doctos maria" quer
  // as duas, nao tudo que tem "maria".
  return limpo.split(" ").every((palavra) => agulha.includes(palavra));
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
