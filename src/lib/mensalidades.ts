// Mensalidade: a cobranca que se repete sem data para acabar — a assinatura
// (subscription) do Asaas (02/11/2026, vindo do sistema da Advocacia Roma).
//
// Quem gera o boleto seguinte e o PROPRIO Asaas. Este modulo nao emite
// cobranca: cria a assinatura la e traz para ca cada cobranca que nasce,
// senao a mensalidade sairia para o cliente sem linha nenhuma aqui para
// conferir se entrou.
//
// Tres regras:
// - a cobranca e espelhada, nao recriada: mesmo idNoProvedor, entao
//   sincronizar duas vezes nao duplica;
// - cobranca que o Asaas apagou (encerramento, exclusao no painel) e ainda
//   nao foi paga vira CANCELADA aqui; recebido nunca se apaga;
// - cobranca que chega JA PAGA (historico trazido do Asaas) entra como paga
//   e SEM baixa no livro-caixa (semBaixa): esse dinheiro ja entrou pelo
//   extrato. Pagamento depois de a linha existir passa pela sincronizacao de
//   sempre, que da a baixa na transicao.
import { comEscritorio, semEscritorio } from "./prisma";
import {
  FalhaNoAsaas,
  PedidoInvalido,
  chamarAsaas,
  chaveDoEscritorio,
  clienteNoAsaas,
  comoDia,
  emReaisDecimal,
  paraCentavosDoAsaas,
  statusNosso,
  type Forma,
} from "./cobrancas";
import { digitosDe, formatarDocumento } from "./documentos";

export const CICLOS = {
  SEMANAL: { asaas: "WEEKLY", rotulo: "Toda semana" },
  QUINZENAL: { asaas: "BIWEEKLY", rotulo: "A cada 15 dias" },
  MENSAL: { asaas: "MONTHLY", rotulo: "Todo mês" },
  BIMESTRAL: { asaas: "BIMONTHLY", rotulo: "A cada 2 meses" },
  TRIMESTRAL: { asaas: "QUARTERLY", rotulo: "A cada 3 meses" },
  SEMESTRAL: { asaas: "SEMIANNUALLY", rotulo: "A cada 6 meses" },
  ANUAL: { asaas: "YEARLY", rotulo: "Uma vez por ano" },
} as const;
export type Ciclo = keyof typeof CICLOS;
export const NOMES_DOS_CICLOS = Object.keys(CICLOS) as Ciclo[];

/**
 * Ciclo do Asaas para o nosso. Desconhecido devolve null — e quem chama
 * recusa: gravar "todo mes" para uma assinatura semanal seria informacao
 * errada em silencio.
 */
export function cicloDoAsaas(asaas: string | null | undefined): Ciclo | null {
  return (NOMES_DOS_CICLOS.find((c) => CICLOS[c].asaas === asaas) ?? null) as Ciclo | null;
}

const FORMA_NO_ASAAS: Record<string, string> = { BOLETO: "BOLETO", PIX: "PIX", CARTAO: "CREDIT_CARD", QUALQUER: "UNDEFINED" };
const FORMA_DO_ASAAS: Record<string, Forma> = { BOLETO: "BOLETO", PIX: "PIX", CREDIT_CARD: "CARTAO", UNDEFINED: "QUALQUER" };

const dia = (texto: unknown, reserva: Date) =>
  typeof texto === "string" && /^\d{4}-\d{2}-\d{2}/.test(texto) ? new Date(`${texto.slice(0, 10)}T12:00:00Z`) : reserva;

// ---------------------------------------------------------------------------
// Criar
// ---------------------------------------------------------------------------

export async function criarMensalidade(
  escritorioId: string,
  pedido: { clienteId: string; descricao: string; valorCentavos: number; ciclo: Ciclo; forma: Forma; primeiroVencimento: Date },
) {
  if (pedido.valorCentavos < 500) throw new PedidoInvalido("A mensalidade precisa ser de pelo menos R$ 5,00, o mínimo do Asaas.");
  if (!CICLOS[pedido.ciclo]) throw new PedidoInvalido("Ciclo inválido.");
  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0);
  if (pedido.primeiroVencimento < hoje) throw new PedidoInvalido("O primeiro vencimento não pode estar no passado.");

  const chave = await chaveDoEscritorio(escritorioId);
  const cliente = await comEscritorio(escritorioId, (db) => db.cliente.findFirst({ where: { id: pedido.clienteId } }));
  if (!cliente) throw new PedidoInvalido("Cliente não encontrado.");
  const idDoCliente = await clienteNoAsaas(escritorioId, cliente, chave);

  // Assinatura que ja existe no painel do Asaas para este cliente: criar
  // outra faria ele receber dois boletos no mes, e quem criou nem saberia.
  const ativas = await chamarAsaas(chave, `/subscriptions?customer=${encodeURIComponent(idDoCliente)}&status=ACTIVE`);
  const lista = (Array.isArray(ativas.data) ? ativas.data : []) as Array<Record<string, unknown>>;
  const jaAqui = await comEscritorio(escritorioId, (db) =>
    db.mensalidade.findMany({ where: { idNoProvedor: { in: lista.map((a) => String(a.id)) } }, select: { idNoProvedor: true } }),
  );
  const deFora = lista.filter((a) => !a.deleted && !jaAqui.some((m) => m.idNoProvedor === a.id));
  if (deFora.length) {
    throw new PedidoInvalido(
      `${cliente.nome} já tem mensalidade ativa no painel do Asaas (${emReais(paraCentavosDoAsaas(deFora[0].value) ?? 0)}). Use "Trazer do Asaas" para ligá-la aqui, em vez de criar outra.`,
    );
  }

  const criada = await chamarAsaas(chave, "/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: idDoCliente,
      billingType: FORMA_NO_ASAAS[pedido.forma] ?? "UNDEFINED",
      value: emReaisDecimal(pedido.valorCentavos),
      nextDueDate: comoDia(pedido.primeiroVencimento),
      cycle: CICLOS[pedido.ciclo].asaas,
      description: pedido.descricao.slice(0, 500),
    }),
  });
  if (typeof criada.id !== "string") throw new FalhaNoAsaas("O Asaas não devolveu o id da assinatura.");

  const mensalidade = await comEscritorio(escritorioId, (db) =>
    db.mensalidade.create({
      data: semEscritorio({
        clienteId: cliente.id,
        descricao: pedido.descricao,
        valorCentavos: pedido.valorCentavos,
        ciclo: pedido.ciclo,
        forma: pedido.forma,
        proximoVencimento: dia(criada.nextDueDate, pedido.primeiroVencimento),
        idNoProvedor: criada.id as string,
      }),
    }),
  );
  // A primeira cobranca o Asaas costuma gerar na hora: ja traz.
  await sincronizarMensalidade(escritorioId, mensalidade.id).catch(() => null);
  return mensalidade;
}

const emReais = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ---------------------------------------------------------------------------
// Espelhar e sincronizar
// ---------------------------------------------------------------------------

/** Uma cobranca do Asaas vira linha aqui, ou atualiza a que ja existe. */
export async function espelharCobrancaDaMensalidade(
  escritorioId: string,
  pagamento: Record<string, unknown>,
  mensalidade: { id: string; clienteId: string; descricao: string; forma: string },
): Promise<"nova" | "atualizada" | "ignorada"> {
  const idNoProvedor = String(pagamento.id ?? "");
  if (!idNoProvedor || pagamento.deleted === true) return "ignorada";
  const status = statusNosso(String(pagamento.status ?? "")) ?? "ABERTA";
  const valor = paraCentavosDoAsaas(pagamento.value) ?? 0;
  const links = {
    linkPagamento: typeof pagamento.invoiceUrl === "string" ? pagamento.invoiceUrl : null,
    linkBoleto: typeof pagamento.bankSlipUrl === "string" ? pagamento.bankSlipUrl : null,
  };

  const existente = await comEscritorio(escritorioId, (db) => db.cobranca.findFirst({ where: { idNoProvedor } }));
  if (existente) {
    // A troca de situacao (e a baixa) e da sincronizacao das cobrancas. Aqui
    // so o vinculo, o link que pode ter demorado a existir e o cancelamento.
    const dados: Record<string, unknown> = {};
    if (!existente.mensalidadeId) dados.mensalidadeId = mensalidade.id;
    if (links.linkBoleto && links.linkBoleto !== existente.linkBoleto) dados.linkBoleto = links.linkBoleto;
    if (links.linkPagamento && links.linkPagamento !== existente.linkPagamento) dados.linkPagamento = links.linkPagamento;
    if (status === "CANCELADA" && existente.status !== "PAGA" && existente.status !== "CANCELADA") dados.status = "CANCELADA";
    if (!Object.keys(dados).length) return "ignorada";
    await comEscritorio(escritorioId, (db) => db.cobranca.update({ where: { id: existente.id }, data: dados }));
    return "atualizada";
  }

  const paga = status === "PAGA";
  await comEscritorio(escritorioId, (db) =>
    db.cobranca.create({
      data: semEscritorio({
        clienteId: mensalidade.clienteId,
        mensalidadeId: mensalidade.id,
        descricao: (typeof pagamento.description === "string" && pagamento.description.trim()) || mensalidade.descricao,
        valorCentavos: valor,
        vencimento: dia(pagamento.dueDate, new Date()),
        forma: FORMA_DO_ASAAS[String(pagamento.billingType ?? "")] ?? (mensalidade.forma as Forma),
        status,
        idNoProvedor,
        ...links,
        sincronizadoEm: new Date(),
        ...(paga
          ? {
              pagoEm: dia(pagamento.paymentDate ?? pagamento.clientPaymentDate, new Date()),
              valorPagoCentavos: valor,
              semBaixa: true,
            }
          : {}),
      }),
    }),
  );
  return "nova";
}

export type ResultadoDaMensalidade = { novas: number; atualizadas: number; canceladas: number };

/** Traz do Asaas as cobrancas de uma mensalidade e acerta a situacao dela. */
export async function sincronizarMensalidade(escritorioId: string, id: string, chaveConhecida?: string): Promise<ResultadoDaMensalidade> {
  const mensalidade = await comEscritorio(escritorioId, (db) => db.mensalidade.findFirst({ where: { id } }));
  if (!mensalidade) throw new PedidoInvalido("Mensalidade não encontrada.");
  const chave = chaveConhecida ?? (await chaveDoEscritorio(escritorioId));
  const r: ResultadoDaMensalidade = { novas: 0, atualizadas: 0, canceladas: 0 };

  const pagamentos: Array<Record<string, unknown>> = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const pagina = await chamarAsaas(chave, `/subscriptions/${mensalidade.idNoProvedor}/payments?offset=${offset}&limit=100`);
    pagamentos.push(...((Array.isArray(pagina.data) ? pagina.data : []) as Array<Record<string, unknown>>));
    if (!pagina.hasMore) break;
  }
  for (const p of pagamentos) {
    const s = await espelharCobrancaDaMensalidade(escritorioId, p, mensalidade);
    if (s === "nova") r.novas += 1;
    if (s === "atualizada") r.atualizadas += 1;
  }

  // Apagada no Asaas e ainda nao paga: nao pode seguir como "a receber".
  const vivas = pagamentos.filter((p) => p.deleted !== true).map((p) => String(p.id));
  const orfas = await comEscritorio(escritorioId, (db) =>
    db.cobranca.updateMany({
      where: { mensalidadeId: mensalidade.id, status: { in: ["ABERTA", "VENCIDA"] }, idNoProvedor: { notIn: vivas.length ? vivas : ["-"] } },
      data: { status: "CANCELADA", sincronizadoEm: new Date() },
    }),
  );
  r.canceladas = orfas.count;

  // Proximo vencimento, valor e situacao: quem manda e o Asaas, que gera.
  let assinatura: Record<string, unknown> | null = null;
  try {
    assinatura = await chamarAsaas(chave, `/subscriptions/${mensalidade.idNoProvedor}`);
  } catch (erro) {
    if (!(erro instanceof FalhaNoAsaas && erro.definitiva)) throw erro;
  }
  const dados: Record<string, unknown> = { sincronizadaEm: new Date() };
  if (!assinatura || assinatura.deleted === true || assinatura.status === "EXPIRED") {
    if (mensalidade.status !== "ENCERRADA") {
      dados.status = "ENCERRADA";
      dados.encerradaEm = new Date();
      dados.motivoEncerramento =
        assinatura?.status === "EXPIRED" ? "A assinatura chegou ao fim no Asaas." : "A assinatura foi removida no painel do Asaas.";
    }
  } else {
    dados.proximoVencimento = dia(assinatura.nextDueDate, mensalidade.proximoVencimento);
    const valor = paraCentavosDoAsaas(assinatura.value);
    if (valor !== null) dados.valorCentavos = valor;
    const ciclo = cicloDoAsaas(String(assinatura.cycle ?? ""));
    if (ciclo) dados.ciclo = ciclo;
    if (assinatura.status === "INACTIVE" && mensalidade.status === "ATIVA") dados.status = "SUSPENSA";
    if (assinatura.status === "ACTIVE" && mensalidade.status === "SUSPENSA") dados.status = "ATIVA";
  }
  await comEscritorio(escritorioId, (db) => db.mensalidade.update({ where: { id: mensalidade.id }, data: dados }));
  return r;
}

/** Rotina diaria: todas as mensalidades de pe do escritorio. Uma falha nao para as outras. */
export async function sincronizarMensalidades(escritorioId: string): Promise<{ conferidas: number; novas: number; falhas: string[] }> {
  const lista = await comEscritorio(escritorioId, (db) =>
    db.mensalidade.findMany({ where: { status: { in: ["ATIVA", "SUSPENSA"] } }, select: { id: true } }),
  );
  const r = { conferidas: 0, novas: 0, falhas: [] as string[] };
  if (!lista.length) return r;
  const chave = await chaveDoEscritorio(escritorioId);
  for (const m of lista) {
    try {
      r.novas += (await sincronizarMensalidade(escritorioId, m.id, chave)).novas;
      r.conferidas += 1;
    } catch (erro) {
      r.falhas.push(`${m.id}: ${(erro as Error).message}`.slice(0, 160));
    }
  }
  return r;
}

// ---------------------------------------------------------------------------
// Alterar, suspender, reativar, encerrar
// ---------------------------------------------------------------------------

async function exigir(escritorioId: string, id: string) {
  const m = await comEscritorio(escritorioId, (db) => db.mensalidade.findFirst({ where: { id } }));
  if (!m) throw new PedidoInvalido("Mensalidade não encontrada.");
  if (m.status === "ENCERRADA") throw new PedidoInvalido("Mensalidade encerrada não muda mais.");
  return m;
}

/**
 * Novo valor. Vale tambem para os boletos ja gerados e nao pagos
 * (updatePendingPayments): sem isso, o deste mes ficaria com o valor antigo
 * na mao do cliente.
 */
export async function alterarValor(escritorioId: string, id: string, valorCentavos: number) {
  if (valorCentavos < 500) throw new PedidoInvalido("A mensalidade precisa ser de pelo menos R$ 5,00.");
  const m = await exigir(escritorioId, id);
  const chave = await chaveDoEscritorio(escritorioId);
  await chamarAsaas(chave, `/subscriptions/${m.idNoProvedor}`, {
    method: "PUT",
    body: JSON.stringify({ value: emReaisDecimal(valorCentavos), updatePendingPayments: true }),
  });
  await comEscritorio(escritorioId, (db) => db.mensalidade.update({ where: { id }, data: { valorCentavos } }));
  return sincronizarMensalidade(escritorioId, id, chave);
}

/** Suspender: para de gerar, e o boleto que ja esta com o cliente continua valendo. */
export async function suspenderMensalidade(escritorioId: string, id: string) {
  const m = await exigir(escritorioId, id);
  const chave = await chaveDoEscritorio(escritorioId);
  await chamarAsaas(chave, `/subscriptions/${m.idNoProvedor}`, { method: "PUT", body: JSON.stringify({ status: "INACTIVE" }) });
  await comEscritorio(escritorioId, (db) => db.mensalidade.update({ where: { id }, data: { status: "SUSPENSA" } }));
}

export async function reativarMensalidade(escritorioId: string, id: string) {
  const m = await exigir(escritorioId, id);
  const chave = await chaveDoEscritorio(escritorioId);
  await chamarAsaas(chave, `/subscriptions/${m.idNoProvedor}`, { method: "PUT", body: JSON.stringify({ status: "ACTIVE" }) });
  await comEscritorio(escritorioId, (db) => db.mensalidade.update({ where: { id }, data: { status: "ATIVA" } }));
  await sincronizarMensalidade(escritorioId, id, chave).catch(() => null);
}

/**
 * Encerrar de vez: o Asaas apaga junto os boletos pendentes e vencidos desta
 * assinatura (os pagos ficam no historico). Aqui eles viram CANCELADA na
 * sincronizacao que vem logo depois.
 */
export async function encerrarMensalidade(escritorioId: string, id: string, motivo: string | null) {
  const m = await exigir(escritorioId, id);
  const chave = await chaveDoEscritorio(escritorioId);
  await chamarAsaas(chave, `/subscriptions/${m.idNoProvedor}`, { method: "DELETE" });
  await sincronizarMensalidade(escritorioId, id, chave).catch(() => null);
  await comEscritorio(escritorioId, (db) =>
    db.mensalidade.update({
      where: { id },
      data: { status: "ENCERRADA", encerradaEm: new Date(), motivoEncerramento: motivo?.trim() || "Encerrada pelo escritório." },
    }),
  );
}

// ---------------------------------------------------------------------------
// Trazer do Asaas o que ja existe la
// ---------------------------------------------------------------------------

export type AssinaturaDeFora = {
  idNoProvedor: string;
  descricao: string;
  valorCentavos: number;
  ciclo: Ciclo | null;
  cicloNoAsaas: string;
  proximoVencimento: string | null;
  ativa: boolean;
  pagador: { nome: string | null; documento: string | null };
  /** Cliente daqui reconhecido pela conta no Asaas ou pelo CPF/CNPJ. */
  clienteSugerido: { id: string; nome: string } | null;
};

/**
 * Assinaturas que estao no Asaas e ainda nao estao aqui. Reconhece o cliente
 * pela conta no Asaas ou pelo CPF/CNPJ; quando nao reconhece, a tela pergunta
 * de quem e em vez de adivinhar.
 */
export async function assinaturasDeFora(escritorioId: string): Promise<AssinaturaDeFora[]> {
  const chave = await chaveDoEscritorio(escritorioId);
  const todas: Array<Record<string, unknown>> = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const pagina = await chamarAsaas(chave, `/subscriptions?offset=${offset}&limit=100`);
    todas.push(...((Array.isArray(pagina.data) ? pagina.data : []) as Array<Record<string, unknown>>));
    if (!pagina.hasMore) break;
  }
  const vivas = todas.filter((a) => a.deleted !== true && a.status !== "EXPIRED");
  const jaAqui = new Set(
    (
      await comEscritorio(escritorioId, (db) =>
        db.mensalidade.findMany({ where: { idNoProvedor: { in: vivas.map((a) => String(a.id)) } }, select: { idNoProvedor: true } }),
      )
    ).map((m) => m.idNoProvedor),
  );
  const clientes = await comEscritorio(escritorioId, (db) =>
    db.cliente.findMany({ select: { id: true, nome: true, documento: true, idNoAsaas: true } }),
  );

  const resultado: AssinaturaDeFora[] = [];
  const pagadores = new Map<string, { nome: string | null; documento: string | null }>();
  for (const a of vivas.filter((x) => !jaAqui.has(String(x.id)))) {
    const customer = String(a.customer ?? "");
    if (!pagadores.has(customer)) {
      const c = await chamarAsaas(chave, `/customers/${encodeURIComponent(customer)}`).catch(() => null);
      pagadores.set(customer, {
        nome: typeof c?.name === "string" ? c.name : null,
        documento: typeof c?.cpfCnpj === "string" ? c.cpfCnpj : null,
      });
    }
    const pagador = pagadores.get(customer)!;
    const doc = digitosDe(pagador.documento ?? "");
    const achado =
      clientes.find((c) => c.idNoAsaas && c.idNoAsaas === customer) ??
      (doc ? clientes.find((c) => digitosDe(c.documento ?? "") === doc) : undefined);
    resultado.push({
      idNoProvedor: String(a.id),
      descricao: (typeof a.description === "string" && a.description.trim()) || "Mensalidade",
      valorCentavos: paraCentavosDoAsaas(a.value) ?? 0,
      ciclo: cicloDoAsaas(String(a.cycle ?? "")),
      cicloNoAsaas: String(a.cycle ?? ""),
      proximoVencimento: typeof a.nextDueDate === "string" ? a.nextDueDate : null,
      ativa: a.status === "ACTIVE",
      pagador: { nome: pagador.nome, documento: pagador.documento ? formatarDocumento(pagador.documento) : null },
      clienteSugerido: achado ? { id: achado.id, nome: achado.nome } : null,
    });
  }
  return resultado;
}

/**
 * Liga aqui uma assinatura que ja existe no Asaas, sem criar nada la. As
 * cobrancas ja pagas entram sem baixa (o dinheiro ja entrou pelo extrato).
 */
export async function trazerDoAsaas(escritorioId: string, idNoProvedor: string, clienteId: string) {
  const chave = await chaveDoEscritorio(escritorioId);
  const a = await chamarAsaas(chave, `/subscriptions/${encodeURIComponent(idNoProvedor)}`);
  if (a.deleted === true) throw new PedidoInvalido("Essa assinatura foi removida no Asaas.");
  const ciclo = cicloDoAsaas(String(a.cycle ?? ""));
  if (!ciclo) throw new PedidoInvalido(`Ciclo "${String(a.cycle)}" do Asaas não é conhecido aqui. Nada foi trazido.`);
  const cliente = await comEscritorio(escritorioId, (db) => db.cliente.findFirst({ where: { id: clienteId } }));
  if (!cliente) throw new PedidoInvalido("Cliente não encontrado.");

  const existente = await comEscritorio(escritorioId, (db) => db.mensalidade.findFirst({ where: { idNoProvedor } }));
  if (existente) return existente;

  const mensalidade = await comEscritorio(escritorioId, async (db) => {
    // A conta do pagador no Asaas passa a ser a deste cliente, se ele nao tinha.
    if (!cliente.idNoAsaas && typeof a.customer === "string") {
      await db.cliente.updateMany({ where: { id: cliente.id }, data: { idNoAsaas: a.customer } });
    }
    return db.mensalidade.create({
      data: semEscritorio({
        clienteId: cliente.id,
        descricao: (typeof a.description === "string" && a.description.trim()) || "Mensalidade",
        valorCentavos: paraCentavosDoAsaas(a.value) ?? 0,
        ciclo,
        forma: FORMA_DO_ASAAS[String(a.billingType ?? "")] ?? "QUALQUER",
        proximoVencimento: dia(a.nextDueDate, new Date()),
        idNoProvedor,
        status: a.status === "INACTIVE" ? "SUSPENSA" : "ATIVA",
        importada: true,
      }),
    });
  });
  await sincronizarMensalidade(escritorioId, mensalidade.id, chave);
  return mensalidade;
}
