/**
 * Cadastro por leitura: a pessoa envia os documentos, a IA le, e a tela
 * preenche o formulario.
 *
 * Tres decisoes que valem para o arquivo inteiro:
 *
 * 1. nada e gravado por aqui. A leitura devolve campos propostos; quem grava
 *    e o formulario, depois que alguem olhou. Cadastro errado em sistema
 *    juridico vira peticao com parte errada;
 * 2. cada campo volta com confianca declarada, e o que nao fecha na
 *    conferencia local (digito de CPF, numero do CNJ) e rebaixado aqui, do
 *    lado do servidor — nao adianta confiar na nota que o proprio modelo deu;
 * 3. o modelo so pode propor os campos que o perfil conhece. Chave estranha
 *    e descartada em silencio: o formulario nao tem onde por, e campo
 *    inventado e o caminho mais curto para dado sujo.
 */
import { z } from "zod";
import { digitosDe, documentoValido, formatarDocumento } from "./documentos";
import { normalizarNumeroProcesso } from "./leitura-publicacao";
import { CATEGORIAS_DE_DESPESA, ehCategoria } from "./financeiro";
import { paraCentavos } from "./dinheiro";
import { calcularPrazo, calcularPrazoDaPublicacao, PrazoInvalido, recuarDiasUteis, type Calendario } from "./prazos";
import { ANTECEDENCIA_SUGERIDA_DIAS } from "./triagem-de-publicacao";

export const PERFIS = ["CLIENTE", "PROCESSO", "AGENDA", "CONTA", "TAREFA", "FISCAL"] as const;
export type Perfil = (typeof PERFIS)[number];

export type Confianca = "ALTA" | "MEDIA" | "BAIXA";

export type CampoLido = {
  valor: string;
  confianca: Confianca;
  /** Onde no documento a IA diz ter achado. E o que permite conferir. */
  origem: string | null;
};

export type Leitura = {
  campos: Record<string, CampoLido>;
  /** O que a IA quis dizer e nao cabia em campo: divergencia, rasura, duvida. */
  observacoes: string[];
  /**
   * Tarefa: as OUTRAS providencias do mesmo documento (um despacho que manda
   * contestar E juntar documento), cada uma com os proprios campos e prazo.
   * A principal fica em `campos`.
   */
  outras?: Leitura[];
};

const UFS_DO_BRASIL = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

/** Os campos que cada perfil aceita, com o rotulo que a tela mostra. */
const CAMPOS_DO_PERFIL: Record<Perfil, Record<string, string>> = {
  // Cliente: o documento de identidade da a qualificacao; o comprovante de
  // residencia, o endereco. Os dois juntos preenchem o cadastro inteiro.
  CLIENTE: {
    nome: "Nome / razão social",
    documento: "CPF / CNPJ",
    rg: "RG / CIN",
    nascimento: "Nascimento",
    nacionalidade: "Nacionalidade",
    estadoCivil: "Estado civil",
    profissao: "Profissao",
    email: "E-mail",
    telefone: "Telefone",
    cep: "CEP",
    logradouro: "Rua / avenida",
    numero: "Numero",
    complemento: "Complemento",
    bairro: "Bairro",
    cidade: "Cidade",
    uf: "UF",
  },
  PROCESSO: {
    numero: "Número do processo",
    tribunal: "Tribunal",
    vara: "Vara",
    area: "Area",
  },
  // Agenda: a intimacao de audiencia ja traz dia, hora e endereco. Redigitar
  // isso e onde nasce audiencia marcada no dia errado.
  AGENDA: {
    titulo: "Do que se trata",
    inicio: "Data e hora",
    local: "Local",
    observacoes: "Observacoes",
  },
  // Tarefa: a intimacao, o despacho ou a decisao dizem O QUE fazer e em
  // quantos dias. A IA le isso; a DATA quem calcula e o sistema (prazos.ts),
  // com dia util e o calendario do escritorio — a mesma regra da triagem.
  TAREFA: {
    titulo: "O que fazer",
    descricao: "Resumo",
    numeroProcesso: "Número do processo",
    dataDoAto: "Data da intimação / publicação",
    tipoDaData: "Essa data é de",
    prazoDias: "Prazo em dias",
    contagem: "Contagem",
    prazoFatal: "Prazo fatal (calculado pelo sistema)",
    entrega: "Entrega sugerida (calculada pelo sistema)",
  },
  // Cadastro fiscal do escritorio (NFS-e): cartao CNPJ, contrato social,
  // inscricao municipal. Codigo IBGE e codigo do servico o SISTEMA deriva
  // (do CEP e do CNAE): a IA nao sabe tabela de cabeca, e chute ali vira nota
  // recusada pela prefeitura.
  FISCAL: {
    razaoSocial: "Razão social",
    cnpj: "CNPJ",
    inscricaoMunicipal: "Inscrição municipal",
    cep: "CEP da sede",
    logradouro: "Rua da sede",
    numero: "Numero",
    complemento: "Complemento",
    bairro: "Bairro",
    cidade: "Cidade",
    uf: "UF",
    telefone: "Telefone",
    email: "E-mail",
    cnae: "CNAE principal",
    regime: "Regime tributário",
    codigoMunicipio: "Código IBGE do município (pelo CEP)",
    codigoTributacao: "Código do serviço (pelo CNAE)",
  },
  // Conta de consumo e boleto. O escritorio recebe estas contas todo mes e
  // digita as mesmas quatro coisas; a IA le e ja classifica.
  CONTA: {
    fornecedor: "Quem emitiu",
    descricao: "Do que se trata",
    valor: "Valor",
    vencimento: "Vencimento",
    categoria: "Categoria",
  },
};

const AJUDA_DO_PERFIL: Record<Perfil, string> = {
  CLIENTE:
    "Documento de identificação (CIN, RG, CNH) e comprovante de endereço (conta de luz, água, telefone), juntos. Serve também cartão CNPJ, contrato social, procuração ou ficha preenchida a mão.",
  PROCESSO:
    "Petição inicial, capa dos autos, despacho, sentença ou print do andamento.",
  AGENDA:
    "Intimação de audiência, mandado, carta precatória, e-mail de reunião ou print do despacho que marcou a data.",
  TAREFA:
    "Intimação, despacho, decisão, sentença ou mandado que manda fazer algo (contestar, manifestar, recorrer, juntar). A IA lê o que fazer e o prazo; o sistema calcula o prazo fatal e a entrega.",
  FISCAL:
    "Cartão CNPJ (comprovante de inscrição), contrato social ou alteração, ficha de inscrição municipal e, se houver, o termo de opção pelo Simples. Código do serviço e alíquota: confirme com o contador.",
  CONTA:
    "Conta de água, energia, internet, telefone, boleto do aluguel, guia de imposto ou nota do fornecedor.",
};

export function camposDoPerfil(perfil: Perfil): Record<string, string> {
  return CAMPOS_DO_PERFIL[perfil];
}

export function rotuloDoCampo(perfil: Perfil, campo: string): string {
  return CAMPOS_DO_PERFIL[perfil][campo] ?? campo;
}

export function ajudaDoPerfil(perfil: Perfil): string {
  return AJUDA_DO_PERFIL[perfil];
}

/** Campos que o SISTEMA calcula. O modelo nao propoe; se propuser, cai fora. */
const CALCULADOS = new Set(["prazoFatal", "entrega", "codigoMunicipio", "codigoTributacao"]);

export function montarInstrucao(perfil: Perfil): string {
  const campos = Object.entries(CAMPOS_DO_PERFIL[perfil])
    .filter(([chave]) => !CALCULADOS.has(chave))
    .map(([chave, rotulo]) => `- "${chave}": ${rotulo}`)
    .join("\n");

  return [
    "Você lê documentos de um escritório de advocacia brasileiro e extrai dados de cadastro.",
    "",
    "Campos que você pode devolver, e só estes:",
    campos,
    "",
    "Responda SOMENTE um objeto JSON, sem cerca de código e sem texto em volta:",
    '{"campos":{"<campo>":{"valor":"<texto>","confianca":"ALTA|MEDIA|BAIXA","origem":"<onde achou>"}},"observacoes":["..."]}',
    "",
    "Regras:",
    "- campo que não aparece no documento simplesmente não entra no JSON. Não invente, não complete, não deduza a partir do que seria provável;",
    "- confiança ALTA é para o que está escrito com todas as letras e legível; MEDIA para o que precisou de interpretação; BAIXA para o que está borrado, cortado, rasurado ou ambíguo;",
    "- 'origem' diz de onde saiu, em poucas palavras ('cabeçalho da petição', 'campo CPF do RG');",
    "- documento (CPF/CNPJ) e número de processo: devolva os dígitos como estão no papel, sem corrigir o que parece errado;",
    "- se dois documentos discordarem, use o mais recente, marque MEDIA e explique em observações;",
    "- observações são para o que o advogado precisa saber: divergência entre documentos, documento vencido, página faltando.",
    ...(perfil === "CONTA"
      ? [
          '- "valor" é o TOTAL A PAGAR do documento, em reais, só números e vírgula ("189,47"). Não é o consumo, não é a leitura do medidor, não é o valor de outro mês que aparece no histórico;',
          '- "vencimento" sai no formato aaaa-mm-dd;',
          `- "categoria" é exatamente uma destas: ${CATEGORIAS_DE_DESPESA.join(", ")}. Se nenhuma servir, não devolva o campo;`,
          '- "descricao" é curta ("Conta de energia - setembro"), não o texto do documento;',
          "- conta com valores de vários meses no histórico: use o do mês corrente, e diga em observações qual mês você usou.",
        ]
      : []),
    ...(perfil === "CLIENTE"
      ? [
          "- nome, CPF, RG e nascimento saem do documento de identificação; o endereço sai do comprovante de endereço;",
          "- o comprovante pode estar no nome de outra pessoa (cônjuge, pai, locador): use o ENDERECO dele, nunca o nome, e diga em observações de quem é a conta;",
          '- "nascimento" sai no formato aaaa-mm-dd, e é a data de NASCIMENTO: não confunda com a data de expedição do documento, de validade ou de registro (na certidão, é a data em que a pessoa nasceu, não a do registro);',
          '- "rg" é o número do RG ou da CIN com o órgão emissor e a UF quando aparecerem ("12.345.678-9 SSP/SP");',
          '- "cep" só com os 8 dígitos; "uf" só a sigla de 2 letras; "numero" é o número do imóvel (ou "S/N"), não o número da conta nem do medidor;',
          '- "logradouro" é o nome da rua com o tipo ("Rua das Flores"), sem o número, sem o bairro;',
          '- "nacionalidade", "estadoCivil" e "profissao" só quando estiverem escritos (CIN nova, certidão, procuração, ficha). Não deduza estado civil do sobrenome nem nacionalidade do local de nascimento;',
          "- telefone e e-mail impressos na conta são da empresa que emitiu a conta: não use.",
        ]
      : []),
    ...(perfil === "FISCAL"
      ? [
          "- é o cadastro da PRÓPRIA empresa que emite a nota (a sociedade de advogados, o advogado ou a empresa da plataforma), não de cliente;",
          '- "logradouro" é o nome da rua com o tipo ("Rua Rui Barbosa"), sem o número e sem o bairro; "numero" é o número do imóvel (ou "S/N"); "complemento" só se houver (asteriscos no cartão CNPJ querem dizer que não há: não devolva);',
          '- "telefone" e "email" são os do cadastro da empresa no documento;',
          '- "razaoSocial" exatamente como no cartão CNPJ; se o contrato social mais recente trouxer outro nome, use o do contrato, marque MEDIA e explique em observações;',
          '- "cnpj" com os dígitos como estão no papel;',
          '- "inscricaoMunicipal" só quando estiver escrita (ficha da prefeitura, alvará, contrato). Não confunda com inscrição estadual nem com o número de registro na OAB;',
          '- "cep" só com os 8 dígitos, do endereço da SEDE (não de filial);',
          '- "cnae" é o código da atividade econômica PRINCIPAL ("6911-7/01"), só o código;',
          '- "regime": SIMPLES, MEI ou NORMAL, e só quando um documento disser (termo de opção pelo Simples, "optante pelo Simples", certificado MEI). O cartão CNPJ sozinho não diz o regime: nesse caso não devolva o campo;',
          "- se o cartão CNPJ estiver com situação cadastral diferente de ATIVA, diga em observações.",
        ]
      : []),
    ...(perfil === "TAREFA"
      ? [
          '- "titulo" é curto e diz o trabalho a fazer ("Contestação", "Manifestação sobre o laudo", "Recurso de apelação"), não o texto do documento;',
          '- "descricao" resume em até três frases o que foi determinado e o que precisa ser feito;',
          '- "dataDoAto" é a data da intimação, da ciência ou da publicação no diário, no formato aaaa-mm-dd. Não some dias: a conta é do sistema;',
          '- "tipoDaData" diz o que é essa data: INTIMACAO (intimação ou ciência pessoal/eletrônica), PUBLICACAO (o texto diz "publicado em") ou DISPONIBILIZACAO (o texto diz "disponibilizado em" / "data de disponibilização" no DJe ou DJEN). Não converta uma na outra: devolva a data como está e diga o tipo;',
          '- "prazoDias" é só o número de dias que o documento da ("15"). Prazo em dobro, em horas ou sem número: não devolva e explique em observações;',
          '- "contagem" é UTEIS ou CORRIDOS. Processo cível e trabalhista conta em dias UTEIS; penal e direito material, CORRIDOS. Na dúvida, UTEIS com confiança MEDIA;',
          "- audiência, perícia ou reunião NAO são tarefa: se o documento só marca uma delas, diga em observações que aquilo vai na Agenda;",
          '- se o documento determinar MAIS DE UMA providência (contestar E juntar documento, por exemplo), a principal vai em "campos" e cada uma das demais vai em "outras": [{"campos":{...mesmos campos...}}], no máximo 5.',
        ]
      : []),
    ...(perfil === "AGENDA"
      ? [
          '- "inicio" sai no formato aaaa-mm-ddThh:mm, horário de Brasília. Sem hora no documento, use 09:00 e marque MEDIA dizendo isso na origem;',
          '- "titulo" é curto e diz do que se trata ("Audiência de instrução", "Reunião com o cliente"), não o texto do documento inteiro;',
          "- data relativa ('em 15 dias') só vira data se o documento disser a partir de quando. Na dúvida, não devolva o campo e explique em observações.",
        ]
      : []),
  ].join("\n");
}

const esquema = z.object({
  campos: z
    .record(
      z.object({
        valor: z.union([z.string(), z.number()]),
        confianca: z.enum(["ALTA", "MEDIA", "BAIXA"]).optional(),
        origem: z.string().max(200).optional(),
      }),
    )
    .default({}),
  observacoes: z.array(z.string().max(500)).max(20).default([]),
  outras: z.array(z.object({ campos: z.record(z.unknown()).default({}) })).max(5).default([]),
});

/**
 * Para o formato que o campo datetime-local entende (aaaa-mm-ddThh:mm).
 *
 * Aceita o que o modelo costuma devolver e o que esta escrito em intimacao
 * brasileira: ISO, "dd/mm/aaaa hh:mm" e "dd/mm/aaaa as hh:mm". Qualquer outra
 * coisa e recusada em vez de adivinhada — audiencia no dia errado e perda de
 * prazo, nao inconveniente.
 */
export function normalizarDataHora(bruto: string): string | null {
  const texto = bruto.trim();

  // Com ou sem hora: a tarefa pede "aaaa-mm-dd" a IA, e isso tem de passar.
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (iso) {
    const [, a, m, d, h, min] = iso;
    return valida(a, m, d, h ?? "09", min ?? "00");
  }

  const br = texto.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s*(?:as|às|,)?\s*(\d{1,2})[:h](\d{2}))?/i,
  );
  if (br) {
    const [, d, m, a, h, min] = br;
    return valida(a, m, d, h ?? "09", min ?? "00");
  }

  return null;
}

function valida(
  a: string,
  m: string,
  d: string,
  h: string,
  min: string,
): string | null {
  const ano = Number(a);
  const mes = Number(m);
  const dia = Number(d);
  const hora = Number(h);
  const minuto = Number(min);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  if (hora > 23 || minuto > 59) return null;
  // Dia 31 em mes de 30 nao existe, e o Date "corrige" para o mes seguinte em
  // silencio. Conferir de volta e o que impede isso.
  const data = new Date(Date.UTC(ano, mes - 1, dia, hora, minuto));
  if (data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${ano}-${dois(mes)}-${dois(dia)}T${dois(hora)}:${dois(minuto)}`;
}

/** Para aaaa-mm-dd. Aceita ISO e o formato brasileiro. */
export function normalizarData(bruto: string): string | null {
  const comHora = normalizarDataHora(bruto);
  return comHora ? comHora.slice(0, 10) : null;
}

function menorConfianca(atual: Confianca, teto: Confianca): Confianca {
  const ordem: Confianca[] = ["BAIXA", "MEDIA", "ALTA"];
  return ordem.indexOf(atual) < ordem.indexOf(teto) ? atual : teto;
}

/** Tira a cerca de codigo que o modelo as vezes poe, e acha o objeto. */
function recortarJson(texto: string): string {
  const semCerca = texto
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
  const inicio = semCerca.indexOf("{");
  const fim = semCerca.lastIndexOf("}");
  return inicio >= 0 && fim > inicio
    ? semCerca.slice(inicio, fim + 1)
    : semCerca;
}

export class LeituraIlegivel extends Error {
  readonly status = 422;
  constructor() {
    super("Não foi possível ler os documentos enviados.");
    this.name = "LeituraIlegivel";
  }
}

/**
 * Do texto do modelo para campos conferidos.
 *
 * A conferencia local e o ponto: CPF que nao fecha o digito e numero de
 * processo fora do padrao do CNJ descem para BAIXA e ganham observacao. O
 * campo continua na tela — as vezes o papel esta errado mesmo, e quem decide
 * e quem le —, mas chega marcado.
 */
export function interpretar(perfil: Perfil, texto: string | object): Leitura {
  let cru: unknown;
  if (typeof texto === "object") {
    cru = texto;
  } else {
    try {
      cru = JSON.parse(recortarJson(texto));
    } catch {
      throw new LeituraIlegivel();
    }
  }

  const lido = esquema.safeParse(cru);
  if (!lido.success) throw new LeituraIlegivel();

  const aceitos = CAMPOS_DO_PERFIL[perfil];
  const campos: Record<string, CampoLido> = {};
  const observacoes = [...lido.data.observacoes];

  for (const [chave, bruto] of Object.entries(lido.data.campos)) {
    if (!(chave in aceitos) || CALCULADOS.has(chave)) continue;

    let valor = String(bruto.valor).replace(/\s+/g, " ").trim().slice(0, 300);
    if (!valor) continue;
    let confianca: Confianca = bruto.confianca ?? "MEDIA";

    if (chave === "documento") {
      const digitos = digitosDe(valor);
      if (documentoValido(digitos)) {
        valor = formatarDocumento(digitos);
      } else {
        confianca = "BAIXA";
        observacoes.push(
          `O ${digitos.length === 14 ? "CNPJ" : "CPF"} lido (${valor}) não fecha o dígito verificador. Confira no documento.`,
        );
      }
    }

    if (chave === "inicio") {
      const normalizada = normalizarDataHora(valor);
      if (normalizada) {
        valor = normalizada;
      } else {
        // Data que a tela nao consegue usar e pior que data ausente: o campo
        // fica preenchido com lixo e alguem grava assim.
        confianca = "BAIXA";
        observacoes.push(
          `A data e hora lida ("${valor}") não pode ser entendida. Preencha a mão.`,
        );
        continue;
      }
    }

    if (chave === "valor") {
      // Valor que nao vira centavos e pior que valor ausente: entra no
      // formulario, alguem grava, e o mes fecha errado.
      const centavos = paraCentavos(valor);
      if (centavos === null || centavos === 0) {
        confianca = "BAIXA";
        observacoes.push(
          `O valor lido ("${valor}") não pode ser entendido como dinheiro. Preencha a mão.`,
        );
        continue;
      }
    }

    if (chave === "vencimento") {
      const data = normalizarData(valor);
      if (data) {
        valor = data;
      } else {
        confianca = "BAIXA";
        observacoes.push(
          `A data de vencimento lida ("${valor}") não pode ser entendida. Preencha a mão.`,
        );
        continue;
      }
    }

    if (chave === "categoria") {
      // O modelo as vezes devolve o rotulo em vez da chave. Chave que nao
      // existe no catalogo e descartada: categoria inventada quebra o
      // grafico e o comparativo entre meses.
      const emMaiuscula = valor.toUpperCase().replace(/[\s-]+/g, "_");
      if (!ehCategoria(emMaiuscula)) {
        observacoes.push(
          `A categoria sugerida ("${valor}") não existe no catálogo. Escolha uma na tela.`,
        );
        continue;
      }
      valor = emMaiuscula;
    }

    if (perfil === "CLIENTE" && chave === "nascimento") {
      const data = normalizarData(valor);
      if (!data) {
        observacoes.push(`A data de nascimento lida ("${valor}") não pode ser entendida. Preencha a mão.`);
        continue;
      }
      valor = data;
    }

    if (perfil === "CLIENTE" && chave === "cep") {
      // CEP com digito a mais ou a menos nao serve nem para a busca do
      // endereco: melhor vazio, para a pessoa digitar e a busca completar.
      const digitos = digitosDe(valor);
      if (digitos.length !== 8) {
        observacoes.push(`O CEP lido ("${valor}") não tem 8 dígitos. Digite o CEP para o endereço se completar.`);
        continue;
      }
      valor = `${digitos.slice(0, 5)}-${digitos.slice(5)}`;
    }

    if (perfil === "CLIENTE" && chave === "uf") {
      const uf = valor.toUpperCase().replace(/[^A-Z]/g, "");
      if (!UFS_DO_BRASIL.has(uf)) {
        observacoes.push(`A UF lida ("${valor}") não é uma sigla de estado. Confira.`);
        continue;
      }
      valor = uf;
    }

    if (perfil === "FISCAL" && chave === "cep") {
      const digitos = digitosDe(valor);
      if (digitos.length !== 8) {
        observacoes.push(`O CEP lido ("${valor}") não tem 8 dígitos. Sem ele o código IBGE não sai sozinho.`);
        continue;
      }
      valor = `${digitos.slice(0, 5)}-${digitos.slice(5)}`;
    }

    if (perfil === "FISCAL" && chave === "uf") {
      const uf = valor.toUpperCase().replace(/[^A-Z]/g, "");
      if (!UFS_DO_BRASIL.has(uf)) continue;
      valor = uf;
    }

    if (perfil === "FISCAL" && chave === "regime") {
      const r = semAcentoMaiusculo(valor);
      const regime = r.includes("MEI") || r.includes("MICROEMPREENDEDOR")
        ? "MEI"
        : r.includes("SIMPLES")
          ? "SIMPLES"
          : r.includes("NORMAL") || r.includes("PRESUMIDO") || r.includes("REAL")
            ? "NORMAL"
            : null;
      if (!regime) {
        observacoes.push(`O regime lido ("${valor}") não é Simples, MEI nem normal. Escolha na tela.`);
        continue;
      }
      valor = regime;
    }

    if (perfil === "TAREFA" && chave === "dataDoAto") {
      const data = normalizarData(valor);
      if (!data) {
        observacoes.push(`A data da intimação lida ("${valor}") não pode ser entendida. Sem ela o prazo não é calculado.`);
        continue;
      }
      valor = data;
    }

    if (perfil === "TAREFA" && chave === "prazoDias") {
      const dias = Number(valor.replace(/\D/g, ""));
      if (!Number.isInteger(dias) || dias < 1 || dias > 1000) {
        observacoes.push(`O prazo lido ("${valor}") não é um número de dias. Confira no documento.`);
        continue;
      }
      valor = String(dias);
    }

    if (perfil === "TAREFA" && chave === "contagem") {
      const c = valor.toUpperCase();
      valor = c.startsWith("CORR") ? "CORRIDOS" : "UTEIS";
    }

    if (perfil === "TAREFA" && chave === "tipoDaData") {
      const t = semAcentoMaiusculo(valor);
      valor = t.startsWith("DISPON") ? "DISPONIBILIZACAO" : t.startsWith("PUBLIC") ? "PUBLICACAO" : "INTIMACAO";
    }

    if (perfil === "TAREFA" && chave === "numeroProcesso") {
      const normalizado = normalizarNumeroProcesso(valor);
      if (normalizado) {
        valor = normalizado;
      } else {
        confianca = "BAIXA";
        observacoes.push(`O número lido (${valor}) não tem o formato do número único do CNJ. Confira nos autos.`);
      }
    }

    // So o numero de PROCESSO passa pelo formato do CNJ. No cliente,
    // "numero" e o numero da casa — formatar como processo o destruiria.
    if (perfil === "PROCESSO" && chave === "numero") {
      const normalizado = normalizarNumeroProcesso(valor);
      if (normalizado) {
        valor = normalizado;
      } else {
        confianca = "BAIXA";
        observacoes.push(
          `O número lido (${valor}) não tem o formato do número único do CNJ. Confira nos autos.`,
        );
      }
    }

    campos[chave] = {
      valor,
      confianca: menorConfianca(confianca, "ALTA"),
      origem: bruto.origem?.trim() || null,
    };
  }

  const leitura: Leitura = { campos, observacoes: observacoes.slice(0, 20) };
  if (perfil === "TAREFA" && lido.data.outras.length) {
    // Cada outra providencia passa pela mesma conferencia; a que vier sem
    // titulo e descartada.
    leitura.outras = lido.data.outras
      .map((o) => {
        try {
          return interpretar(perfil, { campos: o.campos, observacoes: [] });
        } catch {
          return null;
        }
      })
      .filter((o): o is Leitura => Boolean(o?.campos.titulo));
  }
  return leitura;
}

/**
 * Tarefa lida: o prazo fatal e a entrega, calculados pelo SISTEMA.
 *
 * A IA diz quantos dias e a partir de quando; que DIA isso e — com dia util,
 * feriado e o calendario do escritorio — e prazos.ts, a mesma conta da
 * triagem de publicacoes. A entrega vem tres dias uteis antes do fatal, sem
 * cair antes de hoje. Os dois chegam com confianca no maximo MEDIA: e conta
 * sobre leitura, e quem confere e o advogado.
 */
export function calcularPrazoDaLeitura(
  leitura: Leitura,
  hojeISO: string,
  calendario?: Calendario,
): Leitura {
  const outras = leitura.outras?.map((o) => calcularPrazoDaLeitura(o, hojeISO, calendario));
  const { dataDoAto, prazoDias, contagem, tipoDaData } = leitura.campos;
  if (!dataDoAto || !prazoDias) return outras ? { ...leitura, outras } : leitura;
  // So conta os dois saltos (disponibilizacao -> publicacao -> inicio) quando a
  // leitura DIZ que a data e de disponibilizacao. Na duvida, um salto so: errar
  // para mais cedo avisa antes; errar para mais tarde perde o prazo.
  const daDisponibilizacao = tipoDaData?.valor === "DISPONIBILIZACAO";

  const campos = { ...leitura.campos };
  const observacoes = [...leitura.observacoes];
  try {
    const conta = (daDisponibilizacao ? calcularPrazoDaPublicacao : calcularPrazo)(
      dataDoAto.valor,
      Number(prazoDias.valor),
      contagem?.valor === "CORRIDOS" ? "CORRIDOS" : "UTEIS",
      calendario,
    );
    const entrega = recuarDiasUteis(conta.vencimento, ANTECEDENCIA_SUGERIDA_DIAS, hojeISO, calendario);
    const confianca = [dataDoAto.confianca, prazoDias.confianca, contagem?.confianca ?? "MEDIA"].reduce(
      (a, b) => menorConfianca(a, b),
      "MEDIA" as Confianca,
    );
    campos.prazoFatal = { valor: conta.vencimento, confianca, origem: "calculado pelo sistema" };
    campos.entrega = { valor: entrega, confianca, origem: `${ANTECEDENCIA_SUGERIDA_DIAS} dias úteis antes do fatal` };
    observacoes.unshift(`Prazo: ${conta.explicacao}`);
  } catch (erro) {
    if (!(erro instanceof PrazoInvalido)) throw erro;
    observacoes.push(`Não deu para calcular o prazo: ${erro.message}`);
  }
  return { campos, observacoes: observacoes.slice(0, 20), ...(outras ? { outras } : {}) };
}

function semAcentoMaiusculo(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

/**
 * Codigo de tributacao nacional (cTribNac, LC 116) sugerido pelo CNAE.
 *
 * So o que e certo para escritorio de advocacia: CNAE 6911-7/01 (servicos
 * advocaticios) e o subitem 17.14 da lista, "advocacia" — 171401. Qualquer
 * outro CNAE fica sem sugestao: o codigo e do contador.
 */
const TRIBUTACAO_DO_CNAE: Record<string, string> = {
  "6911701": "171401",
};

/**
 * Cadastro fiscal lido: o que o SISTEMA completa a partir do que a IA leu.
 *
 * O codigo IBGE vem do CEP (o servico de CEP informa), e o codigo do servico
 * vem do CNAE. Os dois chegam com confianca MEDIA e origem dizendo de onde
 * sairam, para quem confere saber que nao foi lido no papel.
 */
export function completarCadastroFiscal(
  leitura: Leitura,
  ibgeDoCep: string | null,
): Leitura {
  const campos = { ...leitura.campos };
  const observacoes = [...leitura.observacoes];

  if (ibgeDoCep && /^\d{7}$/.test(ibgeDoCep)) {
    campos.codigoMunicipio = { valor: ibgeDoCep, confianca: "MEDIA", origem: "pelo CEP da sede" };
  } else if (campos.cep) {
    observacoes.push("Não achei o código IBGE pelo CEP. Consulte em ibge.gov.br e preencha.");
  }

  const cnae = campos.cnae ? digitosDe(campos.cnae.valor) : "";
  const codigo = TRIBUTACAO_DO_CNAE[cnae];
  if (codigo) {
    campos.codigoTributacao = {
      valor: codigo,
      confianca: "MEDIA",
      origem: "subitem 17.14 (advocacia), pelo CNAE 6911-7/01",
    };
  } else if (campos.cnae) {
    observacoes.push(`O CNAE ${campos.cnae.valor} não é o de serviços advocatícios. O código do serviço fica com o contador.`);
  }
  observacoes.push("A alíquota do ISS não está nesses documentos: confirme com o contador.");

  return { campos, observacoes: observacoes.slice(0, 20) };
}
