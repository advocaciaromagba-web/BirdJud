// Entrega das mensagens: as regras, puras e testadas.
//
// "Enviado" no sistema queria dizer so que a Meta ACEITOU a mensagem. Se ela
// chegou ao celular do cliente, quem diz e o retorno da Meta pelo webhook:
// sent, delivered, read ou failed. Estas regras leem esse retorno, explicam a
// falha em lingua de escritorio e decidem se o sistema tenta de novo sozinho
// ou se uma pessoa precisa agir. Ver docs/ENTREGA-DE-MENSAGENS.md.

/**
 * De quem e o problema — e por isso, o que fazer.
 *
 *  TEMPORARIO  instabilidade ou limite da Meta: o sistema reenvia sozinho;
 *  NUMERO      o numero nao recebe WhatsApp: corrigir o cadastro ou ligar;
 *  RECUSOU     a pessoa bloqueou mensagens de empresas: so contato direto;
 *  PLATAFORMA  configuracao da BirdJud com a Meta: nao e do escritorio;
 *  EMAIL       o e-mail nao saiu (conta de envio do escritorio ou endereco);
 *  OUTRO       motivo que a Meta nao explicou.
 */
export type Categoria = "TEMPORARIO" | "NUMERO" | "RECUSOU" | "PLATAFORMA" | "EMAIL" | "OUTRO";

const TEMPORARIOS = new Set([0, 1, 2, 4, 80007, 130429, 131000, 131016, 131048, 131049, 131052, 131053, 131056]);
const DE_NUMERO = new Set([131026, 131021]);
const RECUSAS = new Set([131050]);
// Conta, pagamento, modelo, nome de exibicao, token: tudo do lado da plataforma.
const DA_PLATAFORMA = new Set([
  3, 10, 190, 200, 131005, 131008, 131009, 131030, 131031, 131037, 131042, 131045, 131047, 131051,
  132000, 132001, 132005, 132007, 132012, 132015, 132016, 133004, 133010, 141006,
]);

export function categoriaDaFalha(canal: string, codigo: number | null | undefined): Categoria {
  if (canal === "EMAIL") return "EMAIL";
  if (codigo === null || codigo === undefined) return "OUTRO";
  if (TEMPORARIOS.has(codigo)) return "TEMPORARIO";
  if (DE_NUMERO.has(codigo)) return "NUMERO";
  if (RECUSAS.has(codigo)) return "RECUSOU";
  if (DA_PLATAFORMA.has(codigo)) return "PLATAFORMA";
  return "OUTRO";
}

/** A falha em uma frase que o escritorio entende. */
export function motivoDaFalha(codigo: number | null | undefined, original?: string | null): string {
  switch (codigo) {
    case 131026:
      return "O numero nao recebe WhatsApp (nao tem conta, o aplicativo esta desatualizado ou a pessoa nao aceitou os termos novos).";
    case 131021:
      return "O numero de destino e o proprio numero de envio.";
    case 131050:
      return "A pessoa bloqueou mensagens de empresas no WhatsApp.";
    case 131049:
      return "A Meta segurou a mensagem para nao sobrecarregar a pessoa com mensagens de empresas.";
    case 131048:
      return "A Meta limitou o envio por excesso de mensagens recentes.";
    case 130429:
    case 131056:
      return "Limite de envio da Meta atingido naquele momento.";
    case 131000:
    case 131016:
      return "Instabilidade no servico do WhatsApp.";
    case 131052:
    case 131053:
      return "O anexo nao pode ser transmitido pela Meta.";
    case 131042:
    case 141006:
      return "Pendencia de pagamento da conta de WhatsApp da plataforma.";
    case 131047:
      return "A janela de 24 horas com este numero estava fechada.";
    case 132001:
    case 132015:
    case 132016:
      return "O modelo de mensagem nao esta disponivel na Meta (nao aprovado, pausado ou desativado).";
    case 190:
      return "A conexao da plataforma com o WhatsApp expirou.";
    case 0:
      return "Sem resposta do servico do WhatsApp (rede).";
  }
  return original?.trim() || "A Meta nao informou o motivo.";
}

/** O que a pessoa do escritorio faz agora. */
export const O_QUE_FAZER: Record<Categoria, string> = {
  TEMPORARIO: "O sistema tenta de novo sozinho. Se a segunda tentativa tambem falhar, avise o cliente por outro meio.",
  NUMERO: "Confira o telefone no cadastro. Corrigido, use \"Reenviar\": sai para o numero novo. Ou ligue para a pessoa.",
  RECUSOU: "Por WhatsApp nao chega. Avise por telefone, e-mail ou pessoalmente e marque como resolvido.",
  PLATAFORMA: "Problema do lado da BirdJud, que ja foi avisada. Avise o cliente por outro meio ou reenvie mais tarde.",
  EMAIL: "Confira o endereco de e-mail do cadastro e a conta de envio em Integracoes. Depois reenvie ou avise por outro meio.",
  OUTRO: "Reenvie ou avise a pessoa por outro meio.",
};

// ---------------------------------------------------------------------------
// O retorno da Meta, em ordem
// ---------------------------------------------------------------------------

export type StatusDaMeta = "sent" | "delivered" | "read" | "failed";

export type SituacaoDeEntrega = {
  estado: string;
  entregueEm: Date | null;
  lidoEm: Date | null;
};

export type Mudanca = {
  estado?: "FALHOU";
  entregueEm?: Date;
  lidoEm?: Date;
  falhouEm?: Date;
};

/**
 * O que um retorno muda no aviso. Null quando nao muda nada.
 *
 * A Meta nao garante a ordem: "read" chega antes de "delivered", e o mesmo
 * evento chega duas vezes. Por isso nada anda para tras — lida implica
 * entregue, e "failed" depois de entregue e ignorado (a mensagem chegou).
 */
export function mudancaPorStatus(atual: SituacaoDeEntrega, status: string, quando: Date): Mudanca | null {
  if (atual.estado === "CANCELADO") return null;
  if (status === "delivered") {
    return atual.entregueEm ? null : { entregueEm: quando };
  }
  if (status === "read") {
    if (atual.lidoEm) return null;
    return atual.entregueEm ? { lidoEm: quando } : { lidoEm: quando, entregueEm: quando };
  }
  if (status === "failed") {
    if (atual.entregueEm || atual.lidoEm || atual.estado === "FALHOU") return null;
    return { estado: "FALHOU", falhouEm: quando };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reenvio automatico
// ---------------------------------------------------------------------------

const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;

/** Prefixo da chave do reenvio que o sistema fez sozinho: ele nao se repete. */
export const PREFIXO_DO_REENVIO_AUTOMATICO = "reenvio:auto:";

export type FalhaParaDecidir = {
  canal: string;
  tipo: string;
  chave: string;
  erroCodigo: number | null;
  falhouEm: Date | null;
  /** Inicio do compromisso, quando o aviso e de um. */
  inicioDoCompromisso: Date | null;
};

/**
 * Quando o sistema reenvia sozinho, ou null se cabe a uma pessoa.
 *
 * So falha TEMPORARIA, so WhatsApp, uma vez so (o reenvio automatico que
 * falha vai para o escritorio), nunca documento (o PDF precisa ser gerado de
 * novo, e isso e decisao de quem manda) e nunca para compromisso que ja
 * comecou — lembrete de audiencia que ja passou nao serve para nada.
 *
 * Quanto esperar: 30 minutos, menos no 131049 — a Meta pede que se espere um
 * dia, e insistir antes so gasta a nota do numero.
 */
export function quandoReenviarSozinho(f: FalhaParaDecidir, agora: Date): Date | null {
  if (f.canal !== "WHATSAPP" || f.tipo === "DOCUMENTO") return null;
  if (f.chave.startsWith(PREFIXO_DO_REENVIO_AUTOMATICO)) return null;
  if (categoriaDaFalha(f.canal, f.erroCodigo) !== "TEMPORARIO") return null;
  const base = f.falhouEm ?? agora;
  const quando = new Date(base.getTime() + (f.erroCodigo === 131049 ? 24 * HORA : 30 * MINUTO));
  if (f.inicioDoCompromisso && f.inicioDoCompromisso.getTime() <= Math.max(quando.getTime(), agora.getTime())) {
    return null;
  }
  return quando;
}

/**
 * WhatsApp aceito pela Meta e sem "entregue" depois deste tempo: o celular
 * esta desligado, sem internet ou sem o aplicativo. Nao e falha ainda — a
 * Meta continua tentando — mas o escritorio precisa saber.
 */
export const HORAS_SEM_CONFIRMACAO = 6;

export function semConfirmacao(
  a: { canal: string; estado: string; idNaMeta: string | null; entregueEm: Date | null; enviadoEm: Date | null },
  agora: Date,
): boolean {
  return (
    a.canal === "WHATSAPP" &&
    a.estado === "ENVIADO" &&
    a.idNaMeta !== null &&
    a.entregueEm === null &&
    a.enviadoEm !== null &&
    agora.getTime() - a.enviadoEm.getTime() >= HORAS_SEM_CONFIRMACAO * HORA
  );
}

// ---------------------------------------------------------------------------
// Na tela
// ---------------------------------------------------------------------------

export const TRATAMENTOS = {
  REENVIADO: "Reenviada",
  REENVIO_AUTOMATICO: "Reenviada pelo sistema",
  CONTATO_DIRETO: "Avisado por outro meio",
  DESCARTADO: "Nao precisa mais",
} as const;
export type Tratamento = keyof typeof TRATAMENTOS;

/** Rotulo da entrega para a auditoria: o que de fato se sabe. */
export function rotuloDaEntrega(a: {
  canal: string;
  estado: string;
  idNaMeta?: string | null;
  entregueEm?: Date | string | null;
  lidoEm?: Date | string | null;
}): string | null {
  if (a.estado !== "ENVIADO") return null;
  if (a.canal !== "WHATSAPP") return null;
  if (a.lidoEm) return "Lida";
  if (a.entregueEm) return "Entregue";
  // Sem id: mandada antes do retorno existir — nao ha como saber.
  return a.idNaMeta ? "Sem confirmacao de entrega" : null;
}
