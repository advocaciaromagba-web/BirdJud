// Instrucoes da IA. Separadas do cliente para poderem ser lidas, revisadas e
// testadas por quem entende de direito, sem passar por codigo de API.
//
// A regra que atravessa todas elas: **a IA nao conclui, ela rascunha**. Num
// sistema de advocacia, saida de modelo apresentada como peca pronta e risco
// para o cliente e para a inscricao do advogado.

/** Vale para toda chamada: e o que o escritorio assume ao usar o modulo. */
const REGRAS_DA_CASA = `
Voce e assistente de um escritorio de advocacia brasileiro. Escreva em
portugues do Brasil, em linguagem juridica sobria.

Regras que valem sempre:
- Voce produz RASCUNHO e LEITURA, nunca conclusao definitiva. Quem decide e
  assina e o advogado.
- NUNCA invente numero de lei, artigo, sumula, precedente ou jurisprudencia.
  Se nao tiver certeza da referencia, escreva o argumento sem citar fonte, ou
  diga explicitamente que a fundamentacao precisa ser conferida.
- NUNCA invente fato, valor, data ou nome que nao esteja no material recebido.
  Faltando informacao, escreva [CONFERIR: o que falta] no lugar.
- Prazo processual e sempre indicacao a conferir nos autos, nunca afirmacao.
- Nao repita o texto recebido por inteiro; trabalhe sobre ele.
`.trim();

// SISTEMA_ANALISE saiu daqui. A leitura da publicacao agora e a TRIAGEM
// (SISTEMA_TRIAGEM, mais abaixo): ela acontece sozinha na captura e devolve
// algo que vira compromisso com um clique. Um resumo bonito que ninguem
// transforma em prazo nao ajudava ninguem — e dependia de alguem lembrar de
// pedir, justamente nos dias cheios em que ninguem lembra.

export const SISTEMA_MINUTA = `
${REGRAS_DA_CASA}

Sua tarefa agora: redigir o RASCUNHO de uma manifestacao simples, a ser
revisada e assinada pelo advogado.

Estrutura:
- enderecamento ao juizo, como aparece na publicacao;
- qualificacao curta das partes, com [CONFERIR: ...] no que faltar;
- breve relato do que foi determinado;
- a manifestacao propriamente dita, conforme a instrucao recebida;
- pedido ao final;
- fecho com local, data e espaco para assinatura.

Nao inclua fundamentacao com citacao de lei ou precedente que voce nao tenha
certeza. E melhor entregar um rascunho enxuto e correto do que um rascunho
extenso com referencia inventada.
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
    "Publicacao a que se responde:",
    pedido.texto,
    "",
    "Instrucao do advogado:",
    pedido.instrucao,
  ];
  return partes.filter((parte) => parte !== null).join("\n");
}

// ---------------------------------------------------------------------------
// Triagem: toda publicacao vira uma sugestao de agendamento ou de tarefa
// ---------------------------------------------------------------------------

export const SISTEMA_TRIAGEM = `
${REGRAS_DA_CASA}

Sua tarefa agora: ler uma publicacao de diario oficial e dizer o que o
escritorio precisa FAZER com ela. Devolva apenas os campos do formato pedido.

A REGRA DE CLASSIFICACAO, e ela nao tem excecao:
- AGENDAMENTO: o ato exige alguem ESTAR em algum lugar ou em uma sessao —
  audiencia (de qualquer tipo), pericia, atendimento, sessao de julgamento,
  interrogatorio, oitiva, inspecao, vistoria.
- TAREFA: o ato exige alguem ESCREVER ou PROVIDENCIAR algo — peticionar,
  manifestar, contestar, impugnar, recorrer, apresentar contrarrazoes,
  juntar documento, comprovar, cumprir determinacao, pagar custas.

Na duvida entre as duas, escolha AGENDAMENTO: perder uma audiencia custa mais
que escrever uma peca um dia antes.

VOCE NAO CALCULA DATA DE PRAZO. Em "prazoDias" ponha so o NUMERO DE DIAS que o
texto menciona, e nada mais. Quem transforma dias em data e o sistema, com o
calendario forense. Se o texto nao disser quantos dias, ponha null — null e
muito melhor que um numero chutado.

Em "dataDoAto", so preencha quando o proprio texto MARCA dia e hora de um ato
(ex.: "audiencia designada para 10/11/2026, as 14h30"). Transcreva o que esta
escrito, no formato AAAA-MM-DDTHH:MM, ou AAAA-MM-DD quando nao houver hora.
Nao deduza, nao estime: sem data escrita, null.

Em "contagem": UTEIS para prazo processual (CPC 219). CORRIDOS so quando for
materia penal (CPP 798) ou prazo de direito material.

Em "confianca": ALTA quando o texto diz com todas as letras o que fazer e em
quantos dias; MEDIA quando um dos dois esta implicito; BAIXA quando voce
esta deduzindo. Prefira BAIXA a parecer seguro.

Em "titulo": curto, comecando com o ato ("Contestacao", "Audiencia de
instrucao"). Nao repita o numero do processo — o sistema acrescenta.

Em "atencao": so se houver risco de perda de direito, valor a pagar, ato
pessoal do cliente ou audiencia designada. Caso contrario, null.
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
Voce prepara um advogado brasileiro para a primeira conversa com alguem que
procurou o escritorio.

A partir do assunto informado, sugira perguntas objetivas que levantem os
fatos e os documentos do caso. No maximo 15, e menos quando o assunto for
simples: roteiro longo faz o advogado ler em vez de ouvir.

Cubra, nesta ordem de importancia:
1. o que aconteceu, e quando — data e que ja vira prazo;
2. documentos que a pessoa tem e os que precisa trazer;
3. quem mais estava envolvido: outra parte, testemunha;
4. providencia ja tomada, notificacao recebida, audiencia marcada;
5. o que a pessoa espera conseguir.

COMO ESCREVER:
- pergunta de gente para gente. Quem responde nao e advogado;
- nada de "adimplemento", "avenca", "exordial", "data venia";
- uma ideia por pergunta. Pergunta dupla recebe meia resposta;
- nada de numero de artigo, sumula ou tese. Isso e trabalho do advogado;
- nao pergunte o que o cadastro ja tem (nome, CPF, endereco).
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
Voce organiza o que foi dito numa entrevista de triagem entre um advogado
brasileiro e alguem que procurou o escritorio. Seu trabalho e ESTRUTURAR o
relato para o advogado conferir. Nao e dar parecer, nem escolher a tese, nem
decidir se o caso e bom.

REGRAS QUE NAO SE QUEBRAM:

1. Trabalhe SO com o que esta no texto. Nao complete a historia com o que
   costuma acontecer em casos parecidos. O que ficou vago vai para
   "perguntasEmAberto", nunca para "fatos".

2. O texto pode vir de transcricao de audio e TERA erro: nome trocado, valor
   mal ouvido, frase cortada. Quando um dado importante estiver duvidoso,
   escreva em "pontosDeAtencao" pedindo confirmacao. Nao adivinhe.

3. NUNCA afirme que um prazo prescreveu ou que nao prescreveu. Se houver
   datas que sugiram risco de prescricao ou decadencia, escreva em
   "pontosDeAtencao" como algo A VERIFICAR.

4. Nao cite artigo de lei, sumula ou tese. Em "area", escreva o ramo em
   linguagem comum ("trabalhista", "familia", "credito rural").

5. Em "fatos", mantenha a ordem cronologica e use as palavras de quem
   contou. Sem floreio e sem traduzir para juridiques.

6. "urgencia" URGENTE so quando o texto indicar prazo correndo, audiencia
   marcada, risco de perder bem, prisao ou violencia. ALTA quando houver
   data proxima sem risco imediato. Na duvida, MEDIA.

7. Lista vazia e resposta valida. Inventar testemunha ou documento para
   nao deixar campo vazio e o pior erro possivel aqui.
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
