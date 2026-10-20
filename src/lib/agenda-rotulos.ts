// Rotulos da auditoria da agenda, em um modulo sem Prisma: a tela importa.

/** Por que o compromisso saiu da agenda. */
export type MotivoDaExclusao = "VENCIDO" | "EXCLUIDO" | "VIROU_TAREFA";

export const TEXTO_DO_MOTIVO: Record<string, string> = {
  VENCIDO: "Venceu o horário — arquivado pela rotina.",
  EXCLUIDO: "Apagado por alguém do escritório.",
  VIROU_TAREFA: "Era peça ou prazo, não compromisso: passou para Tarefas.",
};

/** Os tipos de aviso que nascem de um compromisso. */
export const TIPOS_DE_AVISO_DA_AGENDA = [
  "COMPROMISSO_MARCADO",
  "LEMBRETE_AO_PARTICIPANTE",
  "LEMBRETE_COMPROMISSO",
  "TAREFA_DESIGNADA",
  "LEMBRETE_TAREFA",
] as const;

export const ROTULO_DO_TIPO_DE_AVISO: Record<string, string> = {
  COMPROMISSO_MARCADO: "Confirmação do agendamento",
  LEMBRETE_AO_PARTICIPANTE: "Lembrete ao participante",
  LEMBRETE_COMPROMISSO: "Lembrete a equipe",
  TAREFA_DESIGNADA: "Designacao",
  LEMBRETE_TAREFA: "Lembrete de tarefa",
  NFSE_ASSINATURA: "Nota fiscal para assinar",
  DOCUMENTO: "Documento por WhatsApp",
  RESUMO_PUBLICACOES: "Resumo de publicações",
  RESUMO_DO_DIA: "Resumo do dia",
  FALHA_DE_ENTREGA: "Alerta de mensagem não entregue",
};

/** Rotulo de qualquer aviso, inclusive os financeiros (CONTA_*, RECEBIMENTO_*). */
export function rotuloDoAviso(tipo: string): string {
  if (ROTULO_DO_TIPO_DE_AVISO[tipo]) return ROTULO_DO_TIPO_DE_AVISO[tipo];
  if (tipo.startsWith("CONTA_")) return "Aviso de conta a pagar";
  if (tipo.startsWith("RECEBIMENTO_")) return "Aviso de recebimento";
  return tipo.toLowerCase().replace(/_/g, " ");
}

export const ROTULO_DO_ESTADO: Record<string, string> = {
  PENDENTE: "Na fila",
  ENVIADO: "Enviado",
  FALHOU: "Falhou",
  CANCELADO: "Cancelado",
};
