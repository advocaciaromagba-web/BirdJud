// Cadencia dos avisos do vigia externo.
//
// O vigia roda a cada 5 minutos e nao guarda estado nenhum (de proposito: ele
// existe para nao depender de nada do sistema). Sem memoria, um problema que
// dura a manha inteira viraria um e-mail a cada 5 minutos — e foi o que
// aconteceu em 23/10/2026 com o aviso de backup. A regra aqui e a unica
// memoria possivel sem estado: o relogio.
//
//  - queda do sistema: avisa em toda rodada (e urgente, e cada e-mail e um
//    lembrete de que continua fora);
//  - backup parado e certificado com problema: avisam so na primeira rodada
//    de cada hora. Sao lentos: o conserto nao muda em 5 minutos, e o e-mail
//    repetido so ensina a ignorar o alarme.

export type Cadencia = {
  /** A rodada desta hora em que os avisos lentos saem por e-mail. */
  avisarLentos: boolean;
};

/** Primeira rodada da hora = minuto menor que o intervalo entre rodadas. */
export function cadenciaDoAviso(agora: Date, intervaloMinutos = 5): Cadencia {
  return { avisarLentos: agora.getUTCMinutes() < intervaloMinutos };
}
