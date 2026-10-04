/**
 * De quem e este pagamento?
 *
 * POR QUE ISTO EXISTE: a conta Asaas da Blackbird atende varios sistemas ao
 * mesmo tempo — em 04/10/2026 havia sete webhooks registrados nela (Anjos da
 * sua Saude, AnjosDaSuaCasa, Chama Ja, Procedente Ai, LaudoJud e o BirdJud).
 * O Asaas entrega os eventos da CONTA INTEIRA para CADA URL registrada. Ou
 * seja: todo pagamento de qualquer um desses sistemas bate no webhook do
 * BirdJud, e todo pagamento do BirdJud bate no webhook deles.
 *
 * O preco de nao saber separar era alto e nada obvio. O webhook respondia 404
 * ao pagamento alheio, por nao achar a fatura; o Asaas trata nao-2xx como
 * falha e reenvia, e aquele webhook esta em sendType SEQUENTIALLY, que e
 * fila. Um pagamento do LaudoJud travaria a fila e as NOSSAS baixas pararavam
 * de chegar — o escritorio pagaria e continuaria suspenso, sem ninguem
 * conseguir ligar uma coisa na outra.
 *
 * A solucao e marcar a referencia com o nome do sistema na hora de criar a
 * cobranca, para que a pergunta "isto e meu?" se responda pelo proprio evento,
 * antes de qualquer consulta ao banco. De quebra, a marca aparece no painel do
 * Asaas: quem olha o extrato ve de qual sistema e cada lancamento.
 */

/** A marca deste sistema. Nao mudar: fica gravada nas cobrancas ja emitidas. */
export const SISTEMA = "birdjud";

/** O que a referencia aponta. */
export type Tipo = "fatura" | "escritorio";

const SEPARADOR = ":";

/**
 * Monta a referencia que vai no externalReference do Asaas.
 *
 *   referencia("fatura", "abc123") -> "birdjud:fatura:abc123"
 */
export function referencia(tipo: Tipo, id: string): string {
  return [SISTEMA, tipo, id].join(SEPARADOR);
}

export type Leitura =
  /** Marcada com a nossa marca: e nossa, e sabemos o que e. */
  | { dono: "nosso"; tipo: Tipo; id: string }
  /** Marcada com a marca de outro sistema da mesma conta. */
  | { dono: "outro"; sistema: string }
  /**
   * Sem marca nenhuma: pode ser nossa (cobranca emitida antes desta marca
   * existir) ou de um sistema que tambem nao marca. Quem le decide — no
   * webhook, procurando a fatura no banco.
   */
  | { dono: "indefinido"; bruto: string | null };

/**
 * Le a referencia de um evento e diz de quem ele e.
 *
 * NAO chuta: referencia sem marca volta como "indefinido", nao como nossa.
 * Dizer "e minha" sobre o pagamento de outro sistema seria pior que nao
 * saber — daria baixa na fatura errada se um id coincidisse.
 */
export function lerReferencia(bruto: string | null | undefined): Leitura {
  const valor = bruto?.trim();
  if (!valor) return { dono: "indefinido", bruto: null };

  const partes = valor.split(SEPARADOR);
  if (partes.length < 3) return { dono: "indefinido", bruto: valor };

  const [sistema, tipo, ...resto] = partes;
  const id = resto.join(SEPARADOR);
  if (sistema.toLowerCase() !== SISTEMA) {
    return { dono: "outro", sistema: sistema.toLowerCase() };
  }
  if ((tipo !== "fatura" && tipo !== "escritorio") || !id) {
    // Nossa marca com formato que nao reconhecemos. Nao inventamos um tipo:
    // quem le vai ter de conferir no banco.
    return { dono: "indefinido", bruto: valor };
  }
  return { dono: "nosso", tipo, id };
}

/** Nomes das formas de pagamento do Asaas em portugues de gente. */
const FORMAS: Record<string, string> = {
  BOLETO: "boleto",
  PIX: "Pix",
  CREDIT_CARD: "cartao de credito",
  DEBIT_CARD: "cartao de debito",
  TRANSFER: "transferencia",
  DEPOSIT: "deposito",
  UNDEFINED: "forma nao informada",
};

/**
 * Transforma o retrato da baixa em uma linha legivel.
 *
 * DEFENSIVA DE PROPOSITO: o conteudo vem de um evento de terceiro, gravado em
 * Json. Campo que falta ou vem com tipo errado nao pode derrubar a pagina do
 * console — a pagina e justamente onde alguem vai olhar quando algo deu
 * errado com o pagamento.
 */
export function resumoDaBaixa(baixa: unknown): string | null {
  if (!baixa || typeof baixa !== "object" || Array.isArray(baixa)) return null;
  const d = baixa as Record<string, unknown>;

  const partes: string[] = [];

  if (typeof d.origem === "string" && d.origem) {
    partes.push(d.origem);
  } else {
    const forma = typeof d.forma === "string" ? d.forma : null;
    partes.push(
      forma ? `recebido por ${FORMAS[forma] ?? forma}` : "recebido no provedor",
    );
  }

  if (typeof d.valor === "number" && Number.isFinite(d.valor)) {
    partes.push(
      new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      })
        .format(d.valor)
        // O Intl usa espaco estreito sem quebra entre "R$" e o numero, que
        // nao e o espaco que ninguem digita nem espera comparar.
        .replace(/ /g, " "),
    );
  }

  if (typeof d.pagamentoId === "string" && d.pagamentoId) {
    partes.push(d.pagamentoId);
  }

  // A marca responde "de qual sistema", que e a pergunta que fica quando a
  // conta do provedor atende mais de um.
  if (typeof d.sistema === "string" && d.sistema && d.sistema !== SISTEMA) {
    partes.push(`sistema ${d.sistema}`);
  }
  if (d.marcada === false) {
    partes.push("sem marca de sistema na referencia");
  }

  return partes.join(" · ");
}
