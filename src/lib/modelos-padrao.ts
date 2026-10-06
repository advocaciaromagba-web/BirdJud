// Os modelos que ja vem no sistema.
//
// NAO sao a peca pronta do escritorio: sao o ponto de partida. Cada banca tem
// a sua redacao, o seu timbre e as suas clausulas, e e por isso que o caminho
// normal e baixar, editar no Word e devolver. O que vem aqui existe para que
// um escritorio novo consiga emitir a primeira procuracao no primeiro dia.
//
// ANTES DE USAR COMO ESTA: o advogado responsavel le e adapta. O texto abaixo
// e redacao de uso corrente, nao parecer juridico, e nenhuma clausula aqui foi
// escrita olhando o caso de ninguem.
import type { Linha } from "./docx";
import { NOME_DA_ESPECIE, type Especie } from "./modelos";

const T = (texto: string): Linha => ({ texto, espacoDepois: true });
const TITULO = (texto: string): Linha => ({
  texto,
  negrito: true,
  centro: true,
  espacoDepois: true,
});
const FECHO: Linha[] = [
  { texto: "", espacoDepois: true },
  { texto: "{{data.cidade_e_data}}", centro: true, espacoDepois: true },
  { texto: "", espacoDepois: true },
  { texto: "_______________________________", centro: true },
  { texto: "{{cliente.nome}}", centro: true },
];

const PROCURACAO: Linha[] = [
  TITULO("PROCURACAO"),
  T(
    "{{cliente.qualificacao}}, pelo presente instrumento particular de procuracao, " +
      "nomeia e constitui seu bastante procurador {{escritorio.nome}}, a quem confere " +
      "amplos poderes para o foro em geral, com a clausula ad judicia et extra, em " +
      "qualquer juizo, instancia ou tribunal, podendo propor contra quem de direito as " +
      "acoes competentes e defende-lo nas contrarias, seguindo umas e outras ate final " +
      "decisao, usando os recursos legais e acompanhando-os, conferindo-lhe, ainda, " +
      "poderes especiais para confessar, desistir, transigir, firmar compromissos ou " +
      "acordos, receber e dar quitacao, agindo em conjunto ou separadamente, podendo " +
      "ainda substabelecer esta a outrem, com ou sem reservas de iguais poderes, para " +
      "agir em conjunto ou separadamente com o substabelecido.",
  ),
  T("Objeto: {{honorarios.descricao}}."),
  ...FECHO,
];

const DECLARACAO: Linha[] = [
  TITULO("DECLARACAO DE HIPOSSUFICIENCIA"),
  T(
    "{{cliente.qualificacao}}, DECLARA, para os devidos fins de direito, " +
      "especialmente para instruir acao judicial, que nao tem condicoes de arcar com as " +
      "custas e despesas do processo e com os honorarios advocaticios sem prejuizo do " +
      "proprio sustento e do de sua familia, nos termos do artigo 98 do Codigo de " +
      "Processo Civil e do artigo 5º, inciso LXXIV, da Constituicao Federal.",
  ),
  T("Por ser a expressao da verdade, firma a presente declaracao."),
  ...FECHO,
];

const CONTRATO: Linha[] = [
  TITULO("CONTRATO DE PRESTACAO DE SERVICOS ADVOCATICIOS"),
  T(
    "CONTRATANTE: {{cliente.qualificacao}}, doravante denominado simplesmente " +
      "CONTRATANTE.",
  ),
  T(
    "CONTRATADO: {{escritorio.nome}}, com atendimento em {{escritorio.cidade}}, " +
      "doravante denominado simplesmente CONTRATADO.",
  ),
  T(
    "CLAUSULA 1ª — DO OBJETO. O CONTRATADO prestara ao CONTRATANTE os servicos " +
      "advocaticios relativos a {{honorarios.descricao}}, compreendidos o estudo do " +
      "caso, a elaboracao das pecas necessarias e o acompanhamento ate decisao final na " +
      "instancia contratada.",
  ),
  T(
    "CLAUSULA 2ª — DOS HONORARIOS. Pelos servicos contratados, o CONTRATANTE pagara ao " +
      "CONTRATADO a quantia de {{honorarios.valor}} ({{honorarios.valor_por_extenso}}), " +
      "contratada {{honorarios.contratacao}}, vencendo a primeira em " +
      "{{honorarios.primeiro_vencimento}} e as demais no mesmo dia dos meses seguintes, " +
      "pagas por {{honorarios.forma}}.",
  ),
  T(
    "Paragrafo unico. Havendo exito, sera devido ao CONTRATADO o percentual de " +
      "{{honorarios.percentual}} sobre o proveito economico obtido, suprimindo-se esta " +
      "clausula quando a contratacao for apenas por valor fixo.",
  ),
  T(
    "CLAUSULA 3ª — DOS HONORARIOS DE SUCUMBENCIA. Os honorarios de sucumbencia " +
      "pertencem ao CONTRATADO, nos termos do artigo 23 da Lei nº 8.906/94, e nao se " +
      "confundem com os honorarios contratados nesta avenca.",
  ),
  T(
    "CLAUSULA 4ª — DAS DESPESAS. Custas, taxas judiciarias, emolumentos, honorarios " +
      "periciais e despesas de deslocamento correm por conta do CONTRATANTE, e serao " +
      "previamente informadas sempre que possivel.",
  ),
  T(
    "CLAUSULA 5ª — DAS OBRIGACOES DO CONTRATANTE. O CONTRATANTE fornecera ao CONTRATADO " +
      "os documentos e as informacoes necessarias, respondendo pela veracidade do que " +
      "declarar, e mantera atualizados os seus dados de contato: {{cliente.telefone}} e " +
      "{{cliente.email}}.",
  ),
  T(
    "CLAUSULA 6ª — DA RESCISAO. O contrato pode ser rescindido por qualquer das partes " +
      "mediante comunicacao escrita, ficando devidos os honorarios proporcionais aos " +
      "servicos ja prestados ate a data da rescisao.",
  ),
  T(
    "CLAUSULA 7ª — DO FORO. Fica eleito o foro da comarca de {{escritorio.cidade}} para " +
      "dirimir as questoes oriundas deste contrato.",
  ),
  T("E, por estarem justas e contratadas, as partes firmam o presente instrumento."),
  { texto: "", espacoDepois: true },
  { texto: "{{data.cidade_e_data}}", centro: true, espacoDepois: true },
  { texto: "", espacoDepois: true },
  { texto: "_______________________________", centro: true },
  { texto: "{{cliente.nome}} — CONTRATANTE", centro: true, espacoDepois: true },
  { texto: "_______________________________", centro: true },
  { texto: "{{escritorio.nome}} — CONTRATADO", centro: true },
];

const RECIBO: Linha[] = [
  TITULO("RECIBO DE PAGAMENTO DE HONORARIOS"),
  T("Valor: {{recibo.valor}} ({{recibo.valor_por_extenso}})"),
  T(
    "Recebi de {{cliente.qualificacao}}, a quantia acima, referente a " +
      "{{recibo.referente_a}}, paga por {{recibo.forma}} em {{recibo.data}}.",
  ),
  T(
    "Para clareza, firmo o presente recibo, dando plena e geral quitacao do " +
      "valor ora recebido, e somente dele.",
  ),
  { texto: "", espacoDepois: true },
  { texto: "{{data.cidade_e_data}}", centro: true, espacoDepois: true },
  { texto: "", espacoDepois: true },
  { texto: "_______________________________", centro: true },
  { texto: "{{escritorio.nome}}", centro: true },
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
