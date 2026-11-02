// Conferencia das cobrancas do Asaas contra o sistema (03/11/2026, vindo do
// sistema da Advocacia Roma).
//
// Muita cobranca e criada direto no painel do Asaas, e ai o cliente paga todo
// mes sem aparecer como recebimento aqui — o escritorio nao consegue levantar
// quanto entrou. O ASAAS MANDA: ele emitiu, cobrou e recebeu; o sistema e que
// e conferido contra ele. Esta conferencia NUNCA altera nada no Asaas: so traz
// para dentro o que falta, e so o que alguem marcar.
//
// Quatro grupos, porque cada um pede conduta diferente:
// - no Asaas e nao aqui (com cliente reconhecido): pode ser trazida;
// - nos dois, mas diverge em valor, vencimento ou pagamento: so aponta —
//   mudar cobranca emitida e decisao de quem cobra;
// - pagador fora do cadastro de clientes: falta o cliente;
// - por cliente: quanto o Asaas recebeu contra o que o contrato preve.
import { comEscritorio, prismaPlataforma, semEscritorio } from "./prisma";
import { PedidoInvalido, chamarAsaas, chaveDoEscritorio, darBaixa, paraCentavosDoAsaas, statusNosso, type Forma } from "./cobrancas";
import { digitosDe, formatarDocumento } from "./documentos";

const FORMA_DO_ASAAS: Record<string, Forma> = { BOLETO: "BOLETO", PIX: "PIX", CREDIT_CARD: "CARTAO", UNDEFINED: "QUALQUER" };
const JANELA_DIAS = 400;

type PagamentoDoAsaas = Record<string, unknown>;

export type DeFora = {
  idNoProvedor: string;
  clienteId: string;
  cliente: string;
  descricao: string;
  valorCentavos: number;
  vencimento: string;
  situacao: string;
  pagoEm: string | null;
  /** De uma mensalidade (assinatura): o caminho e "Trazer do Asaas" das mensalidades. */
  daMensalidade: boolean;
};

export type Divergente = {
  cobrancaId: string;
  cliente: string;
  descricao: string;
  diferencas: string[];
};

export type SemCliente = { pagador: string; documento: string | null; quantas: number; valorCentavos: number };

export type PorCliente = { clienteId: string; cliente: string; recebidoNoAsaas: number; previstoNoContrato: number };

export type Conferencia = {
  deFora: DeFora[];
  divergentes: Divergente[];
  semCliente: SemCliente[];
  porCliente: PorCliente[];
  conferidoEm: Date;
};

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dia = (texto: unknown) => (typeof texto === "string" ? texto.slice(0, 10) : "");
const diaBR = (iso: string) => iso.split("-").reverse().join("/");

async function pagamentosDoAsaas(chave: string, desde: Date): Promise<PagamentoDoAsaas[]> {
  const todos: PagamentoDoAsaas[] = [];
  const ge = desde.toISOString().slice(0, 10);
  for (let offset = 0; offset < 5000; offset += 100) {
    const pagina = await chamarAsaas(chave, `/payments?dueDate%5Bge%5D=${ge}&offset=${offset}&limit=100`);
    todos.push(...((Array.isArray(pagina.data) ? pagina.data : []) as PagamentoDoAsaas[]));
    if (!pagina.hasMore) break;
  }
  return todos.filter((p) => p.deleted !== true);
}

/** Compara o Asaas com o sistema. Le o Asaas, nao escreve nada em lugar nenhum. */
export async function conferirComOAsaas(escritorioId: string, agora = new Date()): Promise<Conferencia> {
  const chave = await chaveDoEscritorio(escritorioId);
  const desde = new Date(agora.getTime() - JANELA_DIAS * 86_400_000);
  const pagamentos = await pagamentosDoAsaas(chave, desde);

  const [cobrancas, clientes, mensalidades, previstos] = await comEscritorio(escritorioId, (db) =>
    Promise.all([
      db.cobranca.findMany({
        where: { provedor: "ASAAS" },
        select: { id: true, idNoProvedor: true, valorCentavos: true, vencimento: true, status: true, descricao: true, cliente: { select: { nome: true } } },
      }),
      db.cliente.findMany({ select: { id: true, nome: true, documento: true, idNoAsaas: true } }),
      db.mensalidade.findMany({ select: { idNoProvedor: true } }),
      db.lancamento.findMany({
        where: { tipo: "RECEITA", contratoId: { not: null }, vencimento: { gte: desde, lte: agora } },
        select: { valorCentavos: true, contratoId: true },
      }),
    ]),
  );
  const contratos = await comEscritorio(escritorioId, (db) =>
    db.contratoDeHonorarios.findMany({ select: { id: true, clienteId: true } }),
  );

  const porId = new Map(cobrancas.map((c) => [c.idNoProvedor, c]));
  const mensalidadesAqui = new Set(mensalidades.map((m) => m.idNoProvedor));

  // Cliente do pagador: pela conta no Asaas, senao pelo CPF/CNPJ (consultado uma vez por pagador).
  const pagadores = new Map<string, { id: string; nome: string } | { semCliente: true; nome: string; documento: string | null }>();
  async function clienteDo(customer: string) {
    if (pagadores.has(customer)) return pagadores.get(customer)!;
    const pelaConta = clientes.find((c) => c.idNoAsaas === customer);
    if (pelaConta) {
      pagadores.set(customer, { id: pelaConta.id, nome: pelaConta.nome });
      return pagadores.get(customer)!;
    }
    const c = await chamarAsaas(chave, `/customers/${encodeURIComponent(customer)}`).catch(() => null);
    const doc = digitosDe(typeof c?.cpfCnpj === "string" ? c.cpfCnpj : "");
    const peloDocumento = doc ? clientes.find((x) => digitosDe(x.documento ?? "") === doc) : undefined;
    pagadores.set(
      customer,
      peloDocumento
        ? { id: peloDocumento.id, nome: peloDocumento.nome }
        : { semCliente: true, nome: typeof c?.name === "string" ? c.name : "Pagador sem nome", documento: doc ? formatarDocumento(doc) : null },
    );
    return pagadores.get(customer)!;
  }

  const deFora: DeFora[] = [];
  const divergentes: Divergente[] = [];
  const semCliente = new Map<string, SemCliente>();
  const recebidoPorCliente = new Map<string, number>();

  for (const p of pagamentos) {
    const id = String(p.id ?? "");
    const valor = paraCentavosDoAsaas(p.value) ?? 0;
    const status = statusNosso(String(p.status ?? "")) ?? "ABERTA";
    const pago = status === "PAGA";
    const quem = await clienteDo(String(p.customer ?? ""));
    if ("id" in quem && pago) recebidoPorCliente.set(quem.id, (recebidoPorCliente.get(quem.id) ?? 0) + valor);

    const aqui = porId.get(id);
    if (aqui) {
      const diferencas: string[] = [];
      if (aqui.valorCentavos !== valor) diferencas.push(`valor: ${reais(aqui.valorCentavos)} aqui, ${reais(valor)} no Asaas`);
      const venc = dia(p.dueDate);
      if (venc && aqui.vencimento.toISOString().slice(0, 10) !== venc)
        diferencas.push(`vencimento: ${diaBR(aqui.vencimento.toISOString().slice(0, 10))} aqui, ${diaBR(venc)} no Asaas`);
      if (pago && aqui.status !== "PAGA") diferencas.push("paga no Asaas e em aberto aqui (conferir no Asaas resolve)");
      if (!pago && aqui.status === "PAGA" && status !== "ESTORNADA") diferencas.push("paga aqui e em aberto no Asaas");
      if (status === "CANCELADA" && aqui.status !== "CANCELADA") diferencas.push("cancelada no Asaas");
      if (diferencas.length) divergentes.push({ cobrancaId: aqui.id, cliente: aqui.cliente.nome, descricao: aqui.descricao, diferencas });
      continue;
    }
    if (status === "CANCELADA") continue;
    if (!("id" in quem)) {
      const k = `${quem.nome}|${quem.documento ?? ""}`;
      const s = semCliente.get(k) ?? { pagador: quem.nome, documento: quem.documento, quantas: 0, valorCentavos: 0 };
      s.quantas += 1;
      s.valorCentavos += valor;
      semCliente.set(k, s);
      continue;
    }
    deFora.push({
      idNoProvedor: id,
      clienteId: quem.id,
      cliente: quem.nome,
      descricao: (typeof p.description === "string" && p.description.trim()) || "Cobrança do Asaas",
      valorCentavos: valor,
      vencimento: dia(p.dueDate),
      situacao: status,
      pagoEm: pago ? dia(p.paymentDate ?? p.clientPaymentDate) || null : null,
      daMensalidade: typeof p.subscription === "string" && !mensalidadesAqui.has(p.subscription),
    });
  }

  const previstoPorCliente = new Map<string, number>();
  for (const l of previstos) {
    const clienteId = contratos.find((c) => c.id === l.contratoId)?.clienteId;
    if (clienteId) previstoPorCliente.set(clienteId, (previstoPorCliente.get(clienteId) ?? 0) + l.valorCentavos);
  }
  const ids = new Set([...recebidoPorCliente.keys(), ...previstoPorCliente.keys()]);
  const porCliente = [...ids]
    .map((clienteId) => ({
      clienteId,
      cliente: clientes.find((c) => c.id === clienteId)?.nome ?? "—",
      recebidoNoAsaas: recebidoPorCliente.get(clienteId) ?? 0,
      previstoNoContrato: previstoPorCliente.get(clienteId) ?? 0,
    }))
    .filter((c) => c.previstoNoContrato > 0 && c.recebidoNoAsaas !== c.previstoNoContrato)
    .sort((a, b) => Math.abs(b.previstoNoContrato - b.recebidoNoAsaas) - Math.abs(a.previstoNoContrato - a.recebidoNoAsaas));

  deFora.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  return { deFora, divergentes, semCliente: [...semCliente.values()], porCliente, conferidoEm: agora };
}

/**
 * Traz para dentro as cobrancas marcadas. A que ja estava paga entra quitada,
 * com a receita na data real do pagamento (lancarReceita): esse dinheiro nao
 * entrou no livro-caixa por caminho nenhum. Quem ja lancou o recebimento a mao
 * desmarca, e ela entra quitada sem receita.
 */
export async function trazerCobrancasDoAsaas(
  escritorioId: string,
  ids: string[],
  opcoes: { lancarReceita: boolean },
): Promise<{ trazidas: number; recusadas: string[] }> {
  const chave = await chaveDoEscritorio(escritorioId);
  const clientes = await comEscritorio(escritorioId, (db) => db.cliente.findMany({ select: { id: true, documento: true, idNoAsaas: true } }));
  const r = { trazidas: 0, recusadas: [] as string[] };
  for (const id of [...new Set(ids)].slice(0, 200)) {
    try {
      const ja = await comEscritorio(escritorioId, (db) => db.cobranca.findFirst({ where: { idNoProvedor: id }, select: { id: true } }));
      if (ja) continue;
      const p = await chamarAsaas(chave, `/payments/${encodeURIComponent(id)}`);
      if (p.deleted === true) throw new PedidoInvalido("removida no Asaas");
      const customer = String(p.customer ?? "");
      let cliente = clientes.find((c) => c.idNoAsaas === customer);
      if (!cliente) {
        const c = await chamarAsaas(chave, `/customers/${encodeURIComponent(customer)}`);
        const doc = digitosDe(typeof c.cpfCnpj === "string" ? c.cpfCnpj : "");
        cliente = doc ? clientes.find((x) => digitosDe(x.documento ?? "") === doc) : undefined;
      }
      if (!cliente) throw new PedidoInvalido("pagador fora do cadastro de clientes");
      const status = statusNosso(String(p.status ?? "")) ?? "ABERTA";
      const valor = paraCentavosDoAsaas(p.value) ?? 0;
      const pagoEm = status === "PAGA" ? new Date(`${dia(p.paymentDate ?? p.clientPaymentDate) || dia(p.dueDate)}T12:00:00Z`) : null;
      const criada = await comEscritorio(escritorioId, (db) =>
        db.cobranca.create({
          data: semEscritorio({
            clienteId: cliente!.id,
            descricao: (typeof p.description === "string" && p.description.trim()) || "Cobrança do Asaas",
            valorCentavos: valor,
            vencimento: new Date(`${dia(p.dueDate)}T12:00:00Z`),
            forma: FORMA_DO_ASAAS[String(p.billingType ?? "")] ?? "QUALQUER",
            status,
            idNoProvedor: id,
            linkPagamento: typeof p.invoiceUrl === "string" ? p.invoiceUrl : null,
            linkBoleto: typeof p.bankSlipUrl === "string" ? p.bankSlipUrl : null,
            parcelamentoId: typeof p.installment === "string" ? p.installment : null,
            sincronizadoEm: new Date(),
            ...(pagoEm ? { pagoEm, valorPagoCentavos: valor, semBaixa: !opcoes.lancarReceita } : {}),
          }),
        }),
      );
      if (pagoEm && opcoes.lancarReceita) {
        const lancamentoId = await darBaixa(escritorioId, criada, valor, pagoEm);
        if (lancamentoId) await comEscritorio(escritorioId, (db) => db.cobranca.update({ where: { id: criada.id }, data: { lancamentoId } }));
      }
      r.trazidas += 1;
    } catch (erro) {
      r.recusadas.push(`${id}: ${(erro as Error).message}`);
    }
  }
  return r;
}

/**
 * Varredura da rotina diaria: so conta o que esta no Asaas e nao aqui, e
 * guarda no escritorio para a tela avisar. A lacuna e silenciosa — o cliente
 * paga no Asaas e ninguem fica sabendo ate o levantamento nao fechar.
 */
export async function varrerAsaas(escritorioId: string): Promise<number> {
  const c = await conferirComOAsaas(escritorioId);
  const quantas = c.deFora.filter((d) => !d.daMensalidade).length;
  await prismaPlataforma().escritorio.update({
    where: { id: escritorioId },
    data: { asaasForaDoSistema: quantas, asaasConferidoEm: c.conferidoEm },
  });
  return quantas;
}
