// InfinitePay: segundo meio de pagamento, ao lado do Asaas.
//
// DUAS DIFERENÇAS QUE MUDAM O DESENHO, e nenhuma delas e detalhe:
//
// 1. NAO HA CHAVE SECRETA. A conta e identificada pela "handle" — a
//    InfiniteTag PUBLICA do escritorio no app (o mesmo "@usuario" do Pix por
//    la). Entao a credencial nao prova que quem chamou e o escritorio: prova
//    so para onde o dinheiro vai. Ela e guardada como integracao do escritorio
//    pelo mesmo caminho das outras, mas nao tem o peso de um segredo.
//
// 2. O AVISO DE PAGAMENTO NAO VEM ASSINADO. Qualquer um que soubesse os
//    identificadores poderia, em tese, mandar um "pago" forjado. Por isso
//    NUNCA se da baixa pelo aviso: confere-se com a InfinitePay, sempre, por
//    `conferirPagamento`. O webhook so serve para dizer "va olhar agora".
//
// Documentacao: https://www.infinitepay.io/checkout-documentacao
import { z } from "zod";

const BASE_PADRAO = "https://api.checkout.infinitepay.io";

export function baseInfinitePay(): string {
  return process.env.INFINITEPAY_BASE_URL ?? BASE_PADRAO;
}

export class FalhaNaInfinitePay extends Error {
  readonly status: number;
  /** Recusa definitiva: repetir nao adianta. */
  readonly definitiva: boolean;
  constructor(mensagem: string, status = 502, definitiva = false) {
    super(mensagem);
    this.name = "FalhaNaInfinitePay";
    this.status = status;
    this.definitiva = definitiva;
  }
}

/**
 * A handle, limpa do que as pessoas colam junto.
 *
 * Gente cola "$joaosilva", "@joaosilva" e a URL inteira do perfil. Recusar
 * tudo isso seria recusar o jeito como a informacao realmente chega.
 */
export function limparHandle(bruta: string): string | null {
  const texto = bruta.trim();
  if (!texto) return null;
  // Cola-se a URL do perfil inteira, com ou sem "https://". A handle e o que
  // vem depois da ultima barra.
  const semConsulta = texto.split(/[?#]/)[0];
  const pedacos = semConsulta.split("/").filter((p) => p.trim().length > 0);
  const ultimo = pedacos[pedacos.length - 1] ?? "";
  const limpa = ultimo.replace(/^[$@]+/, "").trim().toLowerCase();
  // A InfiniteTag e letra, numero, ponto, hifen e sublinhado.
  return /^[a-z0-9._-]{2,60}$/.test(limpa) ? limpa : null;
}

/** "(11) 99999-8888" -> "+5511999998888", que e o formato que eles pedem. */
export function telefoneParaInfinitePay(telefone: string | null): string | undefined {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (digitos.length < 10) return undefined;
  return `+${digitos.startsWith("55") ? digitos : `55${digitos}`}`;
}

async function chamar(
  caminho: string,
  corpo: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let resposta: Response;
  try {
    resposta = await fetch(`${baseInfinitePay()}${caminho}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    // Rede: pode ser momentaneo, entao nao e definitiva.
    throw new FalhaNaInfinitePay("Nao consegui falar com a InfinitePay.");
  }

  const dados = (await resposta.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!resposta.ok) {
    const mensagem =
      (typeof dados?.message === "string" && dados.message) ||
      (typeof dados?.error === "string" && dados.error) ||
      resposta.statusText;
    // 4xx e recusa do pedido: repetir o mesmo pedido da o mesmo erro.
    throw new FalhaNaInfinitePay(
      `A InfinitePay recusou: ${mensagem}`,
      resposta.status >= 400 && resposta.status < 500 ? 422 : 502,
      resposta.status >= 400 && resposta.status < 500,
    );
  }
  return dados ?? {};
}

export type PedidoDeLink = {
  handle: string;
  /** Id da nossa cobranca. Volta no aviso, e e como casamos as duas pontas. */
  referencia: string;
  descricao: string;
  valorCentavos: number;
  urlDoAviso: string;
  cliente: { nome: string; email: string | null; telefone: string | null };
};

/**
 * Gera o link de pagamento. O cliente escolhe Pix ou cartao no checkout.
 *
 * Nao ha "forma" a definir aqui como no Asaas: o checkout da InfinitePay
 * oferece as duas e quem decide e quem paga.
 */
export async function criarLink(pedido: PedidoDeLink): Promise<{ url: string }> {
  if (pedido.valorCentavos <= 0) {
    throw new FalhaNaInfinitePay("O valor precisa ser maior que zero.", 400, true);
  }
  const telefone = telefoneParaInfinitePay(pedido.cliente.telefone);
  const temContato = !!pedido.cliente.email || !!telefone;

  const dados = await chamar("/links", {
    handle: pedido.handle,
    order_nsu: pedido.referencia,
    webhook_url: pedido.urlDoAviso,
    items: [
      {
        quantity: 1,
        price: pedido.valorCentavos,
        description: pedido.descricao.slice(0, 200),
      },
    ],
    ...(temContato
      ? {
          customer: {
            name: pedido.cliente.nome,
            ...(pedido.cliente.email ? { email: pedido.cliente.email } : {}),
            ...(telefone ? { phone_number: telefone } : {}),
          },
        }
      : {}),
  });

  const url = typeof dados.url === "string" ? dados.url : null;
  if (!url) throw new FalhaNaInfinitePay("A InfinitePay nao devolveu o link.");
  return { url };
}

export const avisoDaInfinitePay = z.object({
  order_nsu: z.string().min(1),
  transaction_nsu: z.string().min(1),
  slug: z.string().min(1),
});
export type AvisoDaInfinitePay = z.infer<typeof avisoDaInfinitePay>;

/**
 * Pergunta a InfinitePay se o pagamento aconteceu mesmo.
 *
 * E ESTA funcao que decide a baixa, nunca o conteudo do aviso. O aviso nao vem
 * assinado: quem soubesse os identificadores poderia forjar um "pago" e tirar
 * uma cobranca da regua sem ter pagado nada.
 */
export async function conferirPagamento(
  handle: string,
  aviso: AvisoDaInfinitePay,
): Promise<{ pago: boolean; valorPagoCentavos: number | null }> {
  const dados = await chamar("/payment_check", {
    handle,
    order_nsu: aviso.order_nsu,
    transaction_nsu: aviso.transaction_nsu,
    slug: aviso.slug,
  });

  // Os dois tem de ser verdadeiros: `success` e sobre a consulta, `paid` e
  // sobre o dinheiro. Ler so um dos dois daria baixa em consulta que
  // respondeu bem sobre um pagamento que nao houve.
  const pago = dados.success === true && dados.paid === true;
  const valor =
    typeof dados.paid_amount === "number" ? Math.round(dados.paid_amount) : null;

  return { pago, valorPagoCentavos: pago ? valor : null };
}
