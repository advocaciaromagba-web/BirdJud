// O que o botao "Avisar" da agenda pode mandar. Separado de avisos.ts porque
// a tela importa isto, e a tela nao pode carregar o Prisma junto.

export const AVISOS_MANUAIS = ["AGENDADO", "LEMBRETE_24H", "LEMBRETE_1H"] as const;
export type AvisoManual = (typeof AVISOS_MANUAIS)[number];

export const ROTULO_DO_AVISO_MANUAL: Record<AvisoManual, string> = {
  AGENDADO: "Confirmacao do agendamento",
  LEMBRETE_24H: "Lembrete de vespera",
  LEMBRETE_1H: "Lembrete de 1 hora antes",
};
