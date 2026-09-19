// Os modelos de mensagem aprovados na Meta.
//
// Cada modelo aqui precisa existir, com o MESMO nome e idioma, na conta de
// WhatsApp do escritorio — e aprovado por la. O texto abaixo e o que o
// escritorio submete; docs/WHATSAPP.md traz o passo a passo com este mesmo
// texto para copiar.
//
// Por que os textos moram no codigo, se quem aprova e a Meta: porque a ordem
// dos parametros e um contrato. Trocar {{2}} por {{3}} aqui sem trocar la faz
// o escritorio mandar a hora no lugar do nome do cliente — e ninguem percebe
// ate alguem receber.

export type ModeloDeAviso = {
  nome: string;
  idioma: string;
  /** O texto exato submetido a Meta, para conferencia e para a documentacao. */
  texto: string;
  /** O que cada {{n}} significa, na ordem. */
  parametros: string[];
};

export const MODELOS: Record<string, ModeloDeAviso> = {
  RESUMO_PUBLICACOES: {
    nome: "birdjud_resumo_publicacoes",
    idioma: "pt_BR",
    texto:
      "{{1}}: voce tem {{2}} publicacao(oes) nova(s), sendo {{3}} urgente(s). " +
      "Abra o sistema para ler o texto completo. O prazo indicado e leitura " +
      "automatica e serve como alerta — confira sempre nos autos.",
    parametros: ["nome do escritorio", "quantidade", "urgentes"],
  },
  LEMBRETE_COMPROMISSO: {
    nome: "birdjud_lembrete_compromisso",
    idioma: "pt_BR",
    texto:
      "{{1}}: lembrete de {{2}} em {{3}}. {{4}}. Confira a agenda no sistema.",
    parametros: ["nome do escritorio", "titulo", "data e hora", "local ou processo"],
  },
};

export function modeloDoTipo(tipo: string): ModeloDeAviso | null {
  return MODELOS[tipo] ?? null;
}

/**
 * Parametro de modelo nao aceita quebra de linha, tabulacao nem espaco duplo
 * — a Meta recusa a mensagem inteira com erro de formato. Tambem nao pode ser
 * vazio, entao campo ausente vira travessao.
 */
export function limparParametro(valor: string | null | undefined, limite = 200): string {
  const limpo = (valor ?? "").replace(/\s+/g, " ").trim();
  if (!limpo) return "—";
  return limpo.length <= limite ? limpo : `${limpo.slice(0, limite - 1)}…`;
}
