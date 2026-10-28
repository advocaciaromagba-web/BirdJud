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
  TITULO("INSTRUMENTO PARTICULAR DE PROCURAÇÃO"),
  T(
    "{{cliente.qualificacao}}, pelo presente instrumento de Procuração, nomeia e " +
      "constitui seu bastante procurador {{escritorio.qualificacao}}, representado " +
      "por {{advogados.qualificacao}}, a quem confere amplos poderes para " +
      "representação em geral, em qualquer órgão, juízo, instância ou tribunal, " +
      "podendo pelo outorgante assinar, firmar acordos e compromissos, receber e dar " +
      "quitação até final decisão, usando os meios e poderes legais que este " +
      "instrumento lhe confere, agindo em conjunto ou separadamente, podendo " +
      "substabelecer esta em outra, com ou sem reservas de iguais poderes, e em " +
      "especial para atuar em {{honorarios.descricao}}, ratificando todos os atos " +
      "necessários para o bom e cabal desempenho.",
  ),
  BRANCO,
  CENTRO("{{data.cidade_e_data}}"),
  ...ASSINA_CLIENTE,
];

const DECLARACAO: Linha[] = [
  TITULO("DECLARAÇÃO DE HIPOSSUFICIÊNCIA"),
  T(
    "{{cliente.qualificacao}}, DECLARO, para os devidos fins de direito, " +
      "especialmente para instruir ação judicial, que sou pobre na acepção jurídica " +
      "do termo, não tendo condições de pagar as custas e as despesas do processo sem " +
      "sacrifício do próprio sustento e do de minha família, nos termos do artigo 98 " +
      "do Código de Processo Civil e do artigo 5º, inciso LXXIV, da Constituição " +
      "Federal.",
  ),
  T("Por ser a expressão da verdade, assino a presente declaração."),
  BRANCO,
  CENTRO("{{data.cidade_e_data}}"),
  ...ASSINA_CLIENTE,
];

const CONTRATO: Linha[] = [
  TITULO("CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS"),

  SUB("CONTRATADO:"),
  T(
    "{{escritorio.qualificacao}}, representado por {{advogados.qualificacao}}, " +
      "doravante denominado simplesmente ADVOGADO.",
  ),

  SUB("CONTRATANTE:"),
  T("{{cliente.qualificacao}}, doravante denominado simplesmente CLIENTE."),

  SUB("I — PREÂMBULO"),
  T(
    "A duração da presente ação ou processo administrativo não tem prazo determinado, " +
      "tendo em vista que o seu término se condiciona aos recursos porventura " +
      "interpostos pelas partes, ao andamento do processo nos juízos e tribunais e a " +
      "demais fatores que impedem a fixação de duração da ação.",
  ),
  T("Este contrato se refere a atuação em {{honorarios.descricao}}."),
  T(
    "O ADVOGADO, face ao mandato judicial e extrajudicial que lhe foi outorgado, " +
      "obriga-se a prestar seus serviços profissionais na defesa dos direitos do " +
      "CLIENTE, em qualquer juízo, instância ou tribunal, desempenhando com zelo a " +
      "atividade do seu cargo.",
  ),

  SUB("II — CLÁUSULAS CONTRATUAIS"),

  SUB("CLÁUSULA 1ª — DOS HONORÁRIOS ADVOCATÍCIOS"),
  T(
    "1.1. Os honorários do presente contrato ficam fixados em {{honorarios.valor}} " +
      "({{honorarios.valor_por_extenso}}), contratados {{honorarios.contratacao}}, " +
      "com o primeiro vencimento em {{honorarios.primeiro_vencimento}} e os demais no " +
      "mesmo dia dos meses seguintes, pagos por {{honorarios.forma}}.",
  ),
  T(
    "1.2. Em caso de renúncia, substabelecimento ou desistência da ação por parte do " +
      "CLIENTE antes do julgamento em primeira instância, será devido, a título de " +
      "multa, percentual do valor total do contrato, devidamente corrigido e acrescido " +
      "de juros legais, conforme ajustado entre as partes.",
  ),
  T(
    "1.3. Havendo êxito, será devido ao ADVOGADO o percentual de " +
      "{{honorarios.percentual}} sobre o proveito econômico obtido, suprimindo-se esta " +
      "cláusula quando a contratação for apenas por valor fixo.",
  ),
  T(
    "1.4. Ao ADVOGADO reserva-se o direito de aplicar, na cobrança dos honorários, a " +
      "tabela fixada pela Ordem dos Advogados do Brasil caso o CLIENTE transija com a " +
      "parte contrária em valores manifestamente inferiores aos que tinha direito em " +
      "virtude da ação. Nesse caso, o valor total dos honorários será fixado de acordo " +
      "com a quantidade de atos processuais praticados, acrescidos de juros legais e " +
      "correção monetária.",
  ),
  T(
    "1.5. O total dos honorários previstos nos itens anteriores, independentemente de " +
      "qual parte tenha dado causa, poderá ser exigido imediatamente se houver " +
      "composição, substabelecimento ou desistência por qualquer das partes " +
      "litigantes, dentro ou fora do processo, por quaisquer circunstâncias não " +
      "determinadas pelo ADVOGADO, inclusive caso fortuito ou força maior, ou ainda se " +
      "lhe for cassado o mandato sem culpa sua.",
  ),
  T(
    "Parágrafo único. No caso de improcedência da ação, o CLIENTE ficará responsável " +
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
  SUB("CLÁUSULA 2ª — DA NATUREZA ALIMENTAR DOS HONORÁRIOS"),
  T(
    "2.1. Os honorários ajustados neste instrumento, assim como os fixados ou " +
      "arbitrados judicialmente e os de sucumbência, têm natureza alimentar e gozam " +
      "dos mesmos privilégios dos créditos decorrentes da legislação do trabalho, nos " +
      "termos do artigo 22, § 9º, da Lei nº 8.906/94, com a redação dada pela Lei nº " +
      "15.472, de 21 de julho de 2026, e do artigo 85, § 14, do Código de Processo " +
      "Civil.",
  ),
  T(
    "2.2. Nos termos do artigo 24 da Lei nº 8.906/94, com a redação dada pela Lei nº " +
      "15.472/2026, o contrato escrito que estipula honorários é título executivo e " +
      "constitui crédito privilegiado na falência, na recuperação judicial e " +
      "extrajudicial, no concurso de credores, na insolvência civil e na liquidação " +
      "extrajudicial.",
  ),
  T(
    "2.3. Em caso de inadimplemento, a cobrança e a execução dos honorários observarão " +
      "a preferência legal de que trata esta cláusula, sem prejuízo da multa, dos " +
      "juros e da correção monetária previstos neste contrato.",
  ),
  T(
    "2.4. O CLIENTE declara ciência da natureza alimentar da verba aqui contratada e " +
      "do tratamento privilegiado que a lei lhe confere.",
  ),

  SUB("CLÁUSULA 3ª — DA ATUALIZAÇÃO DE ENDEREÇO E DOS DOCUMENTOS"),
  T(
    "3.1. É de inteira responsabilidade do CLIENTE manter seu endereço e seus contatos " +
      "atualizados junto ao escritório contratado.",
  ),
  T(
    "3.2. As atualizações devem ser feitas junto ao escritório, no horário de " +
      "funcionamento, e só serão aceitas mediante requerimento do CLIENTE devidamente " +
      "assinado.",
  ),
  T(
    "3.3. Qualquer prejuízo advindo do descumprimento dos itens anteriores desobriga o " +
      "ADVOGADO de eventual indenização ao CLIENTE.",
  ),
  T(
    "3.4. O CLIENTE deverá fornecer ao ADVOGADO todos os documentos e informações " +
      "necessários ao bom e rápido andamento da ação, ou para satisfazer exigências " +
      "processuais e extrajudiciais, dentro dos prazos legais.",
  ),

  SUB("CLÁUSULA 4ª — DO COMPARECIMENTO ÀS AUDIÊNCIAS"),
  T(
    "4.1. É responsabilidade do ADVOGADO informar a data e o horário das audiências " +
      "designadas, com antecedência mínima de 72 (setenta e duas) horas, por telefone, " +
      "mensagem, correio eletrônico ou via postal.",
  ),
  T(
    "4.2. Fica ressalvado que qualquer prejuízo processual decorrente da falta do " +
      "CLIENTE às audiências não obriga o ADVOGADO a ressarcir qualquer valor a título " +
      "de indenização.",
  ),
  T(
    "4.3. Em caso de força maior que impossibilite o comparecimento, o fato deverá ser " +
      "comunicado com a devida antecedência e mediante comprovante; o descumprimento " +
      "deste item sujeita o CLIENTE ao previsto no item 4.2.",
  ),
  T("4.4. A locomoção do CLIENTE até o local das audiências não é responsabilidade do ADVOGADO."),

  SUB("CLÁUSULA 5ª — DO SUBSTABELECIMENTO"),
  T(
    "5.1. Em caso de urgência ou força maior, pode o ADVOGADO substabelecer, com " +
      "reservas de iguais poderes, a presente ação, quando necessária a prática de ato " +
      "específico.",
  ),
  T(
    "5.2. No caso de substabelecimento definitivo, sem reservas de poderes, o ADVOGADO " +
      "deverá comunicar o CLIENTE em 10 (dez) dias, por escrito. Os honorários " +
      "contratados, independentemente de qual parte tenha tido a iniciativa, serão " +
      "cobrados conforme o previsto na Cláusula 1ª.",
  ),

  SUB("CLÁUSULA 6ª — DOS GASTOS E DESPESAS COMPLEMENTARES"),
  T(
    "6.1. Todos os gastos com perícias, laudos, honorários de contador, extração de " +
      "carta de sentença e congêneres, quando contratados com a aprovação do CLIENTE, " +
      "são de responsabilidade dele, contra a apresentação de comprovantes.",
  ),
  T(
    "6.2. Eventual multa por litigância de má-fé decorrente de documentos ou " +
      "informações prestadas pelo CLIENTE desobriga o ADVOGADO de qualquer espécie de " +
      "ressarcimento.",
  ),

  SUB("CLÁUSULA 7ª — DOS HONORÁRIOS SUCUMBENCIAIS"),
  T(
    "7.1. Os honorários advindos da sucumbência pertencem ao ADVOGADO, nos termos do " +
      "artigo 23 da Lei nº 8.906/94.",
  ),
  T(
    "7.2. Os honorários sucumbenciais não excluem o direito do ADVOGADO de receber os " +
      "honorários contratados previstos na Cláusula 1ª.",
  ),

  SUB("CLÁUSULA 8ª — DO ADITAMENTO"),
  T("8.1. As partes, de comum acordo, podem promover o aditamento do presente contrato."),

  SUB("CLÁUSULA 9ª — DA RESCISÃO E DA ELEIÇÃO DE FORO"),
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
    "9.1. O presente contrato constitui título executivo extrajudicial, nos termos do " +
      "artigo 784, inciso III, do Código de Processo Civil, por ser documento " +
      "particular assinado pelo devedor e por duas testemunhas, e também por força do " +
      "artigo 24 da Lei nº 8.906/94, com a redação dada pela Lei nº 15.472/2026, que " +
      "atribui força executiva ao contrato escrito de honorários.",
  ),
  T(
    "9.2. O descumprimento das obrigações assumidas neste contrato importa em rescisão " +
      "extrajudicial do mesmo.",
  ),
  T("9.3. Fica eleito o foro da comarca de {{escritorio.cidade}} para dirimir as questões oriundas deste contrato."),

  T(
    "E, por estarem assim justas e contratadas, as partes firmam o presente " +
      "instrumento em 02 (duas) vias de igual teor, na presença de duas testemunhas.",
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
  TITULO("RECIBO DE PAGAMENTO DE HONORÁRIOS"),
  T("Valor: {{recibo.valor}} ({{recibo.valor_por_extenso}})"),
  T(
    "Recebi de {{cliente.qualificacao}} a quantia acima, referente a " +
      "{{recibo.referente_a}}, paga por {{recibo.forma}} em {{recibo.data}}.",
  ),
  T(
    "Para clareza, firmo o presente recibo, dando plena e geral quitação do valor ora " +
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
