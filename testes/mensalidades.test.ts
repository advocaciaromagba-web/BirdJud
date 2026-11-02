// Mensalidade (assinatura do Asaas) e fatura parcelada. O Asaas e um HTTP
// local com estado: assinaturas, cobrancas e parcelamentos. O que se prova e
// o comportamento do modulo — espelhar sem duplicar, cancelar o que o Asaas
// apagou, historico pago sem receita repetida, recusa de assinatura em dobro.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { salvarIntegracao } from "../src/lib/integracao";
import { dividirEmParcelas, emitirCobranca, sincronizarCobrancas } from "../src/lib/cobrancas";
import {
  assinaturasDeFora,
  cicloDoAsaas,
  criarMensalidade,
  encerrarMensalidade,
  sincronizarMensalidade,
  trazerDoAsaas,
} from "../src/lib/mensalidades";

const d = process.env.DATABASE_URL ? describe : describe.skip;

type Pag = Record<string, unknown>;
let servidor: Server;
let proximo = 0;
let clientes: Record<string, Pag> = {};
let assinaturas: Record<string, Pag> = {};
let pagamentos: Record<string, Pag> = {};

const dia = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

function novoPagamento(extra: Pag): Pag {
  const id = `pay_${(proximo += 1)}`;
  pagamentos[id] = { id, status: "PENDING", invoiceUrl: `https://asaas.exemplo/i/${id}`, deleted: false, ...extra };
  return pagamentos[id];
}

function responder(metodo: string, caminho: string, busca: URLSearchParams, corpo: Pag | null): { status: number; json: unknown } {
  if (metodo === "POST" && caminho === "/customers") {
    const id = `cus_${(proximo += 1)}`;
    clientes[id] = { id, name: corpo?.name, cpfCnpj: corpo?.cpfCnpj, deleted: false };
    return { status: 200, json: clientes[id] };
  }
  if (metodo === "GET" && caminho.startsWith("/customers/")) {
    const c = clientes[caminho.split("/")[2]];
    return c ? { status: 200, json: c } : { status: 404, json: { errors: [{ description: "não encontrado" }] } };
  }
  if (metodo === "POST" && caminho === "/subscriptions") {
    const id = `sub_${(proximo += 1)}`;
    assinaturas[id] = { id, status: "ACTIVE", deleted: false, ...corpo };
    // O Asaas gera a primeira cobranca na hora.
    novoPagamento({ subscription: id, value: corpo?.value, dueDate: corpo?.nextDueDate, billingType: corpo?.billingType, description: corpo?.description });
    return { status: 200, json: assinaturas[id] };
  }
  if (metodo === "GET" && caminho === "/subscriptions") {
    const lista = Object.values(assinaturas).filter(
      (a) => (!busca.get("customer") || a.customer === busca.get("customer")) && (!busca.get("status") || a.status === busca.get("status")),
    );
    return { status: 200, json: { data: lista, hasMore: false } };
  }
  const sub = caminho.match(/^\/subscriptions\/([^/]+)(\/payments)?$/);
  if (sub) {
    const a = assinaturas[sub[1]];
    if (!a) return { status: 404, json: { errors: [{ description: "não encontrada" }] } };
    if (sub[2]) return { status: 200, json: { data: Object.values(pagamentos).filter((p) => p.subscription === a.id), hasMore: false } };
    if (metodo === "PUT") Object.assign(a, corpo);
    if (metodo === "DELETE") {
      a.deleted = true;
      for (const p of Object.values(pagamentos)) if (p.subscription === a.id && p.status !== "RECEIVED") p.deleted = true;
    }
    return { status: 200, json: a };
  }
  if (metodo === "POST" && caminho === "/payments") {
    const n = Number(corpo?.installmentCount ?? 1);
    if (n > 1) {
      const parcelamento = `ins_${(proximo += 1)}`;
      const total = Number(corpo?.totalValue ?? Number(corpo?.installmentValue) * n);
      const cada = Math.floor((total / n) * 100) / 100;
      const criadas = Array.from({ length: n }, (_, i) =>
        novoPagamento({
          installment: parcelamento,
          installmentNumber: i + 1,
          value: i === n - 1 ? Math.round((total - cada * (n - 1)) * 100) / 100 : cada,
          dueDate: corpo?.dueDate,
          externalReference: corpo?.externalReference,
        }),
      );
      return { status: 200, json: criadas[0] };
    }
    return { status: 200, json: novoPagamento({ value: corpo?.value, dueDate: corpo?.dueDate, externalReference: corpo?.externalReference }) };
  }
  if (metodo === "GET" && caminho === "/payments") {
    const lista = Object.values(pagamentos).filter((p) => !busca.get("installment") || p.installment === busca.get("installment"));
    return { status: 200, json: { data: lista, hasMore: false } };
  }
  if (metodo === "GET" && caminho.startsWith("/payments/")) {
    const p = pagamentos[caminho.split("/")[2]];
    return p ? { status: 200, json: p } : { status: 404, json: { errors: [{ description: "não encontrada" }] } };
  }
  return { status: 404, json: { errors: [{ description: `rota desconhecida ${metodo} ${caminho}` }] } };
}

let esc = "";
let cliente = "";
let outroCliente = "";
const marca = Date.now();

d("mensalidades e fatura parcelada", () => {
  beforeAll(async () => {
    process.env.SEGREDO_CHAVE ??= Buffer.alloc(32, 5).toString("base64");
    servidor = createServer((req, res) => {
      let cru = "";
      req.on("data", (p) => (cru += p));
      req.on("end", () => {
        const url = new URL(req.url ?? "/", "http://local");
        const r = responder(req.method ?? "GET", url.pathname, url.searchParams, cru ? JSON.parse(cru) : null);
        res.writeHead(r.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(r.json));
      });
    });
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    process.env.ASAAS_BASE_URL = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;

    esc = (await prismaPlataforma().escritorio.create({ data: { slug: `mens-${marca}`, nome: "Banca das Mensalidades" } })).id;
    await comEscritorio(esc, async (db) => {
      await db.moduloContratado.create({ data: semEscritorio({ modulo: "COBRANCAS", ativo: true }) });
      await db.moduloContratado.create({ data: semEscritorio({ modulo: "FINANCEIRO", ativo: true }) });
      cliente = (await db.cliente.create({ data: semEscritorio({ nome: "Fazenda Boa Vista", documento: "529.982.247-25" }) })).id;
      outroCliente = (await db.cliente.create({ data: semEscritorio({ nome: "Laiene Souza", documento: "390.533.447-05" }) })).id;
    });
    await salvarIntegracao(esc, "ASAAS", { chave: "chave" }, "OK");
  });

  afterAll(async () => {
    await new Promise<void>((ok) => servidor.close(() => ok()));
    if (esc) await prismaPlataforma().escritorio.delete({ where: { id: esc } }).catch(() => {});
  });

  beforeEach(() => {
    clientes = {};
    assinaturas = {};
    pagamentos = {};
  });

  const cobrancasDe = (mensalidadeId: string) =>
    comEscritorio(esc, (db) => db.cobranca.findMany({ where: { mensalidadeId }, orderBy: { vencimento: "asc" } }));

  it("cria a assinatura no Asaas e já traz a primeira cobrança; sincronizar de novo não duplica", async () => {
    await comEscritorio(esc, (db) => db.cliente.updateMany({ where: { id: cliente }, data: { idNoAsaas: null } }));
    const m = await criarMensalidade(esc, {
      clienteId: cliente,
      descricao: "Assessoria mensal",
      valorCentavos: 150_000,
      ciclo: "MENSAL",
      forma: "BOLETO",
      primeiroVencimento: new Date(`${dia(5)}T12:00:00Z`),
    });
    expect(Object.values(assinaturas)[0]).toMatchObject({ cycle: "MONTHLY", value: 1500, billingType: "BOLETO" });
    expect(await cobrancasDe(m.id)).toHaveLength(1);
    await sincronizarMensalidade(esc, m.id);
    expect(await cobrancasDe(m.id)).toHaveLength(1);
  });

  it("recusa criar quando o cliente já tem assinatura ativa no painel do Asaas", async () => {
    await comEscritorio(esc, (db) => db.cliente.updateMany({ where: { id: cliente }, data: { idNoAsaas: "cus_painel" } }));
    clientes.cus_painel = { id: "cus_painel", name: "Fazenda Boa Vista", cpfCnpj: "52998224725", deleted: false };
    assinaturas.sub_painel = { id: "sub_painel", customer: "cus_painel", status: "ACTIVE", value: 900, cycle: "MONTHLY", deleted: false };
    await expect(
      criarMensalidade(esc, {
        clienteId: cliente,
        descricao: "Outra",
        valorCentavos: 90_000,
        ciclo: "MENSAL",
        forma: "PIX",
        primeiroVencimento: new Date(`${dia(5)}T12:00:00Z`),
      }),
    ).rejects.toThrow(/Trazer do Asaas/);
  });

  it("trazer do Asaas: reconhece pelo CPF, semanal vira semanal, e o histórico pago entra sem receita", async () => {
    clientes.cus_laiene = { id: "cus_laiene", name: "Laiene S.", cpfCnpj: "39053344705", deleted: false };
    assinaturas.sub_laiene = { id: "sub_laiene", customer: "cus_laiene", status: "ACTIVE", value: 250, cycle: "WEEKLY", nextDueDate: dia(3), description: "Semanal", deleted: false };
    novoPagamento({ subscription: "sub_laiene", value: 250, dueDate: dia(-14), status: "RECEIVED", paymentDate: dia(-14) });
    novoPagamento({ subscription: "sub_laiene", value: 250, dueDate: dia(-7), status: "RECEIVED", paymentDate: dia(-7) });
    const aberta = novoPagamento({ subscription: "sub_laiene", value: 250, dueDate: dia(3) });

    const lista = await assinaturasDeFora(esc);
    const deLaiene = lista.find((a) => a.idNoProvedor === "sub_laiene")!;
    expect(deLaiene.clienteSugerido?.id).toBe(outroCliente);
    expect(deLaiene.ciclo).toBe("SEMANAL");

    const m = await trazerDoAsaas(esc, "sub_laiene", outroCliente);
    expect(m).toMatchObject({ ciclo: "SEMANAL", importada: true, valorCentavos: 25_000 });
    const cobrancas = await cobrancasDe(m.id);
    expect(cobrancas.filter((c) => c.status === "PAGA").every((c) => c.semBaixa && !c.lancamentoId)).toBe(true);
    const lancamentos = await comEscritorio(esc, (db) =>
      db.lancamento.count({ where: { cobrancaId: { in: cobrancas.map((c) => c.id) } } }),
    );
    expect(lancamentos).toBe(0);

    // Pago DEPOIS de estar aqui: a sincronizacao de sempre da a baixa.
    pagamentos[aberta.id as string].status = "RECEIVED";
    pagamentos[aberta.id as string].paymentDate = dia(0);
    await sincronizarCobrancas(esc);
    const agora = await comEscritorio(esc, (db) => db.cobranca.findFirst({ where: { idNoProvedor: aberta.id as string } }));
    expect(agora?.status).toBe("PAGA");
    expect(agora?.semBaixa).toBe(false);
    expect(agora?.lancamentoId).not.toBeNull();

    expect(await assinaturasDeFora(esc)).toEqual([]);
  });

  it("ciclo desconhecido do Asaas não vira 'todo mês' em silêncio", async () => {
    expect(cicloDoAsaas("BIWEEKLY")).toBe("QUINZENAL");
    expect(cicloDoAsaas("FORTNIGHTLY")).toBeNull();
    assinaturas.sub_x = { id: "sub_x", customer: "cus_x", status: "ACTIVE", value: 100, cycle: "FORTNIGHTLY", deleted: false };
    await expect(trazerDoAsaas(esc, "sub_x", cliente)).rejects.toThrow(/não é conhecido/);
  });

  it("encerrar: os boletos em aberto apagados no Asaas viram cancelados aqui; o pago fica", async () => {
    await comEscritorio(esc, (db) => db.cliente.updateMany({ where: { id: cliente }, data: { idNoAsaas: null } }));
    const m = await criarMensalidade(esc, {
      clienteId: cliente,
      descricao: "Para encerrar",
      valorCentavos: 50_000,
      ciclo: "TRIMESTRAL",
      forma: "PIX",
      primeiroVencimento: new Date(`${dia(2)}T12:00:00Z`),
    });
    const sub = Object.values(assinaturas).find((a) => a.description === "Para encerrar")!;
    expect(sub.cycle).toBe("QUARTERLY");
    novoPagamento({ subscription: sub.id, value: 500, dueDate: dia(-90), status: "RECEIVED", paymentDate: dia(-90) });
    await sincronizarMensalidade(esc, m.id);
    await encerrarMensalidade(esc, m.id, "cliente saiu");
    const cobrancas = await cobrancasDe(m.id);
    expect(cobrancas.map((c) => c.status).sort()).toEqual(["CANCELADA", "PAGA"]);
    const depois = await comEscritorio(esc, (db) => db.mensalidade.findFirst({ where: { id: m.id } }));
    expect(depois).toMatchObject({ status: "ENCERRADA", motivoEncerramento: "cliente saiu" });
  });

  it("fatura parcelada: uma linha por parcela, com número, total e a sobra na última", async () => {
    expect(dividirEmParcelas(100_000, 3)).toEqual([33_333, 33_333, 33_334]);
    expect(dividirEmParcelas(20_000, 3, "PARCELA")).toEqual([20_000, 20_000, 20_000]);

    const { id } = await emitirCobranca(esc, {
      clienteId: cliente,
      descricao: "Honorários",
      valorCentavos: 100_000,
      vencimento: new Date(`${dia(10)}T12:00:00Z`),
      forma: "BOLETO",
      parcelas: 3,
    });
    const primeira = await comEscritorio(esc, (db) => db.cobranca.findFirstOrThrow({ where: { id } }));
    const todas = await comEscritorio(esc, (db) =>
      db.cobranca.findMany({ where: { parcelamentoId: primeira.parcelamentoId! }, orderBy: { parcelaNumero: "asc" } }),
    );
    expect(todas.map((c) => [c.parcelaNumero, c.parcelaTotal, c.valorCentavos])).toEqual([
      [1, 3, 33_333],
      [2, 3, 33_333],
      [3, 3, 33_334],
    ]);
    expect(todas[1].descricao).toBe("Honorários — parcela 2/3");
    await expect(
      emitirCobranca(esc, { clienteId: cliente, descricao: "x", valorCentavos: 1_000, vencimento: new Date(`${dia(10)}T12:00:00Z`), forma: "PIX", parcelas: 3 }),
    ).rejects.toThrow(/R\$ 5,00/);
  });
});
