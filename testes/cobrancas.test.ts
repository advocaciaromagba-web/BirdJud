// Modulo de cobrancas: o escritorio cobrando o cliente dele pela conta Asaas
// dele. O Asaas e servido por um HTTP local — o que se prova aqui e o
// comportamento do modulo (ordem de gravacao, baixa unica, isolamento,
// recusa clara), nao o formato da API de terceiro.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  comEscritorio,
  prismaPlataforma,
  semEscritorio,
} from "../src/lib/prisma";
import { salvarIntegracao } from "../src/lib/integracao";
import { consumoDoMes } from "../src/lib/consumo";
import {
  cancelarCobranca,
  ClienteSemDocumento,
  comoDia,
  emitirCobranca,
  emReaisDecimal,
  FalhaNoAsaas,
  paraCentavosDoAsaas,
  PedidoInvalido,
  SemContaDeCobranca,
  sincronizarCobrancas,
  statusNosso,
} from "../src/lib/cobrancas";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;
const DIA = 24 * 60 * 60 * 1000;

describe("conversoes do modulo", () => {
  it("centavos viram reais com duas casas, e voltam inteiros", () => {
    expect(emReaisDecimal(1234)).toBe(12.34);
    expect(emReaisDecimal(100)).toBe(1);
    expect(emReaisDecimal(1)).toBe(0.01);
    expect(paraCentavosDoAsaas(12.34)).toBe(1234);
    expect(paraCentavosDoAsaas(0.07)).toBe(7);
  });

  it("valor que nao e numero nao vira centavos", () => {
    expect(paraCentavosDoAsaas("12,34")).toBeNull();
    expect(paraCentavosDoAsaas(undefined)).toBeNull();
    expect(paraCentavosDoAsaas(Number.NaN)).toBeNull();
  });

  it("vencimento sai como dia, sem hora", () => {
    expect(comoDia(new Date("2026-10-05T23:30:00Z"))).toBe("2026-10-05");
  });

  it("traduz os status do Asaas que conhecemos", () => {
    expect(statusNosso("RECEIVED")).toBe("PAGA");
    expect(statusNosso("CONFIRMED")).toBe("PAGA");
    expect(statusNosso("OVERDUE")).toBe("VENCIDA");
    expect(statusNosso("REFUNDED")).toBe("ESTORNADA");
    expect(statusNosso("PENDING")).toBe("ABERTA");
  });

  it("status que nao conhecemos nao vira status nosso", () => {
    // De proposito: estado novo do Asaas cair em ABERTA por descuido seria
    // pior que ficar parado e aparecer na conferencia.
    expect(statusNosso("ALGO_NOVO_DO_ASAAS")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Asaas servido localmente
// ---------------------------------------------------------------------------

type Chamada = {
  metodo: string;
  caminho: string;
  corpo: Record<string, unknown> | null;
};

let servidor: Server;
let chamadas: Chamada[] = [];
let pagamentos: Record<string, Record<string, unknown>> = {};
let responder: (c: Chamada) => { status: number; json: unknown } = () => ({
  status: 200,
  json: {},
});

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let cru = "";
    req.on("data", (pedaco) => {
      cru += pedaco;
    });
    req.on("end", () => {
      const chamada: Chamada = {
        metodo: req.method ?? "GET",
        caminho: new URL(req.url ?? "/", "http://local").pathname,
        corpo: cru ? (JSON.parse(cru) as Record<string, unknown>) : null,
      };
      chamadas.push(chamada);
      const resposta = responder(chamada);
      res.writeHead(resposta.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(resposta.json));
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  const porta = (servidor.address() as { port: number }).port;
  process.env.ASAAS_BASE_URL = `http://127.0.0.1:${porta}`;
});

afterAll(async () => {
  await new Promise<void>((ok) => servidor.close(() => ok()));
  delete process.env.ASAAS_BASE_URL;
});

// Contador global de proposito: id de cobranca e unico por escritorio no
// banco, entao reiniciar a cada teste faria o segundo teste colidir com o
// primeiro — e a falha pareceria do modulo, nao do teste.
let proximo = 0;

/** Asaas de comportamento normal: cria cliente, cria e devolve pagamento. */
function asaasNormal(): (c: Chamada) => { status: number; json: unknown } {
  return (chamada) => {
    if (chamada.metodo === "POST" && chamada.caminho === "/customers") {
      return { status: 200, json: { id: `cus_${(proximo += 1)}` } };
    }
    if (chamada.metodo === "POST" && chamada.caminho === "/payments") {
      const id = `pay_${(proximo += 1)}`;
      pagamentos[id] = {
        id,
        status: "PENDING",
        value: chamada.corpo?.value,
        invoiceUrl: `https://asaas.exemplo/i/${id}`,
        bankSlipUrl: `https://asaas.exemplo/b/${id}`,
      };
      return { status: 200, json: pagamentos[id] };
    }
    if (chamada.metodo === "GET" && chamada.caminho.startsWith("/payments/")) {
      const id = chamada.caminho.split("/").pop() ?? "";
      const pagamento = pagamentos[id];
      return pagamento
        ? { status: 200, json: pagamento }
        : {
            status: 404,
            json: { errors: [{ description: "Cobranca nao encontrada." }] },
          };
    }
    if (
      chamada.metodo === "DELETE" &&
      chamada.caminho.startsWith("/payments/")
    ) {
      const id = chamada.caminho.split("/").pop() ?? "";
      if (pagamentos[id]) pagamentos[id].status = "DELETED";
      return { status: 200, json: { deleted: true } };
    }
    return {
      status: 404,
      json: { errors: [{ description: "rota desconhecida" }] },
    };
  };
}

const marca = Date.now();
let alfa = "";
let beta = "";
let clienteAlfa = "";
let clienteSemDocumento = "";
let clienteBeta = "";

d("cobrancas por escritorio", () => {
  beforeAll(async () => {
    // A chave de integracao e guardada cifrada, entao o teste precisa de uma
    // chave — no CI nao ha .env.
    process.env.SEGREDO_CHAVE ??= Buffer.alloc(32, 5).toString("base64");

    const a = await prismaPlataforma().escritorio.create({
      data: { slug: `cob-a-${marca}`, nome: "Alfa Cobrancas" },
    });
    const b = await prismaPlataforma().escritorio.create({
      data: { slug: `cob-b-${marca}`, nome: "Beta Cobrancas" },
    });
    alfa = a.id;
    beta = b.id;

    await comEscritorio(alfa, async (db) => {
      await db.moduloContratado.create({
        data: semEscritorio({ modulo: "COBRANCAS", ativo: true }),
      });
      await db.moduloContratado.create({
        data: semEscritorio({ modulo: "FINANCEIRO", ativo: true }),
      });
      const cliente = await db.cliente.create({
        data: semEscritorio({
          nome: "Cliente com CPF",
          documento: "529.982.247-25",
        }),
      });
      const sem = await db.cliente.create({
        data: semEscritorio({ nome: "Cliente sem CPF" }),
      });
      clienteAlfa = cliente.id;
      clienteSemDocumento = sem.id;
    });

    // Beta contrata cobrancas mas NAO contrata financeiro: a baixa deve marcar
    // a cobranca e nao criar lancamento nenhum.
    await comEscritorio(beta, async (db) => {
      await db.moduloContratado.create({
        data: semEscritorio({ modulo: "COBRANCAS", ativo: true }),
      });
      const cliente = await db.cliente.create({
        data: semEscritorio({
          nome: "Cliente do Beta",
          documento: "11222333000181",
        }),
      });
      clienteBeta = cliente.id;
    });

    await salvarIntegracao(alfa, "ASAAS", { chave: "chave-do-alfa" }, "OK");
    await salvarIntegracao(beta, "ASAAS", { chave: "chave-do-beta" }, "OK");
  });

  afterAll(async () => {
    for (const id of [alfa, beta]) {
      if (id)
        await prismaPlataforma()
          .escritorio.delete({ where: { id } })
          .catch(() => {});
    }
    await prismaPlataforma().$disconnect();
  });

  beforeEach(() => {
    chamadas = [];
    pagamentos = {};
    responder = asaasNormal();
  });

  const amanha = () => new Date(Date.now() + DIA);

  it("emite no Asaas e guarda o espelho", async () => {
    const { id } = await emitirCobranca(alfa, {
      clienteId: clienteAlfa,
      descricao: "Honorarios contratuais",
      valorCentavos: 150_000,
      vencimento: amanha(),
      forma: "PIX",
    });

    const pedido = chamadas.find((c) => c.caminho === "/payments");
    expect(pedido?.corpo?.billingType).toBe("PIX");
    expect(pedido?.corpo?.value).toBe(1500); // reais, nao centavos

    const cobranca = await comEscritorio(alfa, (db) =>
      db.cobranca.findUnique({ where: { id } }),
    );
    expect(cobranca?.status).toBe("ABERTA");
    expect(cobranca?.valorCentavos).toBe(150_000);
    expect(cobranca?.linkPagamento).toContain("asaas.exemplo");
    expect(cobranca?.idNoAsaas).toMatch(/^pay_/);
  });

  it("mede uma cobranca emitida no consumo do mes", async () => {
    const antes = (await consumoDoMes(alfa)).find(
      (l) => l.metrica === "COBRANCA_EMITIDA",
    );
    await emitirCobranca(alfa, {
      clienteId: clienteAlfa,
      descricao: "Medicao",
      valorCentavos: 10_000,
      vencimento: amanha(),
      forma: "BOLETO",
    });
    const depois = (await consumoDoMes(alfa)).find(
      (l) => l.metrica === "COBRANCA_EMITIDA",
    );
    expect(depois?.quantidade).toBe((antes?.quantidade ?? 0) + 1);
  });

  it("cadastra o cliente no Asaas uma vez so", async () => {
    await emitirCobranca(alfa, {
      clienteId: clienteAlfa,
      descricao: "Primeira",
      valorCentavos: 5_000,
      vencimento: amanha(),
      forma: "BOLETO",
    });
    const criacoes = chamadas.filter((c) => c.caminho === "/customers").length;

    chamadas = [];
    await emitirCobranca(alfa, {
      clienteId: clienteAlfa,
      descricao: "Segunda",
      valorCentavos: 5_000,
      vencimento: amanha(),
      forma: "BOLETO",
    });
    expect(criacoes).toBeLessThanOrEqual(1);
    expect(chamadas.filter((c) => c.caminho === "/customers")).toHaveLength(0);
  });

  it("cliente sem CPF/CNPJ e recusado antes de virar cobranca", async () => {
    await expect(
      emitirCobranca(alfa, {
        clienteId: clienteSemDocumento,
        descricao: "Sem documento",
        valorCentavos: 5_000,
        vencimento: amanha(),
        forma: "BOLETO",
      }),
    ).rejects.toBeInstanceOf(ClienteSemDocumento);

    expect(chamadas.filter((c) => c.caminho === "/payments")).toHaveLength(0);
  });

  it("valor zerado e vencimento no passado nem chegam ao Asaas", async () => {
    await expect(
      emitirCobranca(alfa, {
        clienteId: clienteAlfa,
        descricao: "Zero",
        valorCentavos: 0,
        vencimento: amanha(),
        forma: "BOLETO",
      }),
    ).rejects.toBeInstanceOf(PedidoInvalido);

    await expect(
      emitirCobranca(alfa, {
        clienteId: clienteAlfa,
        descricao: "Ontem",
        valorCentavos: 1_000,
        vencimento: new Date(Date.now() - 2 * DIA),
        forma: "BOLETO",
      }),
    ).rejects.toBeInstanceOf(PedidoInvalido);

    expect(chamadas).toHaveLength(0);
  });

  it("falha do Asaas nao deixa cobranca gravada", async () => {
    const normal = asaasNormal();
    responder = (chamada) =>
      chamada.caminho === "/payments"
        ? {
            status: 400,
            json: { errors: [{ description: "Valor acima do permitido." }] },
          }
        : normal(chamada);

    const antes = await comEscritorio(alfa, (db) => db.cobranca.count());
    await expect(
      emitirCobranca(alfa, {
        clienteId: clienteAlfa,
        descricao: "Que falha",
        valorCentavos: 900_000_00,
        vencimento: amanha(),
        forma: "BOLETO",
      }),
    ).rejects.toThrow(/Valor acima do permitido/);

    const depois = await comEscritorio(alfa, (db) => db.cobranca.count());
    expect(depois).toBe(antes);
  });

  it("escritorio sem conta conectada recebe recusa propria", async () => {
    const semConta = await prismaPlataforma().escritorio.create({
      data: { slug: `cob-c-${marca}`, nome: "Sem conta" },
    });
    try {
      const cliente = await comEscritorio(semConta.id, (db) =>
        db.cliente.create({
          data: semEscritorio({ nome: "Alguem", documento: "52998224725" }),
        }),
      );
      await expect(
        emitirCobranca(semConta.id, {
          clienteId: cliente.id,
          descricao: "Sem conta",
          valorCentavos: 1_000,
          vencimento: amanha(),
          forma: "BOLETO",
        }),
      ).rejects.toBeInstanceOf(SemContaDeCobranca);
      expect(chamadas).toHaveLength(0);
    } finally {
      await prismaPlataforma().escritorio.delete({
        where: { id: semConta.id },
      });
    }
  });

  it("pagamento vira baixa, e a baixa nao se repete", async () => {
    const { id } = await emitirCobranca(alfa, {
      clienteId: clienteAlfa,
      descricao: "Honorarios de setembro",
      valorCentavos: 80_000,
      vencimento: amanha(),
      forma: "PIX",
    });
    const cobranca = await comEscritorio(alfa, (db) =>
      db.cobranca.findUnique({ where: { id } }),
    );
    pagamentos[cobranca!.idNoAsaas] = {
      ...pagamentos[cobranca!.idNoAsaas],
      status: "RECEIVED",
      paymentDate: "2026-09-18",
      value: 800,
    };

    const lancamentosAntes = await comEscritorio(alfa, (db) =>
      db.lancamento.count(),
    );
    const primeira = await sincronizarCobrancas(alfa);
    expect(primeira.pagas).toBe(1);

    const depois = await comEscritorio(alfa, (db) =>
      db.cobranca.findUnique({ where: { id } }),
    );
    expect(depois?.status).toBe("PAGA");
    expect(depois?.valorPagoCentavos).toBe(80_000);
    expect(depois?.pagoEm).not.toBeNull();
    expect(depois?.lancamentoId).not.toBeNull();

    const segunda = await sincronizarCobrancas(alfa);
    expect(segunda.pagas).toBe(0);
    const lancamentosDepois = await comEscritorio(alfa, (db) =>
      db.lancamento.count(),
    );
    expect(lancamentosDepois).toBe(lancamentosAntes + 1);

    const lancamento = await comEscritorio(alfa, (db) =>
      db.lancamento.findUnique({ where: { id: depois!.lancamentoId! } }),
    );
    expect(lancamento?.tipo).toBe("RECEITA");
    expect(lancamento?.valorCentavos).toBe(80_000);
  });

  it("sem o modulo financeiro, a baixa marca a cobranca e nao cria lancamento", async () => {
    const { id } = await emitirCobranca(beta, {
      clienteId: clienteBeta,
      descricao: "Sem financeiro",
      valorCentavos: 30_000,
      vencimento: amanha(),
      forma: "BOLETO",
    });
    const cobranca = await comEscritorio(beta, (db) =>
      db.cobranca.findUnique({ where: { id } }),
    );
    pagamentos[cobranca!.idNoAsaas] = {
      ...pagamentos[cobranca!.idNoAsaas],
      status: "CONFIRMED",
      paymentDate: "2026-09-18",
      value: 300,
    };

    await sincronizarCobrancas(beta);

    const depois = await comEscritorio(beta, (db) =>
      db.cobranca.findUnique({ where: { id } }),
    );
    expect(depois?.status).toBe("PAGA");
    expect(depois?.lancamentoId).toBeNull();
    expect(await comEscritorio(beta, (db) => db.lancamento.count())).toBe(0);
  });

  it("vencida e status desconhecido: um muda, o outro fica", async () => {
    const vencida = await emitirCobranca(alfa, {
      clienteId: clienteAlfa,
      descricao: "Vai vencer",
      valorCentavos: 1_000,
      vencimento: amanha(),
      forma: "BOLETO",
    });
    const estranha = await emitirCobranca(alfa, {
      clienteId: clienteAlfa,
      descricao: "Estado novo",
      valorCentavos: 2_000,
      vencimento: amanha(),
      forma: "BOLETO",
    });

    const ids = await comEscritorio(alfa, (db) =>
      db.cobranca.findMany({
        where: { id: { in: [vencida.id, estranha.id] } },
      }),
    );
    for (const cobranca of ids) {
      pagamentos[cobranca.idNoAsaas] = {
        ...pagamentos[cobranca.idNoAsaas],
        status:
          cobranca.id === vencida.id ? "OVERDUE" : "ALGO_QUE_NAO_CONHECEMOS",
      };
    }

    await sincronizarCobrancas(alfa);

    const depois = await comEscritorio(alfa, (db) =>
      db.cobranca.findMany({
        where: { id: { in: [vencida.id, estranha.id] } },
      }),
    );
    expect(depois.find((c) => c.id === vencida.id)?.status).toBe("VENCIDA");
    expect(depois.find((c) => c.id === estranha.id)?.status).toBe("ABERTA");
  });

  it("uma cobranca que falha nao derruba as outras", async () => {
    const boa = await emitirCobranca(alfa, {
      clienteId: clienteAlfa,
      descricao: "Boa",
      valorCentavos: 1_000,
      vencimento: amanha(),
      forma: "BOLETO",
    });
    const ruim = await emitirCobranca(alfa, {
      clienteId: clienteAlfa,
      descricao: "Some do Asaas",
      valorCentavos: 2_000,
      vencimento: amanha(),
      forma: "BOLETO",
    });

    const registros = await comEscritorio(alfa, (db) =>
      db.cobranca.findMany({ where: { id: { in: [boa.id, ruim.id] } } }),
    );
    const idDaBoa = registros.find((c) => c.id === boa.id)!.idNoAsaas;
    const idDaRuim = registros.find((c) => c.id === ruim.id)!.idNoAsaas;
    pagamentos[idDaBoa] = {
      ...pagamentos[idDaBoa],
      status: "RECEIVED",
      value: 10,
    };
    delete pagamentos[idDaRuim]; // o Asaas responde 404 para ela

    const resultado = await sincronizarCobrancas(alfa);
    expect(resultado.pagas).toBeGreaterThanOrEqual(1);
    expect(resultado.falhas.some((f) => f.cobranca === ruim.id)).toBe(true);

    const depois = await comEscritorio(alfa, (db) =>
      db.cobranca.findUnique({ where: { id: boa.id } }),
    );
    expect(depois?.status).toBe("PAGA");
  });

  it("cancela no Asaas e marca aqui; paga nao se cancela", async () => {
    const { id } = await emitirCobranca(alfa, {
      clienteId: clienteAlfa,
      descricao: "Emitida por engano",
      valorCentavos: 4_000,
      vencimento: amanha(),
      forma: "BOLETO",
    });

    await cancelarCobranca(alfa, id);
    expect(chamadas.some((c) => c.metodo === "DELETE")).toBe(true);
    const cancelada = await comEscritorio(alfa, (db) =>
      db.cobranca.findUnique({ where: { id } }),
    );
    expect(cancelada?.status).toBe("CANCELADA");

    const paga = await emitirCobranca(alfa, {
      clienteId: clienteAlfa,
      descricao: "Ja paga",
      valorCentavos: 4_000,
      vencimento: amanha(),
      forma: "BOLETO",
    });
    const registro = await comEscritorio(alfa, (db) =>
      db.cobranca.findUnique({ where: { id: paga.id } }),
    );
    pagamentos[registro!.idNoAsaas] = {
      ...pagamentos[registro!.idNoAsaas],
      status: "RECEIVED",
      value: 40,
    };
    await sincronizarCobrancas(alfa);

    await expect(cancelarCobranca(alfa, paga.id)).rejects.toThrow(
      /painel do Asaas/,
    );
  });

  it("cobranca de um escritorio nao aparece nem sincroniza no outro", async () => {
    const { id } = await emitirCobranca(alfa, {
      clienteId: clienteAlfa,
      descricao: "So do Alfa",
      valorCentavos: 7_000,
      vencimento: amanha(),
      forma: "BOLETO",
    });

    const vistaPeloBeta = await comEscritorio(beta, (db) =>
      db.cobranca.findUnique({ where: { id } }),
    );
    expect(vistaPeloBeta).toBeNull();

    await expect(cancelarCobranca(beta, id)).rejects.toBeInstanceOf(
      PedidoInvalido,
    );
  });

  it("chave recusada pelo Asaas vira mensagem propria", async () => {
    responder = () => ({ status: 401, json: {} });
    await expect(
      emitirCobranca(alfa, {
        clienteId: clienteAlfa,
        descricao: "Chave ruim",
        valorCentavos: 1_000,
        vencimento: amanha(),
        forma: "BOLETO",
      }),
    ).rejects.toBeInstanceOf(FalhaNoAsaas);
  });
});
