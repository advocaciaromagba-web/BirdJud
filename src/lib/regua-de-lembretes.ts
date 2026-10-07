// Quando avisar de um compromisso.
//
// Ate aqui havia um aviso so, 24 horas antes. Um aviso so tem um problema
// pratico: 24 horas antes de uma audiencia o cliente ja nao consegue pedir
// folga no trabalho, nem remarcar a viagem, nem avisar que nao vai — e o
// escritorio descobre a ausencia no dia.
//
// Agora sao tres marcos: TRES DIAS (da para se organizar), VINTE E QUATRO
// HORAS (da para confirmar) e UMA HORA (da para sair de casa).
//
// A FAIXA DE CADA MARCO E O QUE IMPEDE O ABSURDO. Sem faixa, um compromisso
// marcado para amanha dispararia tambem o aviso de "faltam 3 dias" — porque
// "faltam 3 dias ou menos" tambem e verdade para ele. Cada marco so vale entre
// a sua hora e a do marco seguinte.
//
// Este arquivo nao toca banco nem rede.

export type Marco = {
  /** Entra na chave de idempotencia do aviso. Nao mudar sem migrar. */
  chave: string;
  horas: number;
  /** Como aparece na mensagem, depois da data. */
  rotulo: string;
};

export const MARCOS: Marco[] = [
  { chave: "3d", horas: 72, rotulo: "faltam 3 dias" },
  { chave: "24h", horas: 24, rotulo: "e amanha" },
  { chave: "1h", horas: 1, rotulo: "e daqui a pouco" },
];

/** O marco mais distante: define ate onde a busca precisa olhar. */
export const MAIOR_ANTECEDENCIA_HORAS = Math.max(...MARCOS.map((m) => m.horas));

/**
 * Quais compromissos merecem a regua inteira.
 *
 * AUDIENCIA, PERICIA e COMPROMISSO sao encontros: alguem precisa ESTAR em um
 * lugar, e tres avisos sao tres chances de nao faltar. PRAZO e TAREFA sao
 * trabalho do escritorio, nao encontro — avisar tres vezes de cada tarefa
 * enche o WhatsApp da equipe e ensina todo mundo a ignorar o aviso, que e
 * exatamente o contrario do que se quer no dia do prazo.
 */
export const TIPOS_COM_REGUA = new Set(["AUDIENCIA", "PERICIA", "COMPROMISSO"]);

/** O unico marco de quem nao tem regua. */
const MARCO_UNICO = MARCOS.filter((m) => m.chave === "24h");

export function marcosDoTipo(tipo: string): Marco[] {
  return TIPOS_COM_REGUA.has(tipo) ? MARCOS : MARCO_UNICO;
}

const HORA = 60 * 60 * 1000;

/**
 * Em qual marco este compromisso esta AGORA — ou nenhum.
 *
 * Devolve um so: a rotina roda de hora em hora, e a chave de idempotencia
 * guarda os marcos ja emitidos. Quem esta a 50 horas recebe o de 3 dias hoje e
 * o de 24 horas amanha, sem que ninguem precise lembrar disso aqui.
 *
 * Compromisso que ja comecou nao gera aviso: lembrete de audiencia que ja
 * passou nao ajuda ninguem e deixa o sistema com cara de quebrado.
 */
export function marcoAgora(
  tipo: string,
  inicio: Date,
  agora: Date,
): Marco | null {
  const restante = inicio.getTime() - agora.getTime();
  if (restante <= 0) return null;

  const marcos = marcosDoTipo(tipo);
  // Do mais perto para o mais longe: quem esta a 30 minutos cai no marco de 1
  // hora, nao no de 3 dias.
  const emOrdem = [...marcos].sort((a, b) => a.horas - b.horas);
  for (const m of emOrdem) {
    if (restante <= m.horas * HORA) return m;
  }
  return null;
}

/** A data com o marco junto: "10/11/2026, 14:00 — e amanha". */
export function quandoComMarco(dataHora: string, marco: Marco): string {
  return `${dataHora} — ${marco.rotulo}`;
}
