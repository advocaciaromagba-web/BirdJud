// Contrato de um conector de integracao.
//
// Cada integracao do escritorio (e-mail, cobranca, assinatura, WhatsApp,
// certificado...) descreve aqui os campos que pede, como resumir o que foi
// guardado sem vazar segredo, e como testar a conexao de verdade.
import type { Modulo } from "../modulos";
import type { TipoIntegracao } from "../integracao";

export type CampoConector = {
  nome: string;
  rotulo: string;
  tipo: "text" | "password" | "textarea";
  obrigatorio: boolean;
  ajuda?: string;
};

export type ResultadoTeste = {
  ok: boolean;
  detalhe: string;
};

export type Conector = {
  tipo: TipoIntegracao;
  rotulo: string;
  descricao: string;
  /** Modulo que precisa estar contratado. Sem modulo, e do nucleo. */
  modulo?: Modulo;
  campos: CampoConector[];
  /** Resumo seguro para a tela: nunca o segredo inteiro. */
  resumo: (dados: Record<string, string>) => string;
  /** Conversa com o servico de verdade. Nunca lanca: devolve o resultado. */
  testar: (dados: Record<string, string>) => Promise<ResultadoTeste>;
};

/** Mostra so o fim do segredo: "...a1b2". */
export function mascarar(valor: string | undefined, visiveis = 4): string {
  if (!valor) return "—";
  if (valor.length <= visiveis) return "•".repeat(valor.length);
  return `•••${valor.slice(-visiveis)}`;
}

const TEMPO_LIMITE = 12_000;

/**
 * Chamada HTTP com tempo limite. Integracao de terceiro que trava nao pode
 * segurar a requisicao do escritorio nem um trabalho da fila.
 */
export async function buscarComLimite(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE);
  try {
    return await fetch(url, { ...init, signal: controle.signal });
  } finally {
    clearTimeout(relogio);
  }
}

/** Erro de rede vira mensagem legivel, sem stack e sem segredo. */
export function descreverFalha(erro: unknown): string {
  if (erro instanceof DOMException && erro.name === "AbortError") {
    return "O servico nao respondeu a tempo.";
  }
  if (erro instanceof Error) return erro.message;
  return "Falha desconhecida.";
}
