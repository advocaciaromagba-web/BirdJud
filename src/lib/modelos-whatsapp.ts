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
// TRES REGRAS DA META QUE DERRUBAM O MODELO NA APROVACAO, e nenhuma delas
// aparece como erro no codigo — so na recusa, dias depois:
//
//   - o corpo NAO pode COMECAR com parametro. "{{1}}: voce tem..." e recusado;
//     "Aviso do escritorio {{1}}: voce tem..." passa;
//   - o corpo NAO pode TERMINAR com parametro. Por isso o telefone tem texto
//     fixo depois dele, e nao so um ponto;
//   - dois parametros nao podem ficar COLADOS, sem texto entre eles.
//
// A razao e sempre a mesma: modelo que e quase so variavel pode virar
// qualquer coisa depois de aprovado, e a revisao nao teria servido para nada.
// O teste em testes/resposta-whatsapp.test.ts guarda as tres.

export type ModeloDeAviso = {
  nome: string;
  idioma: string;
  /** O texto exato submetido a Meta, para conferencia e para a documentacao. */
  texto: string;
  /** O que cada {{n}} significa, na ordem. */
  parametros: string[];
};

/** A frase que fecha toda mensagem. O {{n}} e o telefone do escritorio. */
const RODAPE =
  "Este numero so envia avisos e nao recebe mensagens. Em caso de duvida, ligue para {{N}}, que e o telefone do escritorio.";

const TELEFONE_DO_ESCRITORIO = "telefone do escritorio";

function comRodape(texto: string, numeroDoParametro: number): string {
  return `${texto} ${RODAPE.replace("{{N}}", `{{${numeroDoParametro}}}`)}`;
}

export const MODELOS: Record<string, ModeloDeAviso> = {
  RESUMO_PUBLICACOES: {
    nome: "birdjud_resumo_publicacoes",
    idioma: "pt_BR",
    texto: comRodape(
      "Aviso do escritorio {{1}}: voce tem {{2}} publicacao(oes) nova(s), sendo " +
        "{{3}} urgente(s). " +
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
      "Resumo do dia no escritorio {{1}}: o seu dia tem {{2}} Abra o sistema para " +
        "ver os detalhes. " +
        "Esta mensagem so e enviada quando ha algo no dia.",
      3,
    ),
    parametros: ["nome do escritorio", "o resumo em numeros", TELEFONE_DO_ESCRITORIO],
  },
  LEMBRETE_AO_PARTICIPANTE: {
    nome: "birdjud_lembrete_participante",
    idioma: "pt_BR",
    texto: comRodape(
      "Ola, {{1}}. O escritorio {{2}} lembra: {{3}} em {{4}}. {{5}}. " +
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
  TAREFA_DESIGNADA: {
    nome: "birdjud_tarefa_designada",
    idioma: "pt_BR",
    texto: comRodape(
      "No escritorio {{1}}, a tarefa {{2}} ficou para voce. Quando: {{3}}. " +
        "Sobre: {{4}}. Abra o sistema para ver os detalhes.",
      5,
    ),
    parametros: [
      "nome do escritorio",
      "o que e",
      "quando",
      "cliente ou processo",
      TELEFONE_DO_ESCRITORIO,
    ],
  },
  COMPROMISSO_MARCADO: {
    nome: "birdjud_compromisso_marcado",
    idioma: "pt_BR",
    texto: comRodape(
      "Ola, {{1}}. O escritorio {{2}} marcou {{3}} para {{4}}. {{5}}. " +
        "Voce recebera lembretes 3 dias antes, 1 dia antes e 1 hora antes.",
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
  // ATENCAO: este modelo precisa ser aprovado na Meta COM CABECALHO DO TIPO
  // DOCUMENTO. Um modelo so de texto recebendo um PDF no cabecalho e recusado,
  // e a mensagem de erro da Meta nao diz que o problema e esse.
  DOCUMENTO: {
    nome: "birdjud_documento",
    idioma: "pt_BR",
    texto: comRodape(
      "Ola, {{1}}. O escritorio {{2}} enviou em anexo: {{3}}. {{4}}.",
      5,
    ),
    parametros: [
      "nome de quem recebe",
      "nome do escritorio",
      "o que e o documento",
      "o que fazer com ele",
      TELEFONE_DO_ESCRITORIO,
    ],
  },
  LEMBRETE_COMPROMISSO: {
    nome: "birdjud_lembrete_compromisso",
    idioma: "pt_BR",
    texto: comRodape(
      "Agenda do escritorio {{1}}: lembrete de {{2}} em {{3}}. {{4}}. " +
        "Confira a agenda no sistema.",
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
  // Alerta INTERNO: vai so para a pessoa do escritorio que enviou a mensagem
  // que nao chegou (ver docs/ENTREGA-DE-MENSAGENS.md). Nunca para o cliente.
  FALHA_DE_ENTREGA: {
    nome: "birdjud_mensagem_nao_entregue",
    idioma: "pt_BR",
    texto: comRodape(
      "No escritorio {{1}}, a mensagem que voce enviou ({{2}}) para {{3}} nao chegou. " +
        "Motivo: {{4}}. Abra o sistema em Mensagens para reenviar ou marcar como resolvida.",
      5,
    ),
    parametros: [
      "nome do escritorio",
      "o que era a mensagem",
      "quem deveria receber",
      "o motivo",
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
