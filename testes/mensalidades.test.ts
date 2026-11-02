// Mensalidade (assinatura do Asaas) e fatura parcelada. O Asaas e um HTTP
// local com estado: assinaturas, cobrancas e parcelamentos. O que se prova e
// o comportamento do modulo — espelhar sem duplicar, cancelar o que o Asaas
// apagou, historico pago sem receita repetida, recusa de assinatura em dobro.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { salvarIntegracao } from "../src/lib/integracao";
import { dividirEmParcelas, emitirCobranca, sincronizarCobrancas } from "../src/lib/cobrancas";
import { desfazerBaixa, registrarBaixaManual, reemitirBoleto } from "../src/lib/baixas-de-cobranca";
import { conferirComOAsaas, trazerCobrancasDoAsaas } from "../src/lib/conferencia-do-asaas";
import { fecharMes, fecharMesesPendentes, fechamentosRecentes } from "../src/lib/fechamento-de-caixa";
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
let asaasRecusaRecebimento = false;

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
  const acaoNoPagamento = caminho.match(/^\/payments\/([^/]+)\/(receiveInCash|undoReceivedInCash|identificationField)$/);
  if (acaoNoPagamento) {
    const p = pagamentos[acaoNoPagamento[1]];
    if (!p) return { status: 404, json: { errors: [{ description: "não encontrada" }] } };
    if (acaoNoPagamento[2] === "receiveInCash" && asaasRecusaRecebimento) return { status: 503, json: {} };
    if (acaoNoPagamento[2] === "receiveInCash") Object.assign(p, { status: "RECEIVED_IN_CASH", paymentDate: corpo?.paymentDate });
    if (acaoNoPagamento[2] === "undoReceivedInCash") Object.assign(p, { status: "PENDING", paymentDate: null });
    if (acaoNoPagamento[2] === "identificationField") return { status: 200, json: { identificationField: "23793.38128 60000.000003 00000.000400 1 1234" } };
    return { status: 200, json: p };
  }
  if (metodo === "PUT" && caminho.startsWith("/payments/")) {
    const p = pagamentos[caminho.split("/")[2]];
    Object.assign(p, corpo, { bankSlipUrl: `https://asaas.exemplo/b/${p.id}?v=2` });
    return { status: 200, json: p };
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

  it("baixa manual: parcial, depois o resto quita e avisa o Asaas; desfazer volta tudo", async () => {
    const { id } = await emitirCobranca(esc, {
      clienteId: cliente,
      descricao: "Consulta",
      valorCentavos: 100_000,
      vencimento: new Date(`${dia(10)}T12:00:00Z`),
      forma: "BOLETO",
    });
    const cob = () => comEscritorio(esc, (db) => db.cobranca.findFirstOrThrow({ where: { id } }));
    const ontem = new Date(`${dia(-1)}T12:00:00Z`);

    await expect(registrarBaixaManual(esc, id, { valorCentavos: 120_000, data: ontem }, "Helena")).rejects.toThrow(/Falta receber/);
    const parcial = await registrarBaixaManual(
      esc,
      id,
      { valorCentavos: 40_000, data: ontem, observacao: "no balcão", forma: "DINHEIRO", recebidoPor: "Rafael Moura" },
      "Helena",
    );
    const gravada = await comEscritorio(esc, (db) => db.baixaDeCobranca.findFirstOrThrow({ where: { cobrancaId: id } }));
    expect(gravada).toMatchObject({ forma: "DINHEIRO", recebidoPor: "Rafael Moura", registradoPor: "Helena" });
    expect(parcial.quitou).toBe(false);
    expect(await cob()).toMatchObject({ status: "PARCIAL", valorPagoCentavos: 40_000 });

    // Para o Asaas o boleto segue aberto: a sincronizacao nao apaga o parcial.
    await sincronizarCobrancas(esc);
    expect((await cob()).status).toBe("PARCIAL");

    const resto = await registrarBaixaManual(esc, id, { valorCentavos: 60_000, data: ontem }, "Helena");
    expect(resto.quitou).toBe(true);
    const quitada = await cob();
    expect(quitada.status).toBe("PAGA");
    expect(pagamentos[quitada.idNoProvedor].status).toBe("RECEIVED_IN_CASH");
    const receitas = await comEscritorio(esc, (db) =>
      db.lancamento.findMany({ where: { descricao: { contains: "Consulta" }, tipo: "RECEITA" }, select: { valorCentavos: true } }),
    );
    expect(receitas.map((r) => r.valorCentavos).sort((a, b) => a - b)).toEqual([40_000, 60_000]);

    const baixas = await comEscritorio(esc, (db) => db.baixaDeCobranca.findMany({ where: { cobrancaId: id }, orderBy: { criadoEm: "asc" } }));
    await desfazerBaixa(esc, id, baixas[1].id);
    expect(await cob()).toMatchObject({ status: "PARCIAL", valorPagoCentavos: 40_000 });
    expect(pagamentos[quitada.idNoProvedor].status).toBe("PENDING");
    await desfazerBaixa(esc, id, baixas[0].id);
    expect((await cob()).status).toBe("ABERTA");
    expect(await comEscritorio(esc, (db) => db.lancamento.count({ where: { descricao: { contains: "Consulta" }, tipo: "RECEITA" } }))).toBe(0);
  });

  it("Asaas fora do ar na quitação: a baixa fica (o dinheiro entrou) e volta o aviso do boleto aberto", async () => {
    const { id } = await emitirCobranca(esc, {
      clienteId: cliente,
      descricao: "Asaas fora",
      valorCentavos: 30_000,
      vencimento: new Date(`${dia(10)}T12:00:00Z`),
      forma: "BOLETO",
    });
    asaasRecusaRecebimento = true;
    try {
      const r = await registrarBaixaManual(esc, id, { valorCentavos: 30_000, data: new Date(`${dia(-1)}T12:00:00Z`), forma: "PIX" }, "Helena");
      expect(r.quitou).toBe(true);
      expect(r.avisoDoAsaas).toMatch(/boleto ficou aberto no Asaas/);
      const c = await comEscritorio(esc, (db) => db.cobranca.findFirstOrThrow({ where: { id } }));
      expect(c.status).toBe("PAGA");
      const b = await comEscritorio(esc, (db) => db.baixaDeCobranca.findFirstOrThrow({ where: { cobrancaId: id } }));
      expect(b.noProvedor).toBe(false);
    } finally {
      asaasRecusaRecebimento = false;
    }
  });

  it("parcial por aqui e boleto pago inteiro depois: a receita não conta o parcial duas vezes", async () => {
    const { id } = await emitirCobranca(esc, {
      clienteId: cliente,
      descricao: "Parecer",
      valorCentavos: 80_000,
      vencimento: new Date(`${dia(10)}T12:00:00Z`),
      forma: "BOLETO",
    });
    await registrarBaixaManual(esc, id, { valorCentavos: 30_000, data: new Date(`${dia(-1)}T12:00:00Z`) }, "Helena");
    const c = await comEscritorio(esc, (db) => db.cobranca.findFirstOrThrow({ where: { id } }));
    Object.assign(pagamentos[c.idNoProvedor], { status: "RECEIVED", paymentDate: dia(0) });
    await sincronizarCobrancas(esc);
    const receitas = await comEscritorio(esc, (db) =>
      db.lancamento.findMany({ where: { descricao: { contains: "Parecer" }, tipo: "RECEITA" }, select: { valorCentavos: true } }),
    );
    expect(receitas.reduce((t, r) => t + r.valorCentavos, 0)).toBe(80_000);
  });

  it("reemitir boleto: vencimento novo no Asaas, link e linha digitável de volta, sem avisar o cliente", async () => {
    const { id } = await emitirCobranca(esc, {
      clienteId: cliente,
      descricao: "Boleto vencido",
      valorCentavos: 50_000,
      vencimento: new Date(`${dia(1)}T12:00:00Z`),
      forma: "BOLETO",
    });
    const r = await reemitirBoleto(esc, id, { vencimento: new Date(`${dia(15)}T12:00:00Z`) });
    expect(r.linhaDigitavel).toMatch(/^23793/);
    expect(r.linkBoleto).toContain("v=2");
    const c = await comEscritorio(esc, (db) => db.cobranca.findFirstOrThrow({ where: { id } }));
    expect(c.vencimento.toISOString().slice(0, 10)).toBe(dia(15));
    expect(pagamentos[c.idNoProvedor].dueDate).toBe(dia(15));
  });

  it("conferência com o Asaas: traz o que falta, aponta o que diverge e o pagador sem cadastro", async () => {
    const { id } = await emitirCobranca(esc, {
      clienteId: cliente,
      descricao: "Emitida aqui",
      valorCentavos: 70_000,
      vencimento: new Date(`${dia(5)}T12:00:00Z`),
      forma: "PIX",
    });
    const aqui = await comEscritorio(esc, (db) => db.cobranca.findFirstOrThrow({ where: { id } }));
    // Alguem mudou o valor direto no painel do Asaas.
    pagamentos[aqui.idNoProvedor].value = 750;
    const idDoCliente = (await comEscritorio(esc, (db) => db.cliente.findFirstOrThrow({ where: { id: cliente } }))).idNoAsaas!;
    const doPainel = novoPagamento({ customer: idDoCliente, value: 400, dueDate: dia(-20), status: "RECEIVED", paymentDate: dia(-18), description: "Criada no painel", billingType: "PIX" });
    clientes.cus_estranho = { id: "cus_estranho", name: "Pagador Estranho", cpfCnpj: "11444777000161", deleted: false };
    novoPagamento({ customer: "cus_estranho", value: 100, dueDate: dia(3) });

    const c = await conferirComOAsaas(esc);
    expect(c.deFora.map((d) => d.idNoProvedor)).toContain(doPainel.id);
    expect(c.divergentes.find((d) => d.cobrancaId === id)?.diferencas.join()).toMatch(/valor/);
    expect(c.semCliente.map((x) => x.pagador)).toContain("Pagador Estranho");

    const r = await trazerCobrancasDoAsaas(esc, [doPainel.id as string], { lancarReceita: true });
    expect(r).toEqual({ trazidas: 1, recusadas: [] });
    const trazida = await comEscritorio(esc, (db) => db.cobranca.findFirstOrThrow({ where: { idNoProvedor: doPainel.id as string } }));
    expect(trazida).toMatchObject({ status: "PAGA", valorPagoCentavos: 40_000, semBaixa: false });
    expect(trazida.lancamentoId).not.toBeNull();
    // Trazer de novo nao duplica.
    expect((await trazerCobrancasDoAsaas(esc, [doPainel.id as string], { lancarReceita: true })).trazidas).toBe(0);
  });

  it("fechamento de caixa: foto do mês por forma e por quem recebeu; mudou depois, aparece; refazer conta", async () => {
    const agora = new Date("2026-11-15T15:00:00Z");
    const fecho = await prismaPlataforma().escritorio.create({ data: { slug: `fecho-${marca}`, nome: "Banca do Fechamento" } });
    try {
      await comEscritorio(fecho.id, async (db) => {
        const c = await db.cliente.create({ data: semEscritorio({ nome: "Pagante" }) });
        const cob = await db.cobranca.create({
          data: semEscritorio({ clienteId: c.id, descricao: "x", valorCentavos: 30_000, vencimento: new Date("2026-09-10T12:00:00Z"), forma: "PIX", status: "PAGA", idNoProvedor: "manual-1" }),
        });
        const l1 = await db.lancamento.create({
          data: semEscritorio({ descricao: "Recebimento", tipo: "RECEITA", competencia: "2026-09", valorCentavos: 30_000, pagoEm: new Date("2026-09-12T15:00:00Z") }),
        });
        await db.baixaDeCobranca.create({
          data: semEscritorio({ cobrancaId: cob.id, valorCentavos: 30_000, data: new Date("2026-09-12T15:00:00Z"), forma: "DINHEIRO", recebidoPor: "Rafael", lancamentoId: l1.id }),
        });
        await db.lancamento.create({
          data: semEscritorio({ descricao: "Aluguel", tipo: "DESPESA", competencia: "2026-09", valorCentavos: 10_000, pagoEm: new Date("2026-09-05T15:00:00Z") }),
        });
      });
      const feitos = await fecharMesesPendentes(fecho.id, agora);
      expect(feitos).toEqual(["2026-10", "2026-09"]);
      let [out, set] = await fechamentosRecentes(fecho.id);
      expect(out.competencia).toBe("2026-10");
      expect(set.foto).toMatchObject({ receitaCentavos: 30_000, despesaCentavos: 10_000, porForma: { Dinheiro: 30_000 }, porQuemRecebeu: { Rafael: 30_000 } });
      expect(set.mudou).toBe(false);

      // Lancamento atrasado de setembro: a foto envelhece e a tela mostra.
      await comEscritorio(fecho.id, (db) =>
        db.lancamento.create({ data: semEscritorio({ descricao: "Atrasado", tipo: "RECEITA", competencia: "2026-09", valorCentavos: 5_000, pagoEm: new Date("2026-09-20T15:00:00Z") }) }),
      );
      [out, set] = await fechamentosRecentes(fecho.id);
      expect(set.mudou).toBe(true);
      const refeito = await fecharMes(fecho.id, "2026-09", "Helena", agora);
      expect(refeito).toMatchObject({ receitaCentavos: 35_000, refeito: 1, refeitoPor: "Helena" });

      await expect(fecharMes(fecho.id, "2026-11", "Helena", agora)).rejects.toThrow(/não terminou/);
      // A rotina nao refaz o que ja foi fechado.
      expect(await fecharMesesPendentes(fecho.id, agora)).toEqual([]);
    } finally {
      await prismaPlataforma().escritorio.delete({ where: { id: fecho.id } }).catch(() => {});
    }
  });
});
