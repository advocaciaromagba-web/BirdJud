// Aviso de tarefa em duas entregas por dia (03/11/2026, vindo do sistema da
// Advocacia Roma).
//
// Cada tarefa designada virava uma mensagem no celular de quem recebeu, na
// hora. Escritorio que distribui dezenas de tarefas por dia fazia o celular
// apitar a manha e a tarde inteiras — e quem recebe dez avisos por dia nao le
// nenhum. A regra:
//
// - designada ate o meio-dia, o aviso sai na entrega das 12h;
// - designada depois do meio-dia, sai na das 18h;
// - designada depois das 18h, vai para a das 12h do dia seguinte. Nao ha
//   entrega a noite.
//
// Furam a fila: tarefa URGENTE com entrega no mesmo dia, e tarefa cuja
// entrega vence ANTES da propria janela (designada as 13h para as 15h: o
// aviso das 18h chegaria com o prazo ja perdido). Entrega ja vencida nao fura:
// sair agora ou na janela da no mesmo.
//
// Vale so para aviso de tarefa. Compromisso, lembrete de audiencia e alerta de
// falha continuam saindo na hora. As horas sao as de Brasilia; o envio roda na
// rotina de hora em hora, entao "12h" e "por volta das 12h".

const FUSO = "America/Sao_Paulo";

export const ENTREGA_DA_MANHA = 12;
export const ENTREGA_DA_TARDE = 18;

function relogio(d: Date): { dia: string; hora: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: FUSO,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) };
}

// Brasilia sem horario de verao desde 2019: o mesmo -03:00 fixo do resto do
// sistema (fechamento de caixa, vencimento de cobranca).
const instante = (dia: string, hora: number) => new Date(`${dia}T${String(hora).padStart(2, "0")}:00:00-03:00`);

function diaSeguinte(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** A proxima entrega a partir de agora. */
export function proximaEntrega(agora: Date): Date {
  const { dia, hora } = relogio(agora);
  if (hora < ENTREGA_DA_MANHA) return instante(dia, ENTREGA_DA_MANHA);
  if (hora < ENTREGA_DA_TARDE) return instante(dia, ENTREGA_DA_TARDE);
  return instante(diaSeguinte(dia), ENTREGA_DA_MANHA);
}

const mesmoDia = (a: Date, b: Date) => relogio(a).dia === relogio(b).dia;

/** Quando o aviso desta tarefa sai. `null` e agora. */
export function quandoAvisarTarefa(tarefa: { prioridade: string; vencimento: Date }, agora: Date): Date | null {
  if (tarefa.prioridade === "URGENTE" && mesmoDia(tarefa.vencimento, agora)) return null;
  const janela = proximaEntrega(agora);
  const vence = tarefa.vencimento.getTime();
  if (vence > agora.getTime() && vence < janela.getTime()) return null;
  return janela;
}

/** "às 18h de hoje", "às 12h de amanhã", "às 12h de 09/11". */
export function descreverEntrega(quando: Date, agora: Date): string {
  const hora = `${relogio(quando).hora}h`;
  if (mesmoDia(quando, agora)) return `às ${hora} de hoje`;
  if (relogio(quando).dia === diaSeguinte(relogio(agora).dia)) return `às ${hora} de amanhã`;
  const dia = quando.toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" });
  return `às ${hora} de ${dia}`;
}
