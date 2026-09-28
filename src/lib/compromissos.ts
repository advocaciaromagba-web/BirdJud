// Tarefa e agendamento vivem na mesma tabela (Compromisso), separados por
// `tipo`. As exigencias sao diferentes, e a diferenca nao e arbitraria:
//
//   TAREFA      -> cliente OBRIGATORIO, processo opcional.
//                  Tarefa sem dono fica solta: "protocolar peticao" sem dizer
//                  de quem nao ajuda ninguem a decidir o que fazer primeiro.
//                  Ja processo nem sempre existe — levar documento ao
//                  cartorio, ligar para o cliente, juntar procuracao.
//
//   agendamento -> os dois OPCIONAIS.
//                  Reuniao pode ser com quem ainda nao e cliente, e por isso
//                  a tela deixa escolher da base OU cadastrar na hora. Exigir
//                  processo numa primeira reuniao obrigaria a inventar um
//                  numero, e numero inventado e pior que campo vazio.
export const TIPOS_DE_COMPROMISSO = [
  "COMPROMISSO",
  "AUDIENCIA",
  "PRAZO",
  "TAREFA",
] as const;

export type TipoDeCompromisso = (typeof TIPOS_DE_COMPROMISSO)[number];

export function ehTarefa(tipo: string): boolean {
  return tipo === "TAREFA";
}

export type Vinculos = {
  tipo: string;
  clienteId?: string | null;
  /** Cliente novo, cadastrado na propria tela do agendamento. */
  clienteNovo?: { nome?: string | null } | null;
};

/**
 * Devolve o que falta, ou null quando esta completo.
 *
 * Funcao pura: e a regra de negocio, e regra de negocio sem teste vira
 * exigencia que ninguem lembra de onde veio.
 */
export function faltaParaGravar(v: Vinculos): string | null {
  const temCliente =
    Boolean(v.clienteId?.trim()) || Boolean(v.clienteNovo?.nome?.trim());

  if (ehTarefa(v.tipo) && !temCliente) {
    return "Toda tarefa precisa de um cliente. Escolha um da base ou cadastre um novo.";
  }

  // Mandar os dois ao mesmo tempo e ambiguo: qual deles vale? Recusar aqui
  // evita criar cliente duplicado sem querer.
  if (v.clienteId?.trim() && v.clienteNovo?.nome?.trim()) {
    return "Escolha um cliente da base ou cadastre um novo, nao os dois.";
  }

  return null;
}
