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

export const PERFIS = ["CLIENTE", "PROCESSO", "AGENDA"] as const;
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

/** Os campos que cada perfil aceita, com o rotulo que a tela mostra. */
const CAMPOS_DO_PERFIL: Record<Perfil, Record<string, string>> = {
  CLIENTE: {
    nome: "Nome / razao social",
    documento: "CPF / CNPJ",
    email: "E-mail",
    telefone: "Telefone",
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
};

const AJUDA_DO_PERFIL: Record<Perfil, string> = {
  CLIENTE:
    "RG, CNH, cartao CNPJ, contrato social, procuracao ou ficha preenchida a mao.",
  PROCESSO:
    "Peticao inicial, capa dos autos, despacho, sentenca ou print do andamento.",
  AGENDA:
    "Intimacao de audiencia, mandado, carta precatoria, e-mail de reuniao ou print do despacho que marcou a data.",
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

export function montarInstrucao(perfil: Perfil): string {
  const campos = Object.entries(CAMPOS_DO_PERFIL[perfil])
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
    if (!(chave in aceitos)) continue;

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

    if (chave === "numero") {
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
