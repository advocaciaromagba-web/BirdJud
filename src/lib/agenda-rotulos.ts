// Rotulos da auditoria da agenda, em um modulo sem Prisma: a tela importa.

/** Por que o compromisso saiu da agenda. */
export type MotivoDaExclusao = "VENCIDO" | "EXCLUIDO";

export const TEXTO_DO_MOTIVO: Record<string, string> = {
  VENCIDO: "Venceu o horario — arquivado pela rotina.",
  EXCLUIDO: "Apagado por alguem do escritorio.",
};

/** Os tipos de aviso que nascem de um compromisso. */
export const TIPOS_DE_AVISO_DA_AGENDA = [
  "COMPROMISSO_MARCADO",
  "LEMBRETE_AO_PARTICIPANTE",
  "LEMBRETE_COMPROMISSO",
  "TAREFA_DESIGNADA",
] as const;

export const ROTULO_DO_TIPO_DE_AVISO: Record<string, string> = {
  COMPROMISSO_MARCADO: "Confirmacao do agendamento",
  LEMBRETE_AO_PARTICIPANTE: "Lembrete ao participante",
  LEMBRETE_COMPROMISSO: "Lembrete a equipe",
  TAREFA_DESIGNADA: "Designacao",
};

export const ROTULO_DO_ESTADO: Record<string, string> = {
  PENDENTE: "Na fila",
  ENVIADO: "Enviado",
  FALHOU: "Falhou",
  CANCELADO: "Cancelado",
};
