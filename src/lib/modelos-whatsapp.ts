// Os modelos de mensagem aprovados na Meta.
//
// Cada modelo aqui precisa existir, com o MESMO nome e idioma, no aplicativo
// da PLATAFORMA na Meta — e aprovado por la. Aprovacao agora e uma so, nossa,
// e nao uma por escritorio: o numero e unico (ver src/lib/whatsapp.ts).
// docs/WHATSAPP.md traz o passo a passo com este mesmo texto para copiar.
//
// Por que os textos moram no codigo, se quem aprova e a Meta: porque a ordem
// dos parametros e um contrato. Trocar {{2}} por {{3}} aqui sem trocar la faz
// o sistema mandar a hora no lugar do nome do cliente — e ninguem percebe ate
// alguem receber.
//
// DUAS COISAS ESTAO EM TODO MODELO, e nao por enfeite:
//
//   1. o NOME DO ESCRITORIO logo no comeco. Quem recebe nao conhece este
//      numero: ele e da plataforma, nao da banca. Sem o nome na primeira
//      linha, a mensagem chega como numero desconhecido falando de audiencia.
//   2. o TELEFONE DO ESCRITORIO no fim, depois da frase que diz que este
//      numero NAO recebe mensagens. Este numero notifica; quem precisa falar
//      liga para a banca. Sem essa linha, a pessoa responde aqui e acha que
//      falou com o advogado.
//
// O telefone fica ANTES de um ponto final, nunca como ultimo caractere: a Meta
// recusa modelo que termina em parametro.

export type ModeloDeAviso = {
  nome: string;
  idioma: string;
  /** O texto exato submetido a Meta, para conferencia e para a documentacao. */
  texto: string;
  /** O que cada {{n}} significa, na ordem. */
  parametros: string[];
};

/** A frase que fecha toda mensagem. O {{n}} e o telefone do escritorio. */
const RODAPE = "Este numero so envia avisos e nao recebe mensagens. Para falar com o escritorio, ligue para {{N}}.";

const TELEFONE_DO_ESCRITORIO = "telefone do escritorio";

function comRodape(texto: string, numeroDoParametro: number): string {
  return `${texto} ${RODAPE.replace("{{N}}", `{{${numeroDoParametro}}}`)}`;
}

export const MODELOS: Record<string, ModeloDeAviso> = {
  RESUMO_PUBLICACOES: {
    nome: "birdjud_resumo_publicacoes",
    idioma: "pt_BR",
    texto: comRodape(
      "{{1}}: voce tem {{2}} publicacao(oes) nova(s), sendo {{3}} urgente(s). " +
        "Abra o sistema para ler o texto completo. O prazo indicado e leitura " +
        "automatica e serve como alerta — confira sempre nos autos.",
      4,
    ),
    parametros: ["nome do escritorio", "quantidade", "urgentes", TELEFONE_DO_ESCRITORIO],
  },
  RESUMO_DO_DIA: {
    nome: "birdjud_resumo_do_dia",
    idioma: "pt_BR",
    texto: comRodape(
      "{{1}}: o seu dia tem {{2}} Abra o sistema para ver os detalhes. " +
        "Esta mensagem so e enviada quando ha algo no dia.",
      3,
    ),
    parametros: ["nome do escritorio", "o resumo em numeros", TELEFONE_DO_ESCRITORIO],
  },
  LEMBRETE_AO_PARTICIPANTE: {
    nome: "birdjud_lembrete_participante",
    idioma: "pt_BR",
    texto: comRodape(
      "{{1}}, o escritorio {{2}} lembra: {{3}} em {{4}}. {{5}}. " +
        "Responda 1 para confirmar presenca ou 2 para avisar que nao podera ir.",
      6,
    ),
    parametros: [
      "nome de quem recebe",
      "nome do escritorio",
      "o que e",
      "quando",
      "onde, ou o processo",
      TELEFONE_DO_ESCRITORIO,
    ],
  },
  LEMBRETE_COMPROMISSO: {
    nome: "birdjud_lembrete_compromisso",
    idioma: "pt_BR",
    texto: comRodape(
      "{{1}}: lembrete de {{2}} em {{3}}. {{4}}. Confira a agenda no sistema.",
      5,
    ),
    parametros: [
      "nome do escritorio",
      "titulo",
      "data e hora",
      "local ou processo",
      TELEFONE_DO_ESCRITORIO,
    ],
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
export function limparParametro(
  valor: string | null | undefined,
  limite = 200,
): string {
  const limpo = (valor ?? "").replace(/\s+/g, " ").trim();
  if (!limpo) return "—";
  return limpo.length <= limite ? limpo : `${limpo.slice(0, limite - 1)}…`;
}
