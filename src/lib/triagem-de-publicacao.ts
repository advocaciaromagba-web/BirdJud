// O que fazer com uma publicacao: agendar ou trabalhar.
//
// A REGRA DO ESCRITORIO, em uma linha: o que exige ESTAR em algum lugar vira
// AGENDAMENTO; o que exige ESCREVER alguma coisa vira TAREFA.
//
//   audiencia, pericia, atendimento   -> AGENDAMENTO
//   peticionar, manifestar, contestar -> TAREFA
//
// E ha uma segunda regra, que e a que evita perda de direito: o prazo FATAL
// vai preenchido, mas a data sugerida para trabalhar fica TRES DIAS UTEIS
// ANTES dele. Marcar a tarefa para o dia do vencimento e marcar para o dia em
// que nao da mais para errar.
//
// ESTE ARQUIVO NAO CALCULA DATA. Ele classifica e diz quantos dias o texto
// menciona; quem transforma isso em data e prazos.ts, com o calendario do
// escritorio — pelo mesmo motivo de sempre: prazo errado nao tem conserto, e
// a conta tem de estar em um lugar so, com teste.

export const ESPECIES_DE_TRIAGEM = ["AGENDAMENTO", "TAREFA"] as const;
export type EspecieDeTriagem = (typeof ESPECIES_DE_TRIAGEM)[number];

/** Quantos dias uteis antes do fatal o sistema sugere tratar. */
export const ANTECEDENCIA_SUGERIDA_DIAS = 3;

function semAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Atos em que alguem precisa COMPARECER.
 *
 * Conciliacao, mediacao e instrucao entram porque sao audiencia com outro
 * nome, e quem recebe a publicacao nao vai traduzir isso para o sistema.
 */
const ATOS_DE_AGENDAMENTO = [
  "audiencia",
  "pericia",
  "perito",
  "atendimento",
  "sessao de julgamento",
  "sessao virtual",
  "conciliacao",
  "mediacao",
  "instrucao e julgamento",
  "interrogatorio",
  "depoimento pessoal",
  "oitiva",
  "inspecao judicial",
  "vistoria",
  "avaliacao medica",
  "pregao",
];

/** Atos em que alguem precisa ESCREVER. */
const ATOS_DE_TAREFA = [
  "manifest",
  "contest",
  "impugn",
  "peticion",
  "peticao",
  "recurso",
  "recorr",
  "contrarrazoes",
  "razoes finais",
  "alegacoes finais",
  "embargos",
  "apelacao",
  "agravo",
  "replica",
  "especificar provas",
  "emenda a inicial",
  "emende",
  "junte",
  "juntada",
  "comprove",
  "cumpra",
  "providencie",
  "informe",
  "esclareca",
  "pagamento das custas",
  "preparo",
];

/**
 * A especie pelo texto, sem IA.
 *
 * Nao e para substituir a leitura do modelo: e o chao. Quando a IA nao esta
 * contratada, esta fora do ar ou devolve algo fora do formato, a publicacao
 * ainda chega na tela com uma sugestao — e sugestao simples e melhor que
 * nenhuma, porque o que nao aparece na tela nao e feito.
 *
 * AGENDAMENTO vence o empate de proposito: perder uma audiencia custa mais
 * que escrever uma peca um dia antes.
 */
export function especiePeloTexto(texto: string): EspecieDeTriagem | null {
  const limpo = semAcento(texto);
  const agenda = ATOS_DE_AGENDAMENTO.some((a) => limpo.includes(a));
  if (agenda) return "AGENDAMENTO";
  const tarefa = ATOS_DE_TAREFA.some((a) => limpo.includes(a));
  if (tarefa) return "TAREFA";
  return null;
}

/** O tipo de compromisso que cada especie gera na agenda. */
export function tipoDoCompromisso(
  especie: EspecieDeTriagem,
  texto: string,
): "AUDIENCIA" | "PERICIA" | "COMPROMISSO" | "TAREFA" {
  if (especie === "TAREFA") return "TAREFA";
  const limpo = semAcento(texto);
  if (limpo.includes("pericia") || limpo.includes("perito")) return "PERICIA";
  if (limpo.includes("audiencia")) return "AUDIENCIA";
  return "COMPROMISSO";
}

/**
 * Prazo processual conta em dias uteis; prazo penal, em dias corridos.
 *
 * CPC 219 contra CPP 798. Sem distinguir, um prazo de cinco dias em processo
 * criminal sairia uma semana depois do que vence de verdade.
 */
export function contagemPeloTexto(texto: string): "UTEIS" | "CORRIDOS" {
  const limpo = semAcento(texto);
  const criminal = [
    "vara criminal",
    "juizado especial criminal",
    "execucao penal",
    "codigo de processo penal",
    "acao penal",
    "denuncia",
    "inquerito",
  ];
  return criminal.some((t) => limpo.includes(t)) ? "CORRIDOS" : "UTEIS";
}

export type Sugestao = {
  especie: EspecieDeTriagem;
  tipo: "AUDIENCIA" | "PERICIA" | "COMPROMISSO" | "TAREFA";
  titulo: string;
  resumo: string;
  prazoDias: number | null;
  contagem: "UTEIS" | "CORRIDOS";
  /** Data e hora do ato, quando o proprio texto marca. */
  dataDoAto: string | null;
  confianca: "ALTA" | "MEDIA" | "BAIXA";
  atencao: string | null;
};

/**
 * Titulo curto para o compromisso, quando a IA nao deu um.
 *
 * Com o numero do processo junto: uma agenda com cinco linhas escritas
 * "Manifestacao" nao diz a ninguem qual e qual.
 */
export function tituloPadrao(
  especie: EspecieDeTriagem,
  tipo: string,
  numeroFormatado: string | null,
): string {
  const base =
    tipo === "AUDIENCIA"
      ? "Audiencia"
      : tipo === "PERICIA"
        ? "Pericia"
        : especie === "AGENDAMENTO"
          ? "Compromisso do processo"
          : "Manifestacao nos autos";
  return numeroFormatado ? `${base} — ${numeroFormatado}` : base;
}

/**
 * A sugestao que sobra quando a IA nao responde.
 *
 * Nunca devolve null: toda publicacao chega na tela com alguma sugestao, e a
 * confianca BAIXA e o que avisa quem le que aquilo saiu de palavra-chave, nao
 * de leitura.
 */
export function sugestaoSemIA(
  texto: string,
  prazoDias: number | null,
  numeroFormatado: string | null,
): Sugestao {
  const especie = especiePeloTexto(texto) ?? "TAREFA";
  const tipo = tipoDoCompromisso(especie, texto);
  return {
    especie,
    tipo,
    titulo: tituloPadrao(especie, tipo, numeroFormatado),
    resumo: "",
    prazoDias,
    contagem: contagemPeloTexto(texto),
    dataDoAto: null,
    confianca: "BAIXA",
    atencao: null,
  };
}
