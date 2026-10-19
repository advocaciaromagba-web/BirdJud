// Alerta sonoro da agenda (19/10/2026).
//
// A tela de quem esta marcado para o compromisso toca, e mostra um aviso,
// quando falta 1 hora e quando faltam 15 minutos. Vale para tudo que mora na
// agenda (audiencia, pericia, atendimento) e ainda nao aconteceu nem foi
// concluido. Tarefa e prazo moram em Tarefas e tem o lembrete deles.
//
// "Marcado" e o responsavel. Compromisso sem responsavel e de todos (como na
// agenda): toca para todos.
//
// Cada pessoa liga ou desliga o som (Usuario.alertaSonoro); desligado, o
// aviso na tela continua — so o som para.
//
// O navegador decide o momento (relogio local, conferido a cada 20 segundos); o
// servidor so diz o que vem pela frente. Assim o alerta sai na hora mesmo
// com o servidor ocupado, e um compromisso remarcado toca de novo, porque a
// chave do alerta leva o horario.
//
// Este arquivo e puro: a tela o importa. A consulta ao banco esta em
// proximos-da-agenda.ts.

/** Minutos antes do inicio, do primeiro ao ultimo alerta. */
export const ANTECEDENCIAS_MINUTOS = [60, 15] as const;

export type ProximoCompromisso = {
  id: string;
  titulo: string;
  tipo: string;
  inicio: string;
  local: string | null;
  link: string | null;
};

export type AlertaDevido = {
  /** Unica por compromisso, horario e antecedencia: o mesmo alerta nao toca duas vezes. */
  chave: string;
  compromisso: ProximoCompromisso;
  antecedencia: number;
  /** Quanto falta de fato, arredondado para cima. */
  faltamMinutos: number;
};

/**
 * Os alertas que devem sair agora. Um por compromisso: o da menor
 * antecedencia ja alcancada (quem marcou a audiencia para daqui a 10 minutos
 * ouve o de 15, nao os dois). Ja tocados ficam de fora.
 */
export function alertasDevidos(
  compromissos: ProximoCompromisso[],
  agora: number,
  jaTocados: ReadonlySet<string>,
): AlertaDevido[] {
  const devidos: AlertaDevido[] = [];
  for (const c of compromissos) {
    const inicio = Date.parse(c.inicio);
    if (!(inicio > agora)) continue;
    const alcancadas = ANTECEDENCIAS_MINUTOS.filter((m) => agora >= inicio - m * 60_000);
    if (!alcancadas.length) continue;
    const antecedencia = alcancadas[alcancadas.length - 1];
    const chave = `${c.id}:${c.inicio}:${antecedencia}`;
    if (jaTocados.has(chave)) continue;
    devidos.push({
      chave,
      compromisso: c,
      antecedencia,
      faltamMinutos: Math.ceil((inicio - agora) / 60_000),
    });
  }
  return devidos;
}

/** "Falta 1 hora", "Faltam 15 minutos", "Falta 1 minuto". */
export function textoDoQuantoFalta(minutos: number): string {
  if (minutos >= 60 && minutos % 60 === 0) {
    const h = minutos / 60;
    return h === 1 ? "Falta 1 hora" : `Faltam ${h} horas`;
  }
  return minutos === 1 ? "Falta 1 minuto" : `Faltam ${minutos} minutos`;
}
