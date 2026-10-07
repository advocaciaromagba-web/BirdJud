// Os modelos que ja vem no sistema.
//
// O texto base veio de contratos, procuracoes e declaracoes REAIS de
// escritorio — a estrutura, as clausulas e a redacao de uso corrente. NENHUM
// DADO VEIO JUNTO: nome de cliente, CPF, CNPJ, OAB, valor e objeto da acao
// sairam todos, e no lugar deles ficaram os campos que o sistema preenche com
// os dados de CADA escritorio.
//
// NAO SAO A PECA PRONTA DE NINGUEM. Sao o ponto de partida, para um escritorio
// novo conseguir emitir no primeiro dia. Antes de usar como esta, o advogado
// responsavel le e adapta: a redacao e a responsabilidade sao do escritorio.
import type { Linha } from "./docx";
import { NOME_DA_ESPECIE, type Especie } from "./modelos";

const T = (texto: string): Linha => ({ texto, espacoDepois: true });
const TITULO = (texto: string): Linha => ({
  texto,
  negrito: true,
  centro: true,
  espacoDepois: true,
});
const SUB = (texto: string): Linha => ({ texto, negrito: true, espacoDepois: true });
const BRANCO: Linha = { texto: "", espacoDepois: true };
const CENTRO = (texto: string): Linha => ({ texto, centro: true });

const ASSINA_CLIENTE: Linha[] = [
  BRANCO,
  CENTRO("_______________________________"),
  CENTRO("{{cliente.nome}}"),
];

// ---------------------------------------------------------------------------

const PROCURACAO: Linha[] = [
  TITULO("INSTRUMENTO PARTICULAR DE PROCURACAO"),
  T(
    "{{cliente.qualificacao}}, pelo presente instrumento de Procuracao, nomeia e " +
      "constitui seu bastante procurador {{escritorio.qualificacao}}, representado " +
      "por {{advogados.qualificacao}}, a quem confere amplos poderes para " +
      "representacao em geral, em qualquer orgao, juizo, instancia ou tribunal, " +
      "podendo pelo outorgante assinar, firmar acordos e compromissos, receber e dar " +
      "quitacao ate final decisao, usando os meios e poderes legais que este " +
      "instrumento lhe confere, agindo em conjunto ou separadamente, podendo " +
      "substabelecer esta em outra, com ou sem reservas de iguais poderes, e em " +
      "especial para atuar em {{honorarios.descricao}}, ratificando todos os atos " +
      "necessarios para o bom e cabal desempenho.",
  ),
  BRANCO,
  CENTRO("{{data.cidade_e_data}}"),
  ...ASSINA_CLIENTE,
];

const DECLARACAO: Linha[] = [
  TITULO("DECLARACAO DE HIPOSSUFICIENCIA"),
  T(
    "{{cliente.qualificacao}}, DECLARO, para os devidos fins de direito, " +
      "especialmente para instruir acao judicial, que sou pobre na acepcao juridica " +
      "do termo, nao tendo condicoes de pagar as custas e as despesas do processo sem " +
      "sacrificio do proprio sustento e do de minha familia, nos termos do artigo 98 " +
      "do Codigo de Processo Civil e do artigo 5º, inciso LXXIV, da Constituicao " +
      "Federal.",
  ),
  T("Por ser a expressao da verdade, assino a presente declaracao."),
  BRANCO,
  CENTRO("{{data.cidade_e_data}}"),
  ...ASSINA_CLIENTE,
];

const CONTRATO: Linha[] = [
  TITULO("CONTRATO DE PRESTACAO DE SERVICOS ADVOCATICIOS"),

  SUB("CONTRATADO:"),
  T(
    "{{escritorio.qualificacao}}, representado por {{advogados.qualificacao}}, " +
      "doravante denominado simplesmente ADVOGADO.",
  ),

  SUB("CONTRATANTE:"),
  T("{{cliente.qualificacao}}, doravante denominado simplesmente CLIENTE."),

  SUB("I — PREAMBULO"),
  T(
    "A duracao da presente acao ou processo administrativo nao tem prazo determinado, " +
      "tendo em vista que o seu termino se condiciona aos recursos porventura " +
      "interpostos pelas partes, ao andamento do processo nos juizos e tribunais e a " +
      "demais fatores que impedem a fixacao de duracao da acao.",
  ),
  T("Este contrato se refere a atuacao em {{honorarios.descricao}}."),
  T(
    "O ADVOGADO, face ao mandato judicial e extrajudicial que lhe foi outorgado, " +
      "obriga-se a prestar seus servicos profissionais na defesa dos direitos do " +
      "CLIENTE, em qualquer juizo, instancia ou tribunal, desempenhando com zelo a " +
      "atividade do seu cargo.",
  ),

  SUB("II — CLAUSULAS CONTRATUAIS"),

  SUB("CLAUSULA 1ª — DOS HONORARIOS ADVOCATICIOS"),
  T(
    "1.1. Os honorarios do presente contrato ficam fixados em {{honorarios.valor}} " +
      "({{honorarios.valor_por_extenso}}), contratados {{honorarios.contratacao}}, " +
      "com o primeiro vencimento em {{honorarios.primeiro_vencimento}} e os demais no " +
      "mesmo dia dos meses seguintes, pagos por {{honorarios.forma}}.",
  ),
  T(
    "1.2. Em caso de renuncia, substabelecimento ou desistencia da acao por parte do " +
      "CLIENTE antes do julgamento em primeira instancia, sera devido, a titulo de " +
      "multa, percentual do valor total do contrato, devidamente corrigido e acrescido " +
      "de juros legais, conforme ajustado entre as partes.",
  ),
  T(
    "1.3. Havendo exito, sera devido ao ADVOGADO o percentual de " +
      "{{honorarios.percentual}} sobre o proveito economico obtido, suprimindo-se esta " +
      "clausula quando a contratacao for apenas por valor fixo.",
  ),
  T(
    "1.4. Ao ADVOGADO reserva-se o direito de aplicar, na cobranca dos honorarios, a " +
      "tabela fixada pela Ordem dos Advogados do Brasil caso o CLIENTE transija com a " +
      "parte contraria em valores manifestamente inferiores aos que tinha direito em " +
      "virtude da acao. Nesse caso, o valor total dos honorarios sera fixado de acordo " +
      "com a quantidade de atos processuais praticados, acrescidos de juros legais e " +
      "correcao monetaria.",
  ),
  T(
    "1.5. O total dos honorarios previstos nos itens anteriores, independentemente de " +
      "qual parte tenha dado causa, podera ser exigido imediatamente se houver " +
      "composicao, substabelecimento ou desistencia por qualquer das partes " +
      "litigantes, dentro ou fora do processo, por quaisquer circunstancias nao " +
      "determinadas pelo ADVOGADO, inclusive caso fortuito ou forca maior, ou ainda se " +
      "lhe for cassado o mandato sem culpa sua.",
  ),
  T(
    "Paragrafo unico. No caso de improcedencia da acao, o CLIENTE ficara responsavel " +
      "pelo pagamento das despesas processuais, custas e demais encargos.",
  ),

  // A Lei nº 15.472, de 21 de julho de 2026, alterou os artigos 22 e 24 do
  // Estatuto da Advocacia (Lei nº 8.906/94) para dizer na letra da lei o que
  // antes se discutia caso a caso: honorario de advogado — contratado, fixado,
  // arbitrado ou de sucumbencia — e verba ALIMENTAR, com os mesmos privilegios
  // do credito trabalhista, e o contrato escrito que o estipula e titulo
  // executivo e credito PRIVILEGIADO no concurso de credores.
  //
  // Por que a clausula existe, se a lei vale de todo jeito: porque na cobranca
  // e na execucao quem discute a classificacao do credito discute com o que
  // esta escrito no titulo. Uma clausula que ja cita o dispositivo poupa a
  // discussao — e deixa o CLIENTE ciente, desde a assinatura, do regime em que
  // esta entrando.
  SUB("CLAUSULA 2ª — DA NATUREZA ALIMENTAR DOS HONORARIOS"),
  T(
    "2.1. Os honorarios ajustados neste instrumento, assim como os fixados ou " +
      "arbitrados judicialmente e os de sucumbencia, tem natureza alimentar e gozam " +
      "dos mesmos privilegios dos creditos decorrentes da legislacao do trabalho, nos " +
      "termos do artigo 22, § 9º, da Lei nº 8.906/94, com a redacao dada pela Lei nº " +
      "15.472, de 21 de julho de 2026, e do artigo 85, § 14, do Codigo de Processo " +
      "Civil.",
  ),
  T(
    "2.2. Nos termos do artigo 24 da Lei nº 8.906/94, com a redacao dada pela Lei nº " +
      "15.472/2026, o contrato escrito que estipula honorarios e titulo executivo e " +
      "constitui credito privilegiado na falencia, na recuperacao judicial e " +
      "extrajudicial, no concurso de credores, na insolvencia civil e na liquidacao " +
      "extrajudicial.",
  ),
  T(
    "2.3. Em caso de inadimplemento, a cobranca e a execucao dos honorarios observarao " +
      "a preferencia legal de que trata esta clausula, sem prejuizo da multa, dos " +
      "juros e da correcao monetaria previstos neste contrato.",
  ),
  T(
    "2.4. O CLIENTE declara ciencia da natureza alimentar da verba aqui contratada e " +
      "do tratamento privilegiado que a lei lhe confere.",
  ),

  SUB("CLAUSULA 3ª — DA ATUALIZACAO DE ENDERECO E DOS DOCUMENTOS"),
  T(
    "3.1. E de inteira responsabilidade do CLIENTE manter seu endereco e seus contatos " +
      "atualizados junto ao escritorio contratado.",
  ),
  T(
    "3.2. As atualizacoes devem ser feitas junto ao escritorio, no horario de " +
      "funcionamento, e so serao aceitas mediante requerimento do CLIENTE devidamente " +
      "assinado.",
  ),
  T(
    "3.3. Qualquer prejuizo advindo do descumprimento dos itens anteriores desobriga o " +
      "ADVOGADO de eventual indenizacao ao CLIENTE.",
  ),
  T(
    "3.4. O CLIENTE devera fornecer ao ADVOGADO todos os documentos e informacoes " +
      "necessarios ao bom e rapido andamento da acao, ou para satisfazer exigencias " +
      "processuais e extrajudiciais, dentro dos prazos legais.",
  ),

  SUB("CLAUSULA 4ª — DO COMPARECIMENTO AS AUDIENCIAS"),
  T(
    "4.1. E responsabilidade do ADVOGADO informar a data e o horario das audiencias " +
      "designadas, com antecedencia minima de 72 (setenta e duas) horas, por telefone, " +
      "mensagem, correio eletronico ou via postal.",
  ),
  T(
    "4.2. Fica ressalvado que qualquer prejuizo processual decorrente da falta do " +
      "CLIENTE as audiencias nao obriga o ADVOGADO a ressarcir qualquer valor a titulo " +
      "de indenizacao.",
  ),
  T(
    "4.3. Em caso de forca maior que impossibilite o comparecimento, o fato devera ser " +
      "comunicado com a devida antecedencia e mediante comprovante; o descumprimento " +
      "deste item sujeita o CLIENTE ao previsto no item 4.2.",
  ),
  T("4.4. A locomocao do CLIENTE ate o local das audiencias nao e responsabilidade do ADVOGADO."),

  SUB("CLAUSULA 5ª — DO SUBSTABELECIMENTO"),
  T(
    "5.1. Em caso de urgencia ou forca maior, pode o ADVOGADO substabelecer, com " +
      "reservas de iguais poderes, a presente acao, quando necessaria a pratica de ato " +
      "especifico.",
  ),
  T(
    "5.2. No caso de substabelecimento definitivo, sem reservas de poderes, o ADVOGADO " +
      "devera comunicar o CLIENTE em 10 (dez) dias, por escrito. Os honorarios " +
      "contratados, independentemente de qual parte tenha tido a iniciativa, serao " +
      "cobrados conforme o previsto na Clausula 1ª.",
  ),

  SUB("CLAUSULA 6ª — DOS GASTOS E DESPESAS COMPLEMENTARES"),
  T(
    "6.1. Todos os gastos com pericias, laudos, honorarios de contador, extracao de " +
      "carta de sentenca e congeneres, quando contratados com a aprovacao do CLIENTE, " +
      "sao de responsabilidade dele, contra a apresentacao de comprovantes.",
  ),
  T(
    "6.2. Eventual multa por litigancia de ma-fe decorrente de documentos ou " +
      "informacoes prestadas pelo CLIENTE desobriga o ADVOGADO de qualquer especie de " +
      "ressarcimento.",
  ),

  SUB("CLAUSULA 7ª — DOS HONORARIOS SUCUMBENCIAIS"),
  T(
    "7.1. Os honorarios advindos da sucumbencia pertencem ao ADVOGADO, nos termos do " +
      "artigo 23 da Lei nº 8.906/94.",
  ),
  T(
    "7.2. Os honorarios sucumbenciais nao excluem o direito do ADVOGADO de receber os " +
      "honorarios contratados previstos na Clausula 1ª.",
  ),

  SUB("CLAUSULA 8ª — DO ADITAMENTO"),
  T("8.1. As partes, de comum acordo, podem promover o aditamento do presente contrato."),

  SUB("CLAUSULA 9ª — DA RESCISAO E DA ELEICAO DE FORO"),
  T(
    // ATENCAO: o artigo e o 784, III, do CPC de 2015 — "documento particular
    // assinado pelo devedor e por 2 (duas) testemunhas". O artigo 585, II, que
    // aparece em modelos antigos, e do CPC de 1973, REVOGADO. E por isso que
    // este contrato pede DUAS testemunhas.
    //
    // O artigo 24 do Estatuto da Advocacia da forca executiva ao contrato
    // escrito de honorarios INDEPENDENTEMENTE de testemunha. Mesmo assim as
    // duas continuam no pe do contrato: os dois fundamentos somados valem mais
    // que um, e tirar as testemunhas so para encurtar o papel seria jogar fora
    // o caminho do CPC em troca de nada.
    "9.1. O presente contrato constitui titulo executivo extrajudicial, nos termos do " +
      "artigo 784, inciso III, do Codigo de Processo Civil, por ser documento " +
      "particular assinado pelo devedor e por duas testemunhas, e tambem por forca do " +
      "artigo 24 da Lei nº 8.906/94, com a redacao dada pela Lei nº 15.472/2026, que " +
      "atribui forca executiva ao contrato escrito de honorarios.",
  ),
  T(
    "9.2. O descumprimento das obrigacoes assumidas neste contrato importa em rescisao " +
      "extrajudicial do mesmo.",
  ),
  T("9.3. Fica eleito o foro da comarca de {{escritorio.cidade}} para dirimir as questoes oriundas deste contrato."),

  T(
    "E, por estarem assim justas e contratadas, as partes firmam o presente " +
      "instrumento em 02 (duas) vias de igual teor, na presenca de duas testemunhas.",
  ),

  BRANCO,
  CENTRO("{{data.cidade_e_data}}"),
  BRANCO,
  CENTRO("_______________________________"),
  CENTRO("{{cliente.nome}} — CONTRATANTE"),
  { texto: "", espacoDepois: true },
  CENTRO("{{advogados.assinaturas}}"),
  { texto: "", espacoDepois: true },
  { texto: "TESTEMUNHAS:", espacoDepois: true },
  { texto: "1) _____________________________  Nome:                        CPF:", espacoDepois: true },
  { texto: "2) _____________________________  Nome:                        CPF:" },
];

const RECIBO: Linha[] = [
  TITULO("RECIBO DE PAGAMENTO DE HONORARIOS"),
  T("Valor: {{recibo.valor}} ({{recibo.valor_por_extenso}})"),
  T(
    "Recebi de {{cliente.qualificacao}} a quantia acima, referente a " +
      "{{recibo.referente_a}}, paga por {{recibo.forma}} em {{recibo.data}}.",
  ),
  T(
    "Para clareza, firmo o presente recibo, dando plena e geral quitacao do valor ora " +
      "recebido, e somente dele.",
  ),
  BRANCO,
  CENTRO("{{data.cidade_e_data}}"),
  BRANCO,
  CENTRO("{{advogados.assinaturas}}"),
];

export const MODELO_PADRAO: Record<Especie, Linha[]> = {
  CONTRATO,
  PROCURACAO,
  DECLARACAO,
  RECIBO,
};

export function nomeDoArquivoPadrao(especie: Especie): string {
  return `modelo-${NOME_DA_ESPECIE[especie].toLowerCase().replace(/\s+/g, "-")}.docx`;
}
