/**
 * Lista de documentos a pedir ao cliente.
 *
 * A PARTE QUE NAO PODE FALHAR FICA EM CODIGO. Documentos pessoais, justica
 * gratuita e acessos sao os mesmos em qualquer acao, e precisam sair iguais em
 * todo atendimento. Se dependessem do modelo, variariam de um cliente para o
 * outro e faltariam exatamente no dia em que alguem confiasse na lista.
 *
 * A IA entra so na parte que depende da materia — e isso tem um teste que
 * prova que a base sai completa mesmo quando a IA nao responde nada.
 */
import { pedirEstruturado } from "./ia";

export type ItemDoChecklist = {
  documento: string;
  /** Para que serve, em uma linha, para o CLIENTE entender. */
  paraQue: string;
  essencial: boolean;
};

export type GrupoDoChecklist =
  | "PESSOAIS"
  | "DO_CASO"
  | "AJUDAM"
  | "GRATUIDADE"
  | "ACESSOS";

export const ROTULO_DO_GRUPO: Record<GrupoDoChecklist, string> = {
  PESSOAIS: "Documentos pessoais",
  DO_CASO: "Documentos do seu caso",
  AJUDAM: "Se você tiver, ajuda muito",
  GRATUIDADE: "Para o pedido de justiça gratuita",
  ACESSOS: "Acessos",
};

/**
 * Documentos pedidos em toda contratacao.
 *
 * "RG ou CNH" ja nao cobre: a Carteira de Identidade Nacional traz o CPF como
 * numero unico, sem registro geral. O que o escritorio precisa e um documento
 * de identidade com foto, qualquer um deles — e e por isso que o sistema nunca
 * exige RG em campo nenhum.
 */
export const PESSOAIS: ItemDoChecklist[] = [
  {
    documento: "Documento de identidade com foto (CIN, RG ou CNH)",
    paraQue: "Identificação e qualificação na petição",
    essencial: true,
  },
  {
    documento: "CPF",
    paraQue: "Qualificação e cadastro no processo",
    essencial: true,
  },
  {
    documento: "Comprovante de endereço dos últimos 3 meses",
    paraQue: "Qualificação e definição do foro competente",
    essencial: true,
  },
  {
    documento: "Certidão de casamento ou de nascimento",
    paraQue: "Comprova o estado civil declarado na qualificação",
    essencial: false,
  },
  {
    documento: "Procuração assinada",
    paraQue: "Sem ela o escritório não pode atuar",
    essencial: true,
  },
  {
    documento: "Contrato de honorários assinado",
    paraQue: "Formaliza a contratação",
    essencial: true,
  },
];

/**
 * Justica gratuita.
 *
 * A exigencia endureceu: a declaracao de pobreza sozinha costuma nao bastar
 * para pessoa fisica, e o juiz manda comprovar antes de indeferir (CPC 99
 * § 2º). Pedir so a declaracao e o jeito de ter o pedido negado.
 */
export const GRATUIDADE: ItemDoChecklist[] = [
  {
    documento: "Extratos bancários dos últimos 3 meses, de todas as contas",
    paraQue: "É o documento mais cobrado pelos juízes para deferir a gratuidade",
    essencial: true,
  },
  {
    documento: "Última declaração de Imposto de Renda completa, com recibo",
    paraQue: "Mostra renda, bens e a real capacidade financeira",
    essencial: true,
  },
  {
    documento: "Comprovante de isenção do IR, para quem não declara",
    paraQue: "Substitui a declaração — tira-se no site da Receita",
    essencial: false,
  },
  {
    documento: "Holerites dos últimos 3 meses",
    paraQue: "Comprova a renda de quem tem vínculo",
    essencial: true,
  },
  {
    documento: "CTPS: páginas de identificação e último contrato",
    paraQue: "Comprova o vínculo, ou a falta dele",
    essencial: false,
  },
  {
    documento: "Comprovante de benefício (Bolsa Família, BPC, seguro-desemprego)",
    paraQue: "Reforca bastante o pedido quando existe",
    essencial: false,
  },
  {
    documento: "Comprovante do CadUnico, se estiver inscrito",
    paraQue: "Prova forte de hipossuficiência",
    essencial: false,
  },
  {
    documento: "Declaração de hipossuficiência assinada",
    paraQue: "Continua necessária, mas sozinha já não basta",
    essencial: true,
  },
];

/** Acessos digitais de que o escritorio precisa para trabalhar no caso. */
export const ACESSOS: ItemDoChecklist[] = [
  {
    documento: "Senha do GOV.BR, nível prata ou ouro",
    paraQue: "Acesso ao Meu INSS, e-CAC, processos e certidões em nome do cliente",
    essencial: true,
  },
  {
    documento: "Saber se o GOV.BR tem verificação em duas etapas",
    paraQue:
      "Se tiver, o código chega no celular do cliente e ele precisa estar por perto na hora",
    essencial: true,
  },
];

export type Checklist = {
  tipoAcao: string;
  itens: Array<ItemDoChecklist & { grupo: GrupoDoChecklist }>;
  observacoes: string[];
};

const INSTRUCOES = [
  "Você monta listas de documentos para clientes de um escritório de advocacia",
  "brasileiro, logo depois da contratação, quando já se sabe o tipo de ação.",
  "",
  "A lista vai ser entregue ao CLIENTE, então:",
  "1. Use o nome que a pessoa comum usa. 'Conta de luz ou de água', não",
  "   'comprovante de residência idôneo'. 'Extrato do banco', não 'extrato de",
  "   movimentação financeira'.",
  "2. Seja enxuto. Lista gigante faz o cliente não trazer nada. No máximo 10",
  "   itens em doCaso e 6 em ajudam.",
  "3. NAO repita documento pessoal básico (identidade, CPF, comprovante de",
  "   endereço, procuração, contrato): já entram automaticamente.",
  "4. NAO repita documento de justiça gratuita (extrato, imposto de renda,",
  "   holerite): também já entram automaticamente.",
  "5. Em doCaso ponha o que é indispensável para essa ação. Em ajudam ponha o",
  "   que ajuda mas nem sempre existe, e o que costuma ser esquecido.",
  "6. Em observações, avise sobre prazo curto, documento que demora a sair ou",
  "   que precisa ser pedido a um órgão. No máximo 4.",
  "7. Não cite número de artigo de lei na lista do cliente.",
].join("\n");

const ITEM_SCHEMA = {
  type: "object",
  properties: {
    documento: { type: "string" },
    paraQue: { type: "string" },
    essencial: { type: "boolean" },
  },
  required: ["documento", "paraQue", "essencial"],
  additionalProperties: false,
} as const;

const ESQUEMA = {
  type: "object",
  properties: {
    doCaso: { type: "array", items: ITEM_SCHEMA },
    ajudam: { type: "array", items: ITEM_SCHEMA },
    observacoes: { type: "array", items: { type: "string" } },
  },
  required: ["doCaso", "ajudam", "observacoes"],
  additionalProperties: false,
} as const;

type DaIA = {
  doCaso: ItemDoChecklist[];
  ajudam: ItemDoChecklist[];
  observacoes: string[];
};

/** Limpa o que veio do modelo: campo faltando nao vira item quebrado na tela. */
export function limpar(
  bruto: unknown,
  limite: number,
): ItemDoChecklist[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter(
      (i): i is ItemDoChecklist =>
        !!i &&
        typeof i === "object" &&
        typeof (i as ItemDoChecklist).documento === "string" &&
        (i as ItemDoChecklist).documento.trim().length > 0,
    )
    .slice(0, limite)
    .map((i) => ({
      documento: i.documento.trim(),
      paraQue: typeof i.paraQue === "string" ? i.paraQue.trim() : "",
      essencial: Boolean(i.essencial),
    }));
}

export type Contexto = {
  tipoAcao: string;
  area?: string | null;
  descricao?: string | null;
  pedeGratuidade: boolean;
};

/**
 * Junta a base fixa com o que a IA achou da materia.
 *
 * Separado da chamada de rede de proposito: e aqui que mora a regra de o que
 * entra na lista, e regra precisa de teste.
 */
export function montar(ctx: Contexto, daIA: Partial<DaIA> = {}): Checklist {
  const itens: Checklist["itens"] = [
    ...PESSOAIS.map((i) => ({ ...i, grupo: "PESSOAIS" as const })),
    ...limpar(daIA.doCaso, 10).map((i) => ({ ...i, grupo: "DO_CASO" as const })),
    ...limpar(daIA.ajudam, 6).map((i) => ({ ...i, grupo: "AJUDAM" as const })),
    ...(ctx.pedeGratuidade
      ? GRATUIDADE.map((i) => ({ ...i, grupo: "GRATUIDADE" as const }))
      : []),
    ...ACESSOS.map((i) => ({ ...i, grupo: "ACESSOS" as const })),
  ];

  return {
    tipoAcao: ctx.tipoAcao.trim(),
    itens,
    observacoes: Array.isArray(daIA.observacoes)
      ? daIA.observacoes
          .filter((o): o is string => typeof o === "string" && o.trim() !== "")
          .map((o) => o.trim())
          .slice(0, 4)
      : [],
  };
}

/** Pergunta a IA so a parte que depende da materia. */
export async function montarComIA(ctx: Contexto): Promise<{
  checklist: Checklist;
  tokensEntrada: number;
  tokensSaida: number;
  modelo: string;
}> {
  const entrada = [
    ctx.area ? `Área do direito: ${ctx.area}` : "",
    `Tipo de ação: ${ctx.tipoAcao}`,
    ctx.descricao?.trim() ? `Sobre o caso: ${ctx.descricao.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const r = await pedirEstruturado<DaIA>(INSTRUCOES, entrada, ESQUEMA as never);
  return {
    checklist: montar(ctx, r.dados),
    tokensEntrada: r.tokensEntrada,
    tokensSaida: r.tokensSaida,
    modelo: r.modelo,
  };
}

/**
 * A lista em texto, pronta para colar no WhatsApp ou no e-mail.
 *
 * O NOME DO ESCRITORIO E PARAMETRO. No sistema de origem ele estava escrito
 * dentro da funcao; aqui cada escritorio assina com o proprio nome, que e a
 * diferenca entre um sistema de um escritorio e um de muitos.
 */
export function emTexto(
  lista: Checklist,
  nomeDoCliente: string,
  nomeDoEscritorio: string,
): string {
  const primeiro = nomeDoCliente.trim().split(/\s+/)[0] ?? "";
  const linhas: string[] = [
    `${primeiro ? `Ola, ${primeiro}! ` : "Ola! "}Para dar andamento ao seu caso` +
      `${lista.tipoAcao ? ` (${lista.tipoAcao})` : ""}, precisamos dos documentos`,
    "abaixo. Pode mandar por foto ou PDF.",
  ];

  for (const grupo of [
    "PESSOAIS",
    "DO_CASO",
    "AJUDAM",
    "GRATUIDADE",
    "ACESSOS",
  ] as GrupoDoChecklist[]) {
    const doGrupo = lista.itens.filter((i) => i.grupo === grupo);
    if (doGrupo.length === 0) continue;
    linhas.push("", ROTULO_DO_GRUPO[grupo].toUpperCase());
    for (const i of doGrupo) {
      linhas.push(`- ${i.documento}${i.paraQue ? ` (${i.paraQue})` : ""}`);
    }
  }

  if (lista.observacoes.length > 0) {
    linhas.push("", "OBSERVACOES");
    for (const o of lista.observacoes) linhas.push(`- ${o}`);
  }

  linhas.push("", "Qualquer dúvida sobre algum documento, é só nos chamar.", nomeDoEscritorio);
  return linhas.join("\n");
}
