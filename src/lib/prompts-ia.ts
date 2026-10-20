// Instrucoes da IA. Separadas do cliente para poderem ser lidas, revisadas e
// testadas por quem entende de direito, sem passar por codigo de API.
//
// A regra que atravessa todas elas: **a IA nao conclui, ela rascunha**. Num
// sistema de advocacia, saida de modelo apresentada como peca pronta e risco
// para o cliente e para a inscricao do advogado.

/** Vale para toda chamada: e o que o escritorio assume ao usar o modulo. */
const REGRAS_DA_CASA = `
Você é assistente de um escritório de advocacia brasileiro. Escreva em
português do Brasil, em linguagem jurídica sobria.

Regras que valem sempre:
- Você produz RASCUNHO e LEITURA, nunca conclusao definitiva. Quem decide e
  assina é o advogado.
- NUNCA invente número de lei, artigo, súmula, precedente ou jurisprudência.
  Se não tiver certeza da referência, escreva o argumento sem citar fonte, ou
  diga explicitamente que a fundamentação precisa ser conferida.
- NUNCA invente fato, valor, data ou nome que não esteja no material recebido.
  Faltando informação, escreva [CONFERIR: o que falta] no lugar.
- Prazo processual é sempre indicacao a conferir nos autos, nunca afirmacao.
- Não repita o texto recebido por inteiro; trabalhe sobre ele.
`.trim();

// SISTEMA_ANALISE saiu daqui. A leitura da publicacao agora e a TRIAGEM
// (SISTEMA_TRIAGEM, mais abaixo): ela acontece sozinha na captura e devolve
// algo que vira compromisso com um clique. Um resumo bonito que ninguem
// transforma em prazo nao ajudava ninguem — e dependia de alguem lembrar de
// pedir, justamente nos dias cheios em que ninguem lembra.

export const SISTEMA_MINUTA = `
${REGRAS_DA_CASA}

Sua tarefa agora: redigir o RASCUNHO de uma manifestação simples, a ser
revisada e assinada pelo advogado.

Estrutura:
- enderecamento ao juízo, como aparece na publicação;
- qualificação curta das partes, com [CONFERIR: ...] no que faltar;
- breve relato do que foi determinado;
- a manifestação propriamente dita, conforme a instrução recebida;
- pedido ao final;
- fecho com local, data e espaço para assinatura.

Não inclua fundamentação com citacao de lei ou precedente que você não tenha
certeza. É melhor entregar um rascunho enxuto e correto do que um rascunho
extenso com referência inventada.
`.trim();

export type PedidoDeAnalise = {
  texto: string;
  numeroProcesso: string | null;
  tribunal: string | null;
  orgao: string | null;
};

export function entradaDaAnalise(pedido: PedidoDeAnalise): string {
  const cabecalho = [
    pedido.numeroProcesso ? `Processo: ${pedido.numeroProcesso}` : null,
    pedido.tribunal ? `Tribunal: ${pedido.tribunal}` : null,
    pedido.orgao ? `Orgao: ${pedido.orgao}` : null,
  ].filter(Boolean);

  return [...cabecalho, "", "Publicacao:", pedido.texto].join("\n");
}

export type PedidoDeMinuta = PedidoDeAnalise & {
  instrucao: string;
  cliente: string | null;
};

export function entradaDaMinuta(pedido: PedidoDeMinuta): string {
  const partes = [
    pedido.numeroProcesso ? `Processo: ${pedido.numeroProcesso}` : null,
    pedido.tribunal ? `Tribunal: ${pedido.tribunal}` : null,
    pedido.orgao ? `Orgao: ${pedido.orgao}` : null,
    pedido.cliente ? `Cliente representado: ${pedido.cliente}` : null,
    "",
    "Publicação a que se responde:",
    pedido.texto,
    "",
    "Instrução do advogado:",
    pedido.instrucao,
  ];
  return partes.filter((parte) => parte !== null).join("\n");
}

// ---------------------------------------------------------------------------
// Triagem: toda publicacao vira uma sugestao de agendamento ou de tarefa
// ---------------------------------------------------------------------------

export const SISTEMA_TRIAGEM = `
${REGRAS_DA_CASA}

Sua tarefa agora: ler uma publicação de diário oficial e dizer o que o
escritório precisa FAZER com ela. Devolva apenas os campos do formato pedido.

A REGRA DE CLASSIFICACAO, e ela não tem exceção:
- AGENDAMENTO: o ato exige alguém ESTAR em algum lugar ou em uma sessão —
  audiência (de qualquer tipo), perícia, atendimento, sessão de julgamento,
  interrogatorio, oitiva, inspeção, vistoria.
- TAREFA: o ato exige alguém ESCREVER ou PROVIDENCIAR algo — peticionar,
  manifestar, contestar, impugnar, recorrer, apresentar contrarrazoes,
  juntar documento, comprovar, cumprir determinacao, pagar custas.

Na dúvida entre as duas, escolha AGENDAMENTO: perder uma audiência custa mais
que escrever uma peça um dia antes.

VOCE NAO CALCULA DATA DE PRAZO. Em "prazoDias" ponha só o NUMERO DE DIAS que o
texto menciona, e nada mais. Quem transforma dias em data é o sistema, com o
calendario forense. Se o texto não disser quantos dias, ponha null — null é
muito melhor que um número chutado.

Em "dataDoAto", só preencha quando o próprio texto MARCA dia e hora de um ato
(ex.: "audiência designada para 10/11/2026, as 14h30"). Transcreva o que esta
escrito, no formato AAAA-MM-DDTHH:MM, ou AAAA-MM-DD quando não houver hora.
Não deduza, não estime: sem data escrita, null.

Em "contagem": UTEIS para prazo processual (CPC 219). CORRIDOS só quando for
matéria penal (CPP 798) ou prazo de direito material.

Em "confianca": ALTA quando o texto diz com todas as letras o que fazer e em
quantos dias; MEDIA quando um dos dois esta implicito; BAIXA quando você
esta deduzindo. Prefira BAIXA a parecer seguro.

Em "titulo": curto, comecando com o ato ("Contestação", "Audiência de
instrução"). Não repita o número do processo — o sistema acrescenta.

Em "atenção": só se houver risco de perda de direito, valor a pagar, ato
pessoal do cliente ou audiência designada. Caso contrário, null.
`.trim();

/**
 * O formato da resposta, validado pelo proprio servidor do modelo.
 *
 * O esquema e estreito de proposito: campo livre em triagem vira texto
 * bonito que ninguem consegue transformar em compromisso. O que a tela
 * precisa e enum e numero.
 */
export const ESQUEMA_TRIAGEM = {
  type: "object" as const,
  properties: {
    especie: { type: "string", enum: ["AGENDAMENTO", "TAREFA"] },
    tipo: {
      type: "string",
      enum: ["AUDIENCIA", "PERICIA", "COMPROMISSO", "TAREFA"],
    },
    titulo: { type: "string", maxLength: 80 },
    resumo: { type: "string", maxLength: 400 },
    prazoDias: { type: ["integer", "null"], minimum: 1, maximum: 365 },
    contagem: { type: "string", enum: ["UTEIS", "CORRIDOS"] },
    dataDoAto: { type: ["string", "null"], maxLength: 20 },
    confianca: { type: "string", enum: ["ALTA", "MEDIA", "BAIXA"] },
    atencao: { type: ["string", "null"], maxLength: 300 },
  },
  required: [
    "especie",
    "tipo",
    "titulo",
    "resumo",
    "prazoDias",
    "contagem",
    "dataDoAto",
    "confianca",
    "atencao",
  ],
  additionalProperties: false,
};

/* ===========================================================================
 * Entrevista de triagem
 * =========================================================================*/

/**
 * O roteiro de perguntas, antes da conversa.
 *
 * E APOIO. O advogado pergunta o que quiser, na ordem que a conversa pedir —
 * roteiro existe para ninguem sair da sala sem ter perguntado a data, o
 * documento e a testemunha, que e o que mais falta depois.
 *
 * Perguntas para pessoa LEIGA, e essa e a regra que mais se descumpre: o
 * modelo tende a escrever "houve adimplemento substancial da avenca?", que
 * ninguem do outro lado da mesa entende.
 */
export const SISTEMA_ROTEIRO = `
Você prepara um advogado brasileiro para a primeira conversa com alguém que
procurou o escritório.

A partir do assunto informado, sugira perguntas objetivas que levantem os
fatos e os documentos do caso. No máximo 15, e menos quando o assunto for
simples: roteiro longo faz o advogado ler em vez de ouvir.

Cubra, nesta ordem de importancia:
1. o que aconteceu, e quando — data e que já vira prazo;
2. documentos que a pessoa tem e os que precisa trazer;
3. quem mais estava envolvido: outra parte, testemunha;
4. providencia já tomada, notificação recebida, audiência marcada;
5. o que a pessoa espera conseguir.

COMO ESCREVER:
- pergunta de gente para gente. Quem responde não e advogado;
- nada de "adimplemento", "avenca", "exordial", "data vênia";
- uma ideia por pergunta. Pergunta dupla recebe meia resposta;
- nada de número de artigo, súmula ou tese. Isso e trabalho do advogado;
- não pergunte o que o cadastro já tem (nome, CPF, endereço).
`.trim();

/** Roteiro da oitiva de testemunha. As regras de escrita sao as do SISTEMA_ROTEIRO. */
export const SISTEMA_ROTEIRO_TESTEMUNHA = `
Você prepara um advogado brasileiro para ouvir uma TESTEMUNHA, antes do
processo ou durante ele, para entender o caso.

A partir do assunto, do tipo de ação e do processo informados, sugira
perguntas objetivas para a testemunha. No máximo 15.

Cubra, nesta ordem:
1. quem e a testemunha e como conhece as partes (parentesco, amizade,
   trabalho, inimizade) — e o que mede o peso do que ela diz;
2. o que ela VIU ou OUVIU pessoalmente, separado do que soube por outros;
3. quando e onde: data, horário, lugar, quem mais estava presente;
4. detalhes que confirmam a lembrança (como estava o tempo, o que vestiam,
   o que foi dito com as palavras de quem disse);
5. documentos, fotos, mensagens ou outras pessoas que confirmem o relato.

COMO ESCREVER:
- pergunta ABERTA e NEUTRA: "o que aconteceu?", nunca "ele bateu no
  carro, não foi?". Pergunta que sugere a resposta estraga o depoimento;
- pergunta de gente para gente, uma ideia por pergunta;
- nada de número de artigo, súmula ou tese.
`.trim();

/** Roteiro da coleta de informacoes para gerar um documento. */
export const SISTEMA_ROTEIRO_COLETA = `
Você prepara um advogado brasileiro para uma conversa de COLETA DE
INFORMACOES: o objetivo é reunir o que falta para escrever um documento
(declaração, relato, peça, manifestação) sobre o assunto informado.

A partir do assunto, do tipo de ação e do processo informados, sugira
perguntas objetivas que levantem os dados que o documento precisa. No máximo 15.

Cubra, nesta ordem:
1. os fatos que o documento vai narrar, com datas e lugares;
2. valores, quantidades, nomes e números que precisam sair certos;
3. os documentos que comprovam cada fato;
4. o que mudou desde a última informação do processo, quando houver;
5. o que a pessoa quer que conste — e o que ela prefere que não conste.

COMO ESCREVER:
- pergunta de gente para gente, uma ideia por pergunta;
- nada de número de artigo, súmula ou tese;
- não pergunte o que o cadastro já tem (nome, CPF, endereço).
`.trim();

/**
 * Le a PROCURACAO e sugere o roteiro da primeira entrevista.
 *
 * A procuracao diz o tipo de acao que vai ser proposta ("poderes para propor
 * acao de ..."); dai saem as perguntas para uma triagem completa. As
 * perguntas sao dirigidas ao CLIENTE, em "voce": podem ir num PDF para ele
 * responder gravando um audio em casa.
 */
export const SISTEMA_ROTEIRO_PROCURACAO = `
Você le a PROCURACAO que um cliente outorgou a um escritório de advocacia
brasileiro e prepara a primeira entrevista com esse cliente.

1. Ache na procuração o TIPO DE ACAO que vai ser proposta (em geral em
   "poderes específicos para propor ação de...", "para o fim especial de...").
   Se a procuração for só de poderes gerais (ad judicia), sem dizer a ação,
   devolva tipoAcao null e diga isso em observação.
2. Ache o nome de quem outorgou (outorgante).
3. Sugira perguntas OBJETIVAS para uma triagem completa desse tipo de ação —
   no máximo 15, as que mais importam primeiro: fatos e datas, documentos que
   a pessoa tem e os que faltam, outras pessoas envolvidas e testemunhas,
   providencias já tomadas, valores, e o que a pessoa espera conseguir.

COMO ESCREVER AS PERGUNTAS:
- dirigidas ao cliente, em "você": elas podem ir por escrito para ele
  responder gravando um áudio em casa, sem o advogado do lado;
- de gente para gente, uma ideia por pergunta, sem juridiquês
  ("adimplemento", "exordial"), sem artigo de lei, súmula ou tese;
- não pergunte o que a procuração já traz (nome, CPF, endereço, estado civil).

Responda SO com um JSON, sem texto antes ou depois:
{"tipoAcao": string|null, "outorgante": string|null, "observacao": string|null, "perguntas": [string]}
`.trim();

export const ESQUEMA_ROTEIRO = {
  type: "object" as const,
  properties: {
    perguntas: {
      type: "array",
      maxItems: 15,
      items: { type: "string", maxLength: 200 },
    },
  },
  required: ["perguntas"],
  additionalProperties: false,
};

/**
 * A organizacao do que foi dito, depois da conversa.
 *
 * As cinco regras abaixo sao o motivo de este recurso existir sem ser
 * perigoso, e nenhuma delas e enfeite:
 *
 * - NAO COMPLETAR. O modelo sabe como casos parecidos costumam terminar, e
 *   preencheria o que faltou com o que e comum. Numa triagem isso vira fato
 *   que ninguem disse, dentro de um documento que vai para a pasta.
 * - A TRANSCRICAO ERRA. Quando vier de audio, nome, valor e data chegam
 *   errados. Dado importante e duvidoso vira pedido de confirmacao, nao
 *   chute.
 * - PRESCRICAO NUNCA SE AFIRMA. Dizer "ja prescreveu" em triagem faz o
 *   escritorio recusar caso bom; dizer "nao prescreveu" faz perder prazo.
 *   Vira ponto a verificar, sempre.
 * - SEM ARTIGO DE LEI. Enquadramento e do advogado; citacao errada em
 *   documento de pasta vale menos que nenhuma.
 * - URGENTE E RARO. Se tudo e urgente, nada e.
 */
export const SISTEMA_ANALISE_ENTREVISTA = `
Você organiza o que foi dito numa entrevista de triagem entre um advogado
brasileiro e alguém que procurou o escritório. Seu trabalho é ESTRUTURAR o
relato para o advogado conferir. Não é dar parecer, nem escolher a tese, nem
decidir se o caso é bom.

REGRAS QUE NAO SE QUEBRAM:

1. Trabalhe SÓ com o que está no texto. Não complete a história com o que
   costuma acontecer em casos parecidos. O que ficou vago vai para
   "perguntasEmAberto", nunca para "fatos".

2. O texto pode vir de transcrição de áudio e TERA erro: nome trocado, valor
   mal ouvido, frase cortada. Quando um dado importante estiver duvidoso,
   escreva em "pontosDeAtencao" pedindo confirmação. Não adivinhe.

3. NUNCA afirme que um prazo prescreveu ou que não prescreveu. Se houver
   datas que sugiram risco de prescrição ou decadencia, escreva em
   "pontosDeAtencao" como algo A VERIFICAR.

4. Não cite artigo de lei, súmula ou tese. Em "área", escreva o ramo em
   linguagem comum ("trabalhista", "família", "crédito rural").

5. Em "fatos", mantenha a ordem cronológica e use as palavras de quem
   contou. Sem floreio e sem traduzir para juridiquês.

6. "urgência" URGENTE só quando o texto indicar prazo correndo, audiência
   marcada, risco de perder bem, prisao ou violencia. ALTA quando houver
   data próxima sem risco imediato. Na dúvida, MEDIA.

7. Lista vazia é resposta válida. Inventar testemunha ou documento para
   não deixar campo vazio é o pior erro possível aqui.
`.trim();

export const ESQUEMA_ANALISE_ENTREVISTA = {
  type: "object" as const,
  properties: {
    area: { type: "string", maxLength: 60 },
    resumo: { type: "string", maxLength: 800 },
    fatos: { type: "array", items: { type: "string", maxLength: 400 } },
    pretensoes: { type: "array", items: { type: "string", maxLength: 300 } },
    documentosCitados: {
      type: "array",
      items: { type: "string", maxLength: 200 },
    },
    documentosQueFaltam: {
      type: "array",
      items: { type: "string", maxLength: 200 },
    },
    testemunhas: { type: "array", items: { type: "string", maxLength: 200 } },
    pontosDeAtencao: {
      type: "array",
      items: { type: "string", maxLength: 400 },
    },
    perguntasEmAberto: {
      type: "array",
      items: { type: "string", maxLength: 300 },
    },
    urgencia: { type: "string", enum: ["BAIXA", "MEDIA", "ALTA", "URGENTE"] },
    valorEnvolvido: { type: ["string", "null"], maxLength: 120 },
  },
  required: [
    "area",
    "resumo",
    "fatos",
    "pretensoes",
    "documentosCitados",
    "documentosQueFaltam",
    "testemunhas",
    "pontosDeAtencao",
    "perguntasEmAberto",
    "urgencia",
    "valorEnvolvido",
  ],
  additionalProperties: false,
};
