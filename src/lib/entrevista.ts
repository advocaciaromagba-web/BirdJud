/**
 * Entrevista de triagem: a primeira conversa com quem procura o escritorio.
 *
 * Este modulo e so REGRA — nada de banco, nada de rede. O que ele guarda e o
 * que nao pode mudar sem alguem decidir: quais situacoes existem, o que a IA
 * tem permissao de dizer, e o que fazer quando ela nao disse nada.
 *
 * O porte veio do sistema da Advocacia Roma, e o que se trouxe foi a FUNCAO,
 * nao o codigo: la a chamada e um fetch cru com ferramenta forcada; aqui ela
 * passa pelo cliente da plataforma, com saida estruturada validada pelo
 * servidor, recusa tratada e consumo medido por escritorio.
 */

/** O ciclo da entrevista, em ordem. Nenhuma situacao volta atras sozinha. */
export const SITUACOES = [
  "RASCUNHO",
  "ROTEIRO",
  "ANOTADA",
  "ANALISADA",
  "ARQUIVADA",
] as const;
export type Situacao = (typeof SITUACOES)[number];

/**
 * Que conversa e esta.
 *
 * TRIAGEM e o primeiro atendimento de quem procurou o escritorio. TESTEMUNHA e
 * a oitiva de uma testemunha, para entender o caso. COLETA e a conversa para
 * levantar informacoes e gerar um documento (declaracao, relato, peca).
 * Todas se gravam, se transcrevem e geram PDF; o roteiro e a organizacao
 * mudam conforme o tipo, e o texto da peticao inicial e so da triagem.
 */
export const TIPOS_DE_ENTREVISTA = ["TRIAGEM", "TESTEMUNHA", "COLETA"] as const;
export type TipoDeEntrevista = (typeof TIPOS_DE_ENTREVISTA)[number];

export const ROTULO_DO_TIPO: Record<TipoDeEntrevista, string> = {
  TRIAGEM: "Triagem (primeiro atendimento)",
  TESTEMUNHA: "Oitiva de testemunha",
  COLETA: "Coleta de informações para documento",
};

/** Titulo do PDF de cada tipo. */
export const TITULO_DO_TIPO: Record<TipoDeEntrevista, string> = {
  TRIAGEM: "Entrevista de triagem",
  TESTEMUNHA: "Termo de oitiva de testemunha",
  COLETA: "Entrevista de coleta de informações",
};

export function tipoDe(valor: unknown): TipoDeEntrevista {
  return (TIPOS_DE_ENTREVISTA as readonly string[]).includes(String(valor)) ? (valor as TipoDeEntrevista) : "TRIAGEM";
}

export const URGENCIAS = ["BAIXA", "MEDIA", "ALTA", "URGENTE"] as const;
export type Urgencia = (typeof URGENCIAS)[number];

/** Teto do roteiro. Mais que isso ninguem segue numa conversa. */
export const MAXIMO_DE_PERGUNTAS = 15;

/**
 * O que a IA devolve depois de ler a transcricao.
 *
 * Tudo em lista de texto, de proposito: o advogado le, corta e aproveita. Um
 * parecer em prosa daria a impressao de conclusao pronta, e isto e apoio de
 * triagem — quem decide a tese e a estrategia e o advogado.
 */
export type AnaliseDaEntrevista = {
  area: string;
  resumo: string;
  /** Em ordem cronologica, com as palavras de quem contou. */
  fatos: string[];
  /** O que a pessoa quer obter. */
  pretensoes: string[];
  documentosCitados: string[];
  documentosQueFaltam: string[];
  testemunhas: string[];
  /** O que o advogado precisa conferir: prescricao, competencia, urgencia. */
  pontosDeAtencao: string[];
  /** Ficou sem resposta e cabe numa proxima conversa. */
  perguntasEmAberto: string[];
  urgencia: Urgencia;
  /** Texto livre: nem sempre e numero ("o valor de um trator"). */
  valorEnvolvido: string | null;
};

/**
 * Roteiro minimo, quando a IA nao esta disponivel.
 *
 * Existe para que a tela NUNCA apareca vazia: modulo de IA nao contratado,
 * chave fora do ar, recusa do classificador. Uma entrevista com estas sete
 * perguntas e pior que uma bem sugerida, e muito melhor que uma sem roteiro.
 */
export const ROTEIRO_BASICO: readonly string[] = [
  "Conte, com suas palavras, o que aconteceu.",
  "Quando isso começou e quando aconteceu a última vez?",
  "Quem mais estava envolvido ou presenciou?",
  "Que documentos o senhor tem sobre isso?",
  "Já procurou a outra parte, ou algum órgão, para resolver?",
  "Existe algum prazo, audiência ou notificação já marcada?",
  "O que o senhor espera conseguir com a ação?",
];

/** Limpa o roteiro que veio da IA: sem vazio, sem repetido, sem excesso. */
export function arrumarRoteiro(perguntas: unknown): string[] {
  if (!Array.isArray(perguntas)) return [...ROTEIRO_BASICO];
  const vistas = new Set<string>();
  const limpas: string[] = [];
  for (const item of perguntas) {
    if (typeof item !== "string") continue;
    const texto = item.trim().replace(/\s+/g, " ");
    if (!texto) continue;
    // Repetida e a mesma pergunta com outra pontuacao ou caixa.
    const chave = texto.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "");
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    limpas.push(texto);
    if (limpas.length === MAXIMO_DE_PERGUNTAS) break;
  }
  return limpas.length > 0 ? limpas : [...ROTEIRO_BASICO];
}

/**
 * A situacao que a entrevista passa a ter, dado o que ela ja tem.
 *
 * Calculada, e nao escolhida a mao em cada rota: situacao gravada por quem
 * salva e sempre a que a pessoa esqueceu de atualizar.
 */
export function situacaoDe(entrevista: {
  roteiro?: unknown;
  transcricao?: string | null;
  analise?: unknown;
  arquivadaEm?: Date | null;
}): Situacao {
  if (entrevista.arquivadaEm) return "ARQUIVADA";
  if (entrevista.analise) return "ANALISADA";
  if (entrevista.transcricao?.trim()) return "ANOTADA";
  if (Array.isArray(entrevista.roteiro) && entrevista.roteiro.length > 0)
    return "ROTEIRO";
  return "RASCUNHO";
}

export const ROTULO_DA_SITUACAO: Record<Situacao, string> = {
  RASCUNHO: "rascunho",
  ROTEIRO: "com roteiro",
  ANOTADA: "anotada",
  ANALISADA: "organizada",
  ARQUIVADA: "arquivada",
};

export const ROTULO_DA_URGENCIA: Record<Urgencia, string> = {
  BAIXA: "sem pressa",
  MEDIA: "normal",
  ALTA: "urgente",
  URGENTE: "para hoje",
};

/**
 * Transcricao curta demais nao vale uma chamada paga.
 *
 * Duzentos caracteres e menos de tres linhas: nao da para organizar fatos,
 * pretensoes e documentos a partir disso, e a IA preencheria o vazio
 * inventando — exatamente o que o prompt proibe.
 */
export const MINIMO_DA_TRANSCRICAO = 200;

export class TranscricaoCurta extends Error {
  readonly status = 422;
  constructor(tamanho: number) {
    super(
      `A anotação tem ${tamanho} caracteres. Abaixo de ${MINIMO_DA_TRANSCRICAO} ` +
        "não dá para organizar o caso sem inventar o que falta.",
    );
    this.name = "TranscricaoCurta";
  }
}

/** A urgencia que a analise trouxe, ou MEDIA quando veio algo fora da lista. */
export function urgenciaDe(valor: unknown): Urgencia {
  return URGENCIAS.includes(valor as Urgencia) ? (valor as Urgencia) : "MEDIA";
}
