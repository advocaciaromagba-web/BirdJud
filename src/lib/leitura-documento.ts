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
import { calcularPrazo, PrazoInvalido, recuarDiasUteis, type Calendario } from "./prazos";
import { ANTECEDENCIA_SUGERIDA_DIAS } from "./triagem-de-publicacao";

export const PERFIS = ["CLIENTE", "PROCESSO", "AGENDA", "CONTA", "TAREFA"] as const;
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
    nome: "Nome / razao social",
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
    numero: "Numero do processo",
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
    numeroProcesso: "Numero do processo",
    dataDoAto: "Intimacao / disponibilizacao",
    prazoDias: "Prazo em dias",
    contagem: "Contagem",
    prazoFatal: "Prazo fatal (calculado pelo sistema)",
    entrega: "Entrega sugerida (calculada pelo sistema)",
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
    "Documento de identificacao (CIN, RG, CNH) e comprovante de endereco (conta de luz, agua, telefone), juntos. Serve tambem cartao CNPJ, contrato social, procuracao ou ficha preenchida a mao.",
  PROCESSO:
    "Peticao inicial, capa dos autos, despacho, sentenca ou print do andamento.",
  AGENDA:
    "Intimacao de audiencia, mandado, carta precatoria, e-mail de reuniao ou print do despacho que marcou a data.",
  TAREFA:
    "Intimacao, despacho, decisao, sentenca ou mandado que manda fazer algo (contestar, manifestar, recorrer, juntar). A IA le o que fazer e o prazo; o sistema calcula o prazo fatal e a entrega.",
  CONTA:
    "Conta de agua, energia, internet, telefone, boleto do aluguel, guia de imposto ou nota do fornecedor.",
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
const CALCULADOS = new Set(["prazoFatal", "entrega"]);

export function montarInstrucao(perfil: Perfil): string {
  const campos = Object.entries(CAMPOS_DO_PERFIL[perfil])
    .filter(([chave]) => !CALCULADOS.has(chave))
    .map(([chave, rotulo]) => `- "${chave}": ${rotulo}`)
    .join("\n");

  return [
    "Voce le documentos de um escritorio de advocacia brasileiro e extrai dados de cadastro.",
    "",
    "Campos que voce pode devolver, e so estes:",
    campos,
    "",
    "Responda SOMENTE um objeto JSON, sem cerca de codigo e sem texto em volta:",
    '{"campos":{"<campo>":{"valor":"<texto>","confianca":"ALTA|MEDIA|BAIXA","origem":"<onde achou>"}},"observacoes":["..."]}',
    "",
    "Regras:",
    "- campo que nao aparece no documento simplesmente nao entra no JSON. Nao invente, nao complete, nao deduza a partir do que seria provavel;",
    "- confianca ALTA e para o que esta escrito com todas as letras e legivel; MEDIA para o que precisou de interpretacao; BAIXA para o que esta borrado, cortado, rasurado ou ambiguo;",
    "- 'origem' diz de onde saiu, em poucas palavras ('cabecalho da peticao', 'campo CPF do RG');",
    "- documento (CPF/CNPJ) e numero de processo: devolva os digitos como estao no papel, sem corrigir o que parece errado;",
    "- se dois documentos discordarem, use o mais recente, marque MEDIA e explique em observacoes;",
    "- observacoes sao para o que o advogado precisa saber: divergencia entre documentos, documento vencido, pagina faltando.",
    ...(perfil === "CONTA"
      ? [
          '- "valor" e o TOTAL A PAGAR do documento, em reais, so numeros e virgula ("189,47"). Nao e o consumo, nao e a leitura do medidor, nao e o valor de outro mes que aparece no historico;',
          '- "vencimento" sai no formato aaaa-mm-dd;',
          `- "categoria" e exatamente uma destas: ${CATEGORIAS_DE_DESPESA.join(", ")}. Se nenhuma servir, nao devolva o campo;`,
          '- "descricao" e curta ("Conta de energia - setembro"), nao o texto do documento;',
          "- conta com valores de varios meses no historico: use o do mes corrente, e diga em observacoes qual mes voce usou.",
        ]
      : []),
    ...(perfil === "CLIENTE"
      ? [
          "- nome, CPF, RG e nascimento saem do documento de identificacao; o endereco sai do comprovante de endereco;",
          "- o comprovante pode estar no nome de outra pessoa (conjuge, pai, locador): use o ENDERECO dele, nunca o nome, e diga em observacoes de quem e a conta;",
          '- "nascimento" sai no formato aaaa-mm-dd;',
          '- "rg" e o numero do RG ou da CIN com o orgao emissor e a UF quando aparecerem ("12.345.678-9 SSP/SP");',
          '- "cep" so com os 8 digitos; "uf" so a sigla de 2 letras; "numero" e o numero do imovel (ou "S/N"), nao o numero da conta nem do medidor;',
          '- "logradouro" e o nome da rua com o tipo ("Rua das Flores"), sem o numero, sem o bairro;',
          '- "nacionalidade", "estadoCivil" e "profissao" so quando estiverem escritos (CIN nova, certidao, procuracao, ficha). Nao deduza estado civil do sobrenome nem nacionalidade do local de nascimento;',
          "- telefone e e-mail impressos na conta sao da empresa que emitiu a conta: nao use.",
        ]
      : []),
    ...(perfil === "TAREFA"
      ? [
          '- "titulo" e curto e diz o trabalho a fazer ("Contestacao", "Manifestacao sobre o laudo", "Recurso de apelacao"), nao o texto do documento;',
          '- "descricao" resume em ate tres frases o que foi determinado e o que precisa ser feito;',
          '- "dataDoAto" e a data da intimacao, da ciencia ou da disponibilizacao no diario, no formato aaaa-mm-dd. Nao some dias: a conta e do sistema;',
          '- "prazoDias" e so o numero de dias que o documento da ("15"). Prazo em dobro, em horas ou sem numero: nao devolva e explique em observacoes;',
          '- "contagem" e UTEIS ou CORRIDOS. Processo civel e trabalhista conta em dias UTEIS; penal e direito material, CORRIDOS. Na duvida, UTEIS com confianca MEDIA;',
          "- audiencia, pericia ou reuniao NAO sao tarefa: se o documento so marca uma delas, diga em observacoes que aquilo vai na Agenda.",
        ]
      : []),
    ...(perfil === "AGENDA"
      ? [
          '- "inicio" sai no formato aaaa-mm-ddThh:mm, horario de Brasilia. Sem hora no documento, use 09:00 e marque MEDIA dizendo isso na origem;',
          '- "titulo" e curto e diz do que se trata ("Audiencia de instrucao", "Reuniao com o cliente"), nao o texto do documento inteiro;',
          "- data relativa ('em 15 dias') so vira data se o documento disser a partir de quando. Na duvida, nao devolva o campo e explique em observacoes.",
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

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (iso) {
    const [, a, m, d, h, min] = iso;
    return valida(a, m, d, h, min);
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
    super("Nao foi possivel ler os documentos enviados.");
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
export function interpretar(perfil: Perfil, texto: string): Leitura {
  let cru: unknown;
  try {
    cru = JSON.parse(recortarJson(texto));
  } catch {
    throw new LeituraIlegivel();
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
          `O ${digitos.length === 14 ? "CNPJ" : "CPF"} lido (${valor}) nao fecha o digito verificador. Confira no documento.`,
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
          `A data e hora lida ("${valor}") nao pode ser entendida. Preencha a mao.`,
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
          `O valor lido ("${valor}") nao pode ser entendido como dinheiro. Preencha a mao.`,
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
          `A data de vencimento lida ("${valor}") nao pode ser entendida. Preencha a mao.`,
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
          `A categoria sugerida ("${valor}") nao existe no catalogo. Escolha uma na tela.`,
        );
        continue;
      }
      valor = emMaiuscula;
    }

    if (perfil === "CLIENTE" && chave === "nascimento") {
      const data = normalizarData(valor);
      if (!data) {
        observacoes.push(`A data de nascimento lida ("${valor}") nao pode ser entendida. Preencha a mao.`);
        continue;
      }
      valor = data;
    }

    if (perfil === "CLIENTE" && chave === "cep") {
      // CEP com digito a mais ou a menos nao serve nem para a busca do
      // endereco: melhor vazio, para a pessoa digitar e a busca completar.
      const digitos = digitosDe(valor);
      if (digitos.length !== 8) {
        observacoes.push(`O CEP lido ("${valor}") nao tem 8 digitos. Digite o CEP para o endereco se completar.`);
        continue;
      }
      valor = `${digitos.slice(0, 5)}-${digitos.slice(5)}`;
    }

    if (perfil === "CLIENTE" && chave === "uf") {
      const uf = valor.toUpperCase().replace(/[^A-Z]/g, "");
      if (!UFS_DO_BRASIL.has(uf)) {
        observacoes.push(`A UF lida ("${valor}") nao e uma sigla de estado. Confira.`);
        continue;
      }
      valor = uf;
    }

    if (perfil === "TAREFA" && chave === "dataDoAto") {
      const data = normalizarData(valor);
      if (!data) {
        observacoes.push(`A data da intimacao lida ("${valor}") nao pode ser entendida. Sem ela o prazo nao e calculado.`);
        continue;
      }
      valor = data;
    }

    if (perfil === "TAREFA" && chave === "prazoDias") {
      const dias = Number(valor.replace(/\D/g, ""));
      if (!Number.isInteger(dias) || dias < 1 || dias > 1000) {
        observacoes.push(`O prazo lido ("${valor}") nao e um numero de dias. Confira no documento.`);
        continue;
      }
      valor = String(dias);
    }

    if (perfil === "TAREFA" && chave === "contagem") {
      const c = valor.toUpperCase();
      valor = c.startsWith("CORR") ? "CORRIDOS" : "UTEIS";
    }

    if (perfil === "TAREFA" && chave === "numeroProcesso") {
      const normalizado = normalizarNumeroProcesso(valor);
      if (normalizado) {
        valor = normalizado;
      } else {
        confianca = "BAIXA";
        observacoes.push(`O numero lido (${valor}) nao tem o formato do numero unico do CNJ. Confira nos autos.`);
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
          `O numero lido (${valor}) nao tem o formato do numero unico do CNJ. Confira nos autos.`,
        );
      }
    }

    campos[chave] = {
      valor,
      confianca: menorConfianca(confianca, "ALTA"),
      origem: bruto.origem?.trim() || null,
    };
  }

  return { campos, observacoes: observacoes.slice(0, 20) };
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
  const { dataDoAto, prazoDias, contagem } = leitura.campos;
  if (!dataDoAto || !prazoDias) return leitura;

  const campos = { ...leitura.campos };
  const observacoes = [...leitura.observacoes];
  try {
    const conta = calcularPrazo(
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
    campos.entrega = { valor: entrega, confianca, origem: `${ANTECEDENCIA_SUGERIDA_DIAS} dias uteis antes do fatal` };
    observacoes.unshift(`Prazo: ${conta.explicacao}`);
  } catch (erro) {
    if (!(erro instanceof PrazoInvalido)) throw erro;
    observacoes.push(`Nao deu para calcular o prazo: ${erro.message}`);
  }
  return { campos, observacoes: observacoes.slice(0, 20) };
}
