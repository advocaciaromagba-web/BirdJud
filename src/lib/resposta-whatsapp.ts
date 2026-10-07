// O que a pessoa respondeu no WhatsApp, e o que isso quer dizer.
//
// O sistema manda o lembrete da audiencia. Quem recebe responde "sim", "1",
// "nao posso", "quem e?" ou um audio. Este arquivo decide o que fazer com
// isso — e, de proposito, decide POUCO.
//
// A ASSIMETRIA QUE MANDA NO DESENHO: marcar errado "nao vai" custa um
// telefonema do escritorio. Marcar errado "confirmado" custa uma audiencia em
// que o cliente nao aparece — e quem responde por isso e o advogado, na frente
// do juiz. As duas leituras erradas NAO tem o mesmo preco, entao a duvida
// sempre cai para o lado de NAO confirmar.
//
// Por isso: negacao vence; mensagem comprida nunca confirma sozinha; e o que
// nao se entende fica para uma pessoa ler, com o cliente avisado de que
// alguem vai falar com ele.

export type Intencao = "CONFIRMA" | "DESMARCA" | "PARAR" | "NAO_ENTENDI";

/**
 * Acima disto, e gente falando, nao e resposta de formulario.
 *
 * "Nao posso ir dia 10, da para remarcar?" e uma frase para uma pessoa ler. Um
 * sistema que tenta interpretar isso acerta quase sempre — e o quase sempre e
 * o problema.
 */
export const MAXIMO_DE_PALAVRAS = 6;
export const MAXIMO_DE_LETRAS = 40;

/** Quanto tempo depois do lembrete uma resposta ainda e resposta DAQUELE lembrete. */
export const JANELA_DE_RESPOSTA_HORAS = 72;

/** Tira acento, pontuacao e emoji: "Não!! 👎" vira "nao". */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Sair da lista. Exige frase propria, nao palavra solta.
 *
 * "cancelar" sozinho quer dizer cancelar a AUDIENCIA, nao parar de receber
 * mensagem. Confundir as duas coisas tira do ar o aviso de quem so queria
 * desmarcar um compromisso.
 */
const PARAR = new Set([
  "parar",
  "pare",
  "sair",
  "stop",
  "descadastrar",
  "remover",
  "cancelar inscricao",
  "nao quero mais receber",
  "nao quero receber",
  "parar de receber",
]);

/** Emoji de positivo e negativo, que somem na normalizacao. */
const POLEGAR_PARA_CIMA = /[\u{1F44D}\u{2705}\u{1F44C}]/u;
const POLEGAR_PARA_BAIXO = /[\u{1F44E}\u{274C}\u{1F6AB}]/u;

const NEGACAO = [
  "nao",
  "n",
  "2",
  "nunca",
  "impossivel",
  "desmarcar",
  "desmarca",
  "cancelar",
  "cancela",
  "remarcar",
  "remarca",
  "adiar",
];

const AFIRMACAO = [
  "sim",
  "s",
  "1",
  "ok",
  "okay",
  "confirmo",
  "confirmado",
  "confirmada",
  "confirma",
  "confirmar",
  "certo",
  "positivo",
  "estarei",
  "vou",
  "irei",
  "combinado",
  "beleza",
];

function temPalavra(palavras: string[], lista: string[]): boolean {
  return palavras.some((p) => lista.includes(p));
}

/**
 * O que a mensagem quer dizer.
 *
 * A ordem das regras E a regra: parar primeiro, porque e pedido legal e nao
 * pode ser engolido por outra leitura; negacao depois, porque "nao confirmo"
 * contem "confirmo" e uma busca ingenua por palavra marcaria a audiencia como
 * confirmada; e so entao a afirmacao.
 */
export function interpretar(bruto: string | null | undefined): Intencao {
  const original = (bruto ?? "").trim();
  if (original === "") return "NAO_ENTENDI";

  const texto = normalizar(original);
  const palavras = texto.split(" ").filter(Boolean);

  if (PARAR.has(texto)) return "PARAR";

  const comprida =
    palavras.length > MAXIMO_DE_PALAVRAS || texto.length > MAXIMO_DE_LETRAS;

  // Negacao vence, inclusive em mensagem comprida: quem escreveu "nao" sobre
  // uma audiencia nao esta confirmando, e deixar isso como "nao entendi"
  // esconderia uma ausencia que o escritorio precisa saber hoje.
  if (POLEGAR_PARA_BAIXO.test(original)) return "DESMARCA";
  if (temPalavra(palavras, NEGACAO)) return "DESMARCA";

  // Afirmacao, nunca em mensagem comprida: um texto longo que por acaso tem a
  // palavra "vou" no meio nao e uma confirmacao de audiencia.
  if (comprida) return "NAO_ENTENDI";
  if (POLEGAR_PARA_CIMA.test(original)) return "CONFIRMA";
  if (temPalavra(palavras, AFIRMACAO)) return "CONFIRMA";

  return "NAO_ENTENDI";
}

export type DadosDaResposta = {
  nomeEscritorio: string;
  /** O telefone do escritorio — este numero nao atende. */
  telefoneDoEscritorio?: string | null;
  /** O que foi lembrado, quando ha um compromisso ligado a resposta. */
  titulo?: string | null;
  quando?: string | null;
};

/**
 * O que o sistema responde.
 *
 * Dentro das 24 horas abertas pela mensagem de quem escreveu, a Meta entrega
 * texto livre — e esta e a unica hora em que este sistema manda texto livre.
 *
 * A resposta NUNCA promete o que o sistema nao faz: nao diz "remarcado", nao
 * diz "o advogado vai la", e NAO DIZ QUE ALGUEM VAI LER. Este numero e so de
 * aviso — quem precisa falar com o escritorio liga para o escritorio, e o
 * telefone dele vai escrito aqui. Prometer atendimento num numero que nao
 * atende e pior do que nao responder nada.
 */
export function textoDaResposta(intencao: Intencao, d: DadosDaResposta): string {
  const oQue = d.titulo && d.quando ? `${d.titulo}, em ${d.quando}` : "o compromisso";
  const ondeFalar = d.telefoneDoEscritorio?.trim()
    ? `ligue para o escritorio: ${d.telefoneDoEscritorio.trim()}.`
    : `procure o escritorio pelos canais de sempre.`;
  // Em TODA resposta, inclusive na que confirma: este numero notifica e nao
  // atende. Quem escrever aqui esperando o advogado esperaria para sempre.
  const naoAtende = `Este numero so envia avisos e nao recebe mensagens — para falar com alguem, ${ondeFalar}`;

  if (intencao === "CONFIRMA") {
    return (
      `${d.nomeEscritorio}: presenca confirmada em ${oQue}. Obrigado. ${naoAtende}`
    );
  }
  if (intencao === "DESMARCA") {
    return (
      `${d.nomeEscritorio}: anotamos que voce NAO podera comparecer a ${oQue}. ` +
      `O compromisso NAO foi desmarcado no processo — so o escritorio pode fazer isso. ` +
      naoAtende
    );
  }
  if (intencao === "PARAR") {
    return (
      `${d.nomeEscritorio}: voce nao recebera mais avisos por WhatsApp. ` +
      `Para voltar a receber, ${ondeFalar}`
    );
  }
  return (
    `${d.nomeEscritorio}: para confirmar presenca responda 1, e para avisar que ` +
    `nao podera ir responda 2. ${naoAtende}`
  );
}

/** O compromisso e a pessoa que estao na chave do aviso que foi respondido. */
export type OrigemDoAviso = {
  compromissoId: string;
  participanteId: string | null;
  usuarioId: string | null;
};

/**
 * De qual lembrete veio a chave.
 *
 * As chaves sao `zap:lembrete:<compromisso>:<usuario>` e
 * `zap:participante:<compromisso>:<participante>` (ver avisos.ts). Ler a chave
 * e o que liga a resposta ao compromisso sem precisar de uma coluna nova no
 * Aviso — e a chave ja e estavel, porque e ela que impede o aviso repetido.
 */
export function origemDaChave(chave: string): OrigemDoAviso | null {
  const lembrete = /^zap:lembrete:([^:]+):([^:]+)$/.exec(chave);
  if (lembrete) {
    return { compromissoId: lembrete[1], participanteId: null, usuarioId: lembrete[2] };
  }
  const participante = /^zap:participante:([^:]+):([^:]+)$/.exec(chave);
  if (participante) {
    return {
      compromissoId: participante[1],
      participanteId: participante[2],
      usuarioId: null,
    };
  }
  return null;
}

export type AvisoCandidato = {
  id: string;
  escritorioId: string;
  chave: string;
  enviadoEm: Date | null;
};

export type Correspondencia =
  | { tipo: "UM"; aviso: AvisoCandidato }
  | { tipo: "NENHUM" }
  | { tipo: "AMBIGUO"; escritorios: string[] };

/**
 * A qual lembrete esta resposta responde.
 *
 * ESTE E O PONTO PERIGOSO DO ARQUIVO. O numero de quem responde pode ser
 * cliente de DOIS escritorios da plataforma. Responder "confirmada a sua
 * audiencia de amanha" ao escritorio errado conta a um escritorio que aquela
 * pessoa e cliente do outro — e isso nao se desfaz.
 *
 * Por isso: so age quando os candidatos sao todos do MESMO escritorio. Dois
 * escritorios, nenhuma acao automatica e nenhuma resposta; fica para uma
 * pessoa, dos dois lados.
 */
export function aQualLembreteResponde(
  candidatos: AvisoCandidato[],
): Correspondencia {
  const validos = candidatos.filter((a) => a.enviadoEm !== null);
  if (validos.length === 0) return { tipo: "NENHUM" };

  const escritorios = [...new Set(validos.map((a) => a.escritorioId))];
  if (escritorios.length > 1) return { tipo: "AMBIGUO", escritorios };

  // Do mesmo escritorio, o mais recente: e o lembrete que a pessoa acabou de
  // receber, e portanto aquele que ela esta respondendo.
  const maisRecente = [...validos].sort(
    (a, b) => b.enviadoEm!.getTime() - a.enviadoEm!.getTime(),
  )[0];
  return { tipo: "UM", aviso: maisRecente };
}
