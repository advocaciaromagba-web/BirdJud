// InfinitePay no banco: emitir a cobranca e dar baixa quando ela e paga.
//
// A regra de como falar com eles mora em infinitepay.ts. A regra de o que
// significa "pago" mora la tambem, e e uma so: NUNCA pelo aviso, sempre pela
// conferencia.
import { comEscritorio, semEscritorio, prismaPlataforma } from "./prisma";
import { obterIntegracao, IntegracaoAusente } from "./integracao";
import { darBaixa, PedidoInvalido, SemContaDeCobranca } from "./cobrancas";
import { dominioDaPlataforma } from "./dominio";
import {
  conferirPagamento,
  criarLink,
  limparHandle,
  type AvisoDaInfinitePay,
} from "./infinitepay";
import { randomUUID } from "node:crypto";

/** A handle do escritorio, ja limpa. */
export async function handleDoEscritorio(escritorioId: string): Promise<string> {
  let dados: { handle?: unknown };
  try {
    dados = await obterIntegracao<{ handle: string }>(escritorioId, "INFINITEPAY");
  } catch (erro) {
    if (erro instanceof IntegracaoAusente) {
      throw new SemContaDeCobranca("Conta InfinitePay nao conectada.");
    }
    throw erro;
  }
  const handle = limparHandle(String(dados.handle ?? ""));
  if (!handle) throw new SemContaDeCobranca("A InfiniteTag gravada nao e valida.");
  return handle;
}

/** Para onde a InfinitePay manda o aviso. Precisa ser alcancavel de fora. */
export function enderecoDoAviso(): string {
  const base = process.env.URL_PUBLICA?.trim();
  return `${base || `https://app.${dominioDaPlataforma()}`}/api/webhooks/infinitepay`;
}

export type PedidoNaInfinitePay = {
  chaveOperacao?: string;
  clienteId: string;
  processoId?: string | null;
  descricao: string;
  valorCentavos: number;
  vencimento: Date;
  contrato?: { id: string; numero: number; total: number } | null;
};

/**
 * Emite a cobranca na InfinitePay.
 *
 * Mesma ideia do Asaas: reserva a tentativa no banco ANTES da chamada externa,
 * para uma resposta perdida nao virar duas cobrancas. A diferenca e que o id
 * que a InfinitePay conhece e o NOSSO — `order_nsu` e o id da linha — e por
 * isso a reserva precisa existir antes de o link ser pedido.
 */
export async function emitirNaInfinitePay(
  escritorioId: string,
  pedido: PedidoNaInfinitePay,
): Promise<{ id: string; linkPagamento: string | null }> {
  if (pedido.valorCentavos <= 0) {
    throw new PedidoInvalido("O valor precisa ser maior que zero.");
  }
  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0);
  if (pedido.vencimento < hoje) {
    throw new PedidoInvalido("O vencimento nao pode estar no passado.");
  }

  const handle = await handleDoEscritorio(escritorioId);

  const cliente = await comEscritorio(escritorioId, (db) =>
    db.cliente.findFirst({ where: { id: pedido.clienteId } }),
  );
  if (!cliente) throw new PedidoInvalido("Cliente nao encontrado.");

  const chaveOperacao = pedido.chaveOperacao ?? randomUUID();

  let reserva = await comEscritorio(escritorioId, (db) =>
    db.cobranca.findFirst({ where: { chaveOperacao } }),
  );
  if (reserva && reserva.status !== "PENDENTE") {
    return { id: reserva.id, linkPagamento: reserva.linkPagamento };
  }

  if (!reserva) {
    reserva = await comEscritorio(escritorioId, (db) =>
      db.cobranca.create({
        data: semEscritorio({
          chaveOperacao,
          clienteId: pedido.clienteId,
          processoId: pedido.processoId ?? null,
          descricao: pedido.descricao,
          valorCentavos: pedido.valorCentavos,
          vencimento: pedido.vencimento,
          // O checkout deles oferece Pix e cartao, e quem decide e quem paga.
          forma: "QUALQUER",
          provedor: "INFINITEPAY",
          status: "PENDENTE",
          contratoId: pedido.contrato?.id ?? null,
          parcelaNumero: pedido.contrato?.numero ?? null,
          parcelaTotal: pedido.contrato?.total ?? null,
          // O id no provedor E o nosso: order_nsu e o id desta linha.
          idNoProvedor: `pendente:${chaveOperacao}`,
        }),
      }),
    );
  }

  const { url } = await criarLink({
    handle,
    referencia: reserva.id,
    descricao: pedido.descricao,
    valorCentavos: pedido.valorCentavos,
    urlDoAviso: enderecoDoAviso(),
    cliente: {
      nome: cliente.nome,
      email: cliente.email,
      telefone: cliente.telefone,
    },
  });

  await comEscritorio(escritorioId, (db) =>
    db.cobranca.update({
      where: { id: reserva!.id },
      data: {
        idNoProvedor: reserva!.id,
        linkPagamento: url,
        status: "ABERTA",
        sincronizadoEm: new Date(),
      },
    }),
  );

  return { id: reserva.id, linkPagamento: url };
}

export type ResultadoDoAviso =
  | { tratado: true; pago: boolean; motivo: string }
  | { tratado: false; motivo: string };

/**
 * Trata o aviso de pagamento da InfinitePay.
 *
 * O AVISO NAO VEM ASSINADO. Quem soubesse os identificadores poderia mandar um
 * "pago" forjado e tirar uma cobranca da regua sem ter pagado nada. Entao o
 * aviso aqui NAO decide: ele so diz "va olhar". Quem decide e a resposta da
 * propria InfinitePay em `conferirPagamento`.
 *
 * Por isso tambem nao ha token na URL: o segredo nao seguraria nada que a
 * conferencia ja nao segure, e um segredo que nao e necessario e so mais uma
 * coisa para vazar.
 */
export async function tratarAviso(
  aviso: AvisoDaInfinitePay,
): Promise<ResultadoDoAviso> {
  // O order_nsu e o id da nossa cobranca. A busca e pela plataforma porque o
  // aviso chega de fora, sem sessao e sem escritorio.
  const cobranca = await prismaPlataforma().cobranca.findFirst({
    where: { id: aviso.order_nsu, provedor: "INFINITEPAY" },
    select: {
      id: true,
      escritorioId: true,
      descricao: true,
      status: true,
      valorCentavos: true,
      lancamentoId: true,
    },
  });
  if (!cobranca) return { tratado: false, motivo: "Cobranca nao encontrada." };
  if (cobranca.status === "PAGA") {
    return { tratado: true, pago: true, motivo: "Ja estava paga." };
  }

  const handle = await handleDoEscritorio(cobranca.escritorioId);
  const conferencia = await conferirPagamento(handle, aviso);

  if (!conferencia.pago) {
    // Aviso que nao se confirma nao e erro nosso: pode ser tentativa recusada
    // ou aviso forjado. Nos dois casos nao se mexe na cobranca.
    return { tratado: true, pago: false, motivo: "A InfinitePay nao confirmou o pagamento." };
  }

  const quando = new Date();
  const valor = conferencia.valorPagoCentavos ?? cobranca.valorCentavos;

  const lancamentoId = await darBaixa(
    cobranca.escritorioId,
    {
      id: cobranca.id,
      descricao: cobranca.descricao,
      lancamentoId: cobranca.lancamentoId,
    },
    valor,
    quando,
  );

  await comEscritorio(cobranca.escritorioId, (db) =>
    db.cobranca.update({
      where: { id: cobranca.id },
      data: {
        status: "PAGA",
        pagoEm: quando,
        valorPagoCentavos: valor,
        lancamentoId,
        sincronizadoEm: quando,
      },
    }),
  );

  return { tratado: true, pago: true, motivo: "Baixa dada apos conferir com a InfinitePay." };
}
