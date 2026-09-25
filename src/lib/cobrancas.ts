// Cobrancas do escritorio para o cliente dele, pela conta Asaas DELE.
//
// Nao confundir com src/lib/cobranca.ts (singular), que e a plataforma
// cobrando do escritorio. Aqui o dinheiro nao passa pela plataforma em momento
// nenhum: a chave de API e do escritorio, a conta que recebe e do escritorio,
// e o que guardamos e so o espelho do que o Asaas respondeu.
//
// O que a plataforma faz e emitir, acompanhar e dar baixa. Estorno, negociacao
// e cancelamento de recebimento continuam no painel do Asaas — nao vale
// reimplementar meia gestao financeira por cima da API de outro.
import { comEscritorio, semEscritorio } from "./prisma";
import { obterIntegracao, IntegracaoAusente } from "./integracao";
import { buscarComLimite, descreverFalha } from "./conectores/tipos";
import { registrarConsumo, competenciaDe } from "./consumo";
import { moduloAtivo } from "./modulos";
import { randomUUID } from "node:crypto";

export const FORMAS = ["BOLETO", "PIX", "CARTAO", "QUALQUER"] as const;
export type Forma = (typeof FORMAS)[number];

/** Nome da forma na API do Asaas. QUALQUER deixa o cliente escolher na tela. */
const COBRANCA_NO_ASAAS: Record<Forma, string> = {
  BOLETO: "BOLETO",
  PIX: "PIX",
  CARTAO: "CREDIT_CARD",
  QUALQUER: "UNDEFINED",
};

/**
 * Status do Asaas -> nosso status.
 *
 * Status que nao esta aqui NAO vira status nosso: a sincronizacao deixa como
 * estava. E de proposito — um estado novo do Asaas cair em "ABERTA" por
 * descuido seria pior que ficar parado e aparecer na conferencia.
 */
const STATUS_DO_ASAAS: Record<string, string> = {
  PENDING: "ABERTA",
  AWAITING_RISK_ANALYSIS: "ABERTA",
  APPROVED_BY_RISK_ANALYSIS: "ABERTA",
  RECEIVED: "PAGA",
  CONFIRMED: "PAGA",
  RECEIVED_IN_CASH: "PAGA",
  OVERDUE: "VENCIDA",
  REFUNDED: "ESTORNADA",
  REFUND_REQUESTED: "ESTORNADA",
  CHARGEBACK_REQUESTED: "ESTORNADA",
  CHARGEBACK_DISPUTE: "ESTORNADA",
  AWAITING_CHARGEBACK_REVERSAL: "ESTORNADA",
  DELETED: "CANCELADA",
};

export function statusNosso(statusDoAsaas: string): string | null {
  return STATUS_DO_ASAAS[statusDoAsaas] ?? null;
}

// ---------------------------------------------------------------------------
// Erros de dominio — cada um vira um status HTTP proprio na rota
// ---------------------------------------------------------------------------

export class SemContaDeCobranca extends Error {
  readonly status = 503;
  constructor() {
    super("O escritorio ainda nao conectou a conta Asaas em Integracoes.");
    this.name = "SemContaDeCobranca";
  }
}

export class ClienteSemDocumento extends Error {
  readonly status = 422;
  constructor(nome: string) {
    super(
      `${nome} esta sem CPF/CNPJ, e o Asaas exige o documento para cobrar.`,
    );
    this.name = "ClienteSemDocumento";
  }
}

export class FalhaNoAsaas extends Error {
  readonly status = 502;
  constructor(motivo: string, readonly definitiva = false) {
    super(motivo);
    this.name = "FalhaNoAsaas";
  }
}

// ---------------------------------------------------------------------------
// Conversa com o Asaas
// ---------------------------------------------------------------------------

function baseAsaas(): string {
  return process.env.ASAAS_BASE_URL ?? "https://api.asaas.com/v3";
}

/** Reais com duas casas, que e o que a API espera. Centavos nunca saem daqui. */
export function emReaisDecimal(centavos: number): number {
  return Number((centavos / 100).toFixed(2));
}

export function paraCentavosDoAsaas(valor: unknown): number | null {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return null;
  return Math.round(valor * 100);
}

/** aaaa-mm-dd em UTC, que e como a API trata vencimento. */
export function comoDia(data: Date): string {
  return data.toISOString().slice(0, 10);
}

async function chamarAsaas(
  chave: string,
  caminho: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  let resposta: Response;
  try {
    resposta = await buscarComLimite(`${baseAsaas()}${caminho}`, {
      ...init,
      headers: {
        access_token: chave,
        "Content-Type": "application/json",
        "User-Agent": "BirdJud",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  } catch (erro) {
    throw new FalhaNoAsaas(descreverFalha(erro));
  }

  const corpo = (await resposta.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (resposta.status === 401)
    throw new FalhaNoAsaas("O Asaas recusou a chave de API.");
  if (!resposta.ok) {
    // O Asaas devolve o motivo em errors[].description. Ele e util para quem
    // esta na tela ("CPF invalido"), entao vale repassar em vez de "erro 400".
    const erros = corpo?.errors;
    const descricao =
      Array.isArray(erros) && erros.length > 0 && typeof erros[0] === "object"
        ? String((erros[0] as { description?: unknown }).description ?? "")
        : "";
    throw new FalhaNoAsaas(
      descricao || `O Asaas respondeu ${resposta.status}.`,
      resposta.status >= 400 && resposta.status < 500 && resposta.status !== 429,
    );
  }
  if (!corpo) throw new FalhaNoAsaas("O Asaas respondeu sem corpo.");
  return corpo;
}

async function chaveDoEscritorio(escritorioId: string): Promise<string> {
  try {
    const dados = await obterIntegracao<{ chave: string }>(
      escritorioId,
      "ASAAS",
    );
    if (!dados.chave) throw new SemContaDeCobranca();
    return dados.chave;
  } catch (erro) {
    if (erro instanceof IntegracaoAusente) throw new SemContaDeCobranca();
    throw erro;
  }
}

// ---------------------------------------------------------------------------
// Cliente no Asaas
// ---------------------------------------------------------------------------

type ClienteDoBanco = {
  id: string;
  nome: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  idNoAsaas: string | null;
};

/**
 * Garante que o cliente existe na conta Asaas do escritorio e devolve o id de
 * la, guardando-o para a proxima vez.
 *
 * Nao reaproveita cadastro entre escritorios nem procura por documento na base
 * inteira do Asaas: cada escritorio tem a conta dele, e o vinculo e por cliente
 * nosso.
 */
export async function clienteNoAsaas(
  escritorioId: string,
  cliente: ClienteDoBanco,
  chave: string,
): Promise<string> {
  if (cliente.idNoAsaas) return cliente.idNoAsaas;

  const documento = (cliente.documento ?? "").replace(/\D/g, "");
  if (documento.length !== 11 && documento.length !== 14) {
    throw new ClienteSemDocumento(cliente.nome);
  }

  const criado = await chamarAsaas(chave, "/customers", {
    method: "POST",
    body: JSON.stringify({
      name: cliente.nome,
      cpfCnpj: documento,
      email: cliente.email ?? undefined,
      mobilePhone: cliente.telefone?.replace(/\D/g, "") || undefined,
      externalReference: cliente.id,
    }),
  });

  const id = typeof criado.id === "string" ? criado.id : null;
  if (!id) throw new FalhaNoAsaas("O Asaas nao devolveu o id do cliente.");

  await comEscritorio(escritorioId, (db) =>
    db.cliente.update({ where: { id: cliente.id }, data: { idNoAsaas: id } }),
  );
  return id;
}

// ---------------------------------------------------------------------------
// Emitir
// ---------------------------------------------------------------------------

export type PedidoDeCobranca = {
  chaveOperacao?: string;
  clienteId: string;
  processoId?: string | null;
  descricao: string;
  valorCentavos: number;
  vencimento: Date;
  forma: Forma;
};

export class PedidoInvalido extends Error {
  readonly status = 400;
  constructor(motivo: string) {
    super(motivo);
    this.name = "PedidoInvalido";
  }
}

/**
 * Emite a cobranca no Asaas e grava o espelho.
 *
 * Reserva a tentativa antes do POST externo. Uma resposta perdida deixa a
 * tentativa pendente para conciliacao, sem criar uma segunda cobranca.
 */
export async function emitirCobranca(
  escritorioId: string,
  pedido: PedidoDeCobranca,
): Promise<{ id: string; linkPagamento: string | null }> {
  if (pedido.valorCentavos <= 0)
    throw new PedidoInvalido("O valor precisa ser maior que zero.");

  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0);
  if (pedido.vencimento < hoje) {
    throw new PedidoInvalido("O vencimento nao pode estar no passado.");
  }

  const chave = await chaveDoEscritorio(escritorioId);

  const cliente = await comEscritorio(escritorioId, (db) =>
    db.cliente.findUnique({ where: { id: pedido.clienteId } }),
  );
  if (!cliente) throw new PedidoInvalido("Cliente nao encontrado.");

  if (pedido.processoId) {
    const processoId = pedido.processoId;
    const processo = await comEscritorio(escritorioId, (db) =>
      db.processo.findFirst({ where: { id: processoId } }),
    );
    if (!processo) throw new PedidoInvalido("Processo nao encontrado.");
  }

  const idDoCliente = await clienteNoAsaas(escritorioId, cliente, chave);

  const chaveOperacao = pedido.chaveOperacao ?? randomUUID();
  const outraPendente = await comEscritorio(escritorioId, (db) =>
    db.cobranca.findFirst({ where: {
      status: "PENDENTE", clienteId: pedido.clienteId,
      descricao: pedido.descricao, valorCentavos: pedido.valorCentavos,
      vencimento: pedido.vencimento, forma: pedido.forma,
      NOT: { chaveOperacao },
    } }),
  );
  if (outraPendente) throw new PedidoInvalido("Ha uma emissao identica pendente de conciliacao no Asaas.");
  let existente = await comEscritorio(escritorioId, (db) =>
    db.cobranca.findFirst({ where: { chaveOperacao } }),
  );
  if (existente && (
    existente.clienteId !== pedido.clienteId ||
    existente.processoId !== (pedido.processoId ?? null) ||
    existente.descricao !== pedido.descricao ||
    existente.valorCentavos !== pedido.valorCentavos ||
    existente.vencimento.getTime() !== pedido.vencimento.getTime() ||
    existente.forma !== pedido.forma
  )) throw new PedidoInvalido("Esta tentativa pertence a outra cobranca.");

  if (!existente) {
    try {
      existente = await comEscritorio(escritorioId, (db) => db.cobranca.create({
        data: semEscritorio({
          chaveOperacao,
          clienteId: pedido.clienteId,
          processoId: pedido.processoId ?? null,
          descricao: pedido.descricao,
          valorCentavos: pedido.valorCentavos,
          vencimento: pedido.vencimento,
          forma: pedido.forma,
          status: "PENDENTE",
          idNoAsaas: `pendente:${chaveOperacao}`,
        }),
      }));
    } catch (erro) {
      // Outra requisicao ganhou a reserva. Ela faz a chamada externa.
      const concorrente = await comEscritorio(escritorioId, (db) =>
        db.cobranca.findFirst({ where: { chaveOperacao } }),
      );
      if (concorrente) throw new PedidoInvalido("Emissao em andamento. Confira a lista antes de repetir.");
      throw erro;
    }
  } else if (existente.status !== "PENDENTE") {
    return { id: existente.id, linkPagamento: existente.linkPagamento };
  } else {
    return conciliarCobranca(escritorioId, existente.id, chave);
  }

  let criada: Record<string, unknown>;
  try {
    criada = await chamarAsaas(chave, "/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: idDoCliente,
      billingType: COBRANCA_NO_ASAAS[pedido.forma],
      value: emReaisDecimal(pedido.valorCentavos),
      dueDate: comoDia(pedido.vencimento),
      description: pedido.descricao,
      externalReference: existente.id,
    }),
  });
  } catch (erro) {
    // Apenas rejeicao definitiva do provedor autoriza descartar a reserva.
    if (erro instanceof FalhaNoAsaas && erro.definitiva) {
      await comEscritorio(escritorioId, (db) => db.cobranca.delete({ where: { id: existente.id } }));
    }
    throw erro;
  }

  return finalizarCobranca(escritorioId, existente.id, criada);
}

export async function conciliarCobranca(
  escritorioId: string, id: string, chaveConhecida?: string,
): Promise<{ id: string; linkPagamento: string | null }> {
  const pendente = await comEscritorio(escritorioId, (db) => db.cobranca.findFirst({ where: { id } }));
  if (!pendente) throw new PedidoInvalido("Cobranca nao encontrada.");
  if (pendente.status !== "PENDENTE") return { id, linkPagamento: pendente.linkPagamento };
  const chave = chaveConhecida ?? await chaveDoEscritorio(escritorioId);
  // Consulta pelo identificador que foi enviado na criacao. Zero resultados
  // ainda nao prova que o POST anterior falhou: nao repetir automaticamente.
  const lista = await chamarAsaas(chave, `/payments?externalReference=${encodeURIComponent(id)}`);
  const achadas = Array.isArray(lista.data) ? lista.data : [];
  if (achadas.length !== 1 || !achadas[0] || typeof achadas[0] !== "object") {
    throw new PedidoInvalido("Emissao pendente de conciliacao no Asaas. Confira a conta antes de criar outra cobranca.");
  }
  return finalizarCobranca(escritorioId, id, achadas[0] as Record<string, unknown>);
}

async function finalizarCobranca(
  escritorioId: string,
  id: string,
  criada: Record<string, unknown>,
): Promise<{ id: string; linkPagamento: string | null }> {
  const idNoAsaas = typeof criada.id === "string" ? criada.id : null;
  if (!idNoAsaas) throw new FalhaNoAsaas("O Asaas nao devolveu o id da cobranca.");

  const cobranca = await comEscritorio(escritorioId, (db) =>
    db.cobranca.update({
      where: { id },
      data: {
        status: statusNosso(String(criada.status ?? "")) ?? "ABERTA",
        idNoAsaas,
        linkPagamento:
          typeof criada.invoiceUrl === "string" ? criada.invoiceUrl : null,
        linkBoleto:
          typeof criada.bankSlipUrl === "string" ? criada.bankSlipUrl : null,
        sincronizadoEm: new Date(),
      },
    }),
  );

  await registrarConsumo(escritorioId, "COBRANCA_EMITIDA", 1);
  return { id: cobranca.id, linkPagamento: cobranca.linkPagamento };
}

// ---------------------------------------------------------------------------
// Sincronizar e dar baixa
// ---------------------------------------------------------------------------

/**
 * Gera o lancamento de receita da cobranca paga.
 *
 * So acontece com o modulo FINANCEIRO contratado — sem ele o escritorio nao
 * tem livro-caixa nenhum, e criar linha que ele nao pode ver seria dado orfao.
 * A cobranca fica marcada como paga de qualquer jeito.
 */
async function darBaixa(
  escritorioId: string,
  cobranca: { id: string; descricao: string; lancamentoId: string | null },
  valorCentavos: number,
  quando: Date,
): Promise<string | null> {
  if (cobranca.lancamentoId) return cobranca.lancamentoId;
  if (!(await moduloAtivo(escritorioId, "FINANCEIRO"))) return null;

  const lancamento = await comEscritorio(escritorioId, (db) =>
    db.lancamento.create({
      data: semEscritorio({
        descricao: `Recebimento: ${cobranca.descricao}`,
        tipo: "RECEITA",
        competencia: competenciaDe(quando),
        valorCentavos,
        pagoEm: quando,
      }),
    }),
  );
  return lancamento.id;
}

export type ResultadoDaSincronizacao = {
  conferidas: number;
  atualizadas: number;
  pagas: number;
  falhas: { cobranca: string; motivo: string }[];
};

/**
 * Confere no Asaas o estado das cobrancas em aberto.
 *
 * E puxada, nao empurrada: em vez de abrir um webhook por escritorio — cada um
 * com a conta dele, o segredo dele e o endereco dele —, a fila pergunta. Uma
 * cobranca que falha nao derruba as outras: o motivo volta na lista.
 */
export async function sincronizarCobrancas(
  escritorioId: string,
  limite = 200,
): Promise<ResultadoDaSincronizacao> {
  const resultado: ResultadoDaSincronizacao = {
    conferidas: 0,
    atualizadas: 0,
    pagas: 0,
    falhas: [],
  };

  const abertas = await comEscritorio(escritorioId, (db) =>
    db.cobranca.findMany({
      where: { status: { in: ["ABERTA", "VENCIDA"] } },
      orderBy: { vencimento: "asc" },
      take: limite,
    }),
  );
  if (abertas.length === 0) return resultado;

  const chave = await chaveDoEscritorio(escritorioId);

  for (const cobranca of abertas) {
    resultado.conferidas += 1;
    try {
      const doAsaas = await chamarAsaas(
        chave,
        `/payments/${cobranca.idNoAsaas}`,
      );
      const status = statusNosso(String(doAsaas.status ?? ""));
      if (!status) continue;

      const pagouAgora = status === "PAGA" && cobranca.status !== "PAGA";
      const valorPago =
        paraCentavosDoAsaas(doAsaas.value) ?? cobranca.valorCentavos;
      const quando =
        typeof doAsaas.paymentDate === "string" && doAsaas.paymentDate
          ? new Date(`${doAsaas.paymentDate}T12:00:00Z`)
          : new Date();

      const lancamentoId = pagouAgora
        ? await darBaixa(escritorioId, cobranca, valorPago, quando)
        : cobranca.lancamentoId;

      if (status === cobranca.status && !pagouAgora) {
        await comEscritorio(escritorioId, (db) =>
          db.cobranca.update({
            where: { id: cobranca.id },
            data: { sincronizadoEm: new Date() },
          }),
        );
        continue;
      }

      await comEscritorio(escritorioId, (db) =>
        db.cobranca.update({
          where: { id: cobranca.id },
          data: {
            status,
            lancamentoId,
            sincronizadoEm: new Date(),
            ...(pagouAgora
              ? { pagoEm: quando, valorPagoCentavos: valorPago }
              : {}),
          },
        }),
      );
      resultado.atualizadas += 1;
      if (pagouAgora) resultado.pagas += 1;
    } catch (erro) {
      resultado.falhas.push({
        cobranca: cobranca.id,
        motivo: erro instanceof Error ? erro.message : "falha desconhecida",
      });
    }
  }
  return resultado;
}

/**
 * Cancela a cobranca no Asaas e marca aqui.
 *
 * Cobranca ja paga nao se cancela por aqui: devolver dinheiro e decisao do
 * escritorio, e o caminho dela e o painel do Asaas.
 */
export async function cancelarCobranca(
  escritorioId: string,
  id: string,
): Promise<void> {
  const cobranca = await comEscritorio(escritorioId, (db) =>
    db.cobranca.findUnique({ where: { id } }),
  );
  if (!cobranca) throw new PedidoInvalido("Cobranca nao encontrada.");
  if (cobranca.status === "PENDENTE") {
    throw new PedidoInvalido("Concilie a emissao pendente antes de cancelar no Asaas.");
  }
  if (cobranca.status === "PAGA") {
    throw new PedidoInvalido(
      "Cobranca ja paga: o estorno e feito no painel do Asaas.",
    );
  }
  if (cobranca.status === "CANCELADA") return;

  const chave = await chaveDoEscritorio(escritorioId);
  await chamarAsaas(chave, `/payments/${cobranca.idNoAsaas}`, {
    method: "DELETE",
  });

  await comEscritorio(escritorioId, (db) =>
    db.cobranca.update({
      where: { id },
      data: { status: "CANCELADA", sincronizadoEm: new Date() },
    }),
  );
}
