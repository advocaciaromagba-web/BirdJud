/**
 * Conciliacao do extrato do meio de pagamento.
 *
 * POR QUE ISTO EXISTE: o webhook avisa de um pagamento por vez e so dos que
 * passam por ele. O extrato e a verdade do que entrou e do que saiu — tarifa,
 * estorno, Pix avulso que ninguem emitiu cobranca, saque para o banco. Sem
 * conferir o extrato, o financeiro do escritorio fica parecido com a verdade,
 * e "parecido" em dinheiro e errado.
 *
 * REGRA QUE VALE PARA O ARQUIVO INTEIRO: nada aqui da baixa sozinho. O motor
 * SUGERE, e uma pessoa confirma. Errar aqui e dinheiro de cliente indo para o
 * lugar errado, entao a ultima palavra e sempre de gente.
 */
import { digitosDe } from "./documentos";

/** Para onde cada lancamento do extrato vai no financeiro. */
export type Destino = "RECEITA" | "DESPESA" | "IGNORAR";

export type Regra = {
  destino: Destino;
  /**
   * Pode ser classificado sem ninguem olhar?
   *
   * Falso nao quer dizer "errado": quer dizer que a decisao depende de
   * contexto que o extrato nao tem.
   */
  automatico: boolean;
  categoria?: string;
  rotulo: string;
};

/**
 * As regras por tipo de lancamento, tiradas de extrato real.
 *
 * O CASO QUE MAIS IMPORTA E O TRANSFER: e o dinheiro saindo do meio de
 * pagamento para a conta do banco do escritorio. Isso NAO e despesa — o valor
 * ja foi contado como receita quando o cliente pagou. Lancar como despesa
 * contaria duas vezes e faria o resultado do mes aparecer perto de zero, que e
 * um erro que ninguem percebe porque o numero continua "plausivel".
 */
export const REGRAS: Record<string, Regra> = {
  PAYMENT_RECEIVED: { destino: "RECEITA", automatico: true, rotulo: "Cobranca recebida" },
  PIX_RECEIVED: { destino: "RECEITA", automatico: true, rotulo: "Pix recebido" },
  PIX_TRANSACTION_DEBIT_REFUND: {
    destino: "RECEITA",
    automatico: true,
    rotulo: "Estorno recebido",
  },
  PAYMENT_REFUND_CANCELLED: {
    destino: "RECEITA",
    automatico: true,
    rotulo: "Estorno cancelado",
  },

  PAYMENT_FEE: {
    destino: "DESPESA",
    automatico: true,
    categoria: "TARIFAS",
    rotulo: "Tarifa de cobranca",
  },
  INSTANT_TEXT_MESSAGE_FEE: {
    destino: "DESPESA",
    automatico: true,
    categoria: "TARIFAS",
    rotulo: "Tarifa de aviso por WhatsApp",
  },
  PAYMENT_MESSAGING_NOTIFICATION_FEE: {
    destino: "DESPESA",
    automatico: true,
    categoria: "TARIFAS",
    rotulo: "Tarifa de aviso ao cliente",
  },

  // So troca o dinheiro de lugar. Ver a nota acima.
  TRANSFER: {
    destino: "IGNORAR",
    automatico: true,
    rotulo: "Transferencia para a conta do banco",
  },
  TRANSFER_CANCELLED: {
    destino: "IGNORAR",
    automatico: true,
    rotulo: "Transferencia cancelada",
  },
  ASAAS_CARD_BALANCE_CREDIT: {
    destino: "IGNORAR",
    automatico: true,
    rotulo: "Movimentacao interna",
  },

  // Estes dependem de contexto que o extrato nao tem: qual conta foi paga, a
  // quem o estorno se refere. Vao para alguem decidir.
  BILL_PAYMENT: { destino: "DESPESA", automatico: false, rotulo: "Conta paga pelo provedor" },
  PAYMENT_REFUND: { destino: "DESPESA", automatico: false, rotulo: "Estorno ao cliente" },
};

/**
 * A regra de um tipo.
 *
 * TIPO DESCONHECIDO NUNCA E AUTOMATICO. O provedor acrescenta tipo novo sem
 * avisar, e tratar o que nao se conhece como "ignorar automatico" e o jeito de
 * perder dinheiro em silencio: o lancamento some do financeiro e ninguem
 * procura o que nunca apareceu.
 */
export function regraDoTipo(tipo: string): Regra {
  return (
    REGRAS[tipo] ?? {
      destino: "IGNORAR",
      automatico: false,
      rotulo: `Tipo nao reconhecido (${tipo})`,
    }
  );
}

/**
 * O nome de quem pagou, comparavel.
 *
 * Tira acento, sobe para maiuscula, descarta o "PIX " que alguns extratos poem
 * na frente e o CPF/CNPJ que outros grudam no fim.
 */
export function normalizarNome(texto: string): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/^PIX\s+(RECEBIDO\s+)?(DE\s+)?/, "")
    .replace(/\s*[-–]\s*\d[\d.\-/]{8,}\s*$/, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Dois nomes sao a mesma pessoa?
 *
 * Nao basta um conter o outro: "ANA" esta dentro de "ANA PAULA", de "MARIANA"
 * e de "SANTANA". Exigimos que o nome mais curto tenha corpo (>= 6 letras) e
 * que o encaixe respeite limite de palavra — senao a sugestao aponta para o
 * cliente errado, e e dinheiro.
 */
export function mesmoNome(a: string, b: string): boolean {
  const x = normalizarNome(a);
  const y = normalizarNome(b);
  if (!x || !y) return false;
  if (x === y) return true;

  const [curto, longo] = x.length <= y.length ? [x, y] : [y, x];
  if (curto.length < 6) return false;
  return new RegExp(`(^| )${curto.replace(/ /g, " ")}( |$)`).test(longo);
}

export type EntradaDoExtrato = {
  /** Id do lancamento no provedor. E o que impede importar duas vezes. */
  id: string;
  tipo: string;
  /** Em CENTAVOS, inteiro. Dinheiro nunca em ponto flutuante. */
  valorCentavos: number;
  data: string;
  descricao: string;
  /** Id da cobranca no provedor, quando o lancamento veio de uma. */
  idDaCobranca?: string | null;
};

export type CobrancaAberta = {
  id: string;
  idNoAsaas: string;
  nomeDoCliente: string;
  descricao: string;
  /** Quanto falta receber, em centavos. */
  faltaCentavos: number;
};

export type Sugestao =
  /** Veio com o id da cobranca: nao e palpite, e o proprio provedor dizendo. */
  | { tipo: "CERTA"; cobrancaId: string; motivo: string }
  /** Um unico candidato por nome e valor. */
  | { tipo: "PROVAVEL"; cobrancaId: string; motivo: string }
  /** Mais de um candidato. NAO escolhemos: quem decide e quem olha. */
  | { tipo: "AMBIGUA"; candidatos: string[]; motivo: string }
  | { tipo: "NENHUMA" };

/**
 * Para cada entrada do extrato, qual cobranca ela parece pagar.
 *
 * AMBIGUIDADE NAO E RESOLVIDA NO CHUTE. Duas cobrancas do mesmo valor para
 * nomes parecidos e exatamente quando o palpite erra, e o erro so aparece
 * meses depois, quando um cliente diz que pagou e o sistema diz que nao.
 */
export function sugerir(
  entradas: readonly EntradaDoExtrato[],
  abertas: readonly CobrancaAberta[],
): Map<string, Sugestao> {
  const porId = new Map(abertas.map((c) => [c.idNoAsaas, c]));
  const saida = new Map<string, Sugestao>();

  for (const entrada of entradas) {
    const regra = regraDoTipo(entrada.tipo);
    if (regra.destino !== "RECEITA") {
      saida.set(entrada.id, { tipo: "NENHUMA" });
      continue;
    }

    if (entrada.idDaCobranca) {
      const certa = porId.get(entrada.idDaCobranca);
      if (certa) {
        saida.set(entrada.id, {
          tipo: "CERTA",
          cobrancaId: certa.id,
          motivo: "o proprio provedor ligou este lancamento a esta cobranca",
        });
        continue;
      }
    }

    const valor = Math.abs(entrada.valorCentavos);
    const candidatos = abertas.filter(
      (c) => c.faltaCentavos === valor && mesmoNome(c.nomeDoCliente, entrada.descricao),
    );

    if (candidatos.length === 1) {
      saida.set(entrada.id, {
        tipo: "PROVAVEL",
        cobrancaId: candidatos[0]!.id,
        motivo: "o nome de quem pagou e o valor batem com uma cobranca em aberto",
      });
    } else if (candidatos.length > 1) {
      saida.set(entrada.id, {
        tipo: "AMBIGUA",
        candidatos: candidatos.map((c) => c.id),
        motivo: `${candidatos.length} cobrancas em aberto batem com este pagamento`,
      });
    } else {
      saida.set(entrada.id, { tipo: "NENHUMA" });
    }
  }

  return saida;
}

/** Valor do provedor (reais, com centavos) em centavos inteiros. */
export function emCentavos(valor: number): number {
  return Math.round(valor * 100);
}

/** O documento de quem pagou, quando o extrato traz. Serve de conferencia. */
export function documentoNaDescricao(descricao: string): string | null {
  const achado = (descricao ?? "").match(/\d[\d.\-/]{10,}/);
  if (!achado) return null;
  const digitos = digitosDe(achado[0]);
  return digitos.length === 11 || digitos.length === 14 ? digitos : null;
}
