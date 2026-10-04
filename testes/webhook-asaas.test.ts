// O webhook de pagamento, visto de fora.
//
// POR QUE ISTO TEM TESTE: a conta Asaas da Blackbird atende varios sistemas
// (em 04/10/2026, sete webhooks registrados nela), e o Asaas entrega os
// eventos da CONTA INTEIRA para CADA URL. Logo, pagamento do LaudoJud bate
// aqui. O webhook do BirdJud esta em sendType SEQUENTIALLY — fila. Responder
// erro a um evento alheio faz o Asaas reenviar, a fila trava, e as NOSSAS
// baixas param de chegar: o escritorio paga e continua suspenso.
//
// Por isso a regra testada aqui e dura: o que nao e nosso sai com 200.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prismaPlataforma } from "@/lib/prisma";
import { referencia } from "@/lib/referencia-cobranca";

const TOKEN = "token-de-teste-do-webhook";
let antes: string | undefined;

beforeAll(() => {
  antes = process.env.ASAAS_WEBHOOK_TOKEN;
  process.env.ASAAS_WEBHOOK_TOKEN = TOKEN;
});

afterAll(() => {
  if (antes === undefined) delete process.env.ASAAS_WEBHOOK_TOKEN;
  else process.env.ASAAS_WEBHOOK_TOKEN = antes;
});

async function chamar(
  corpo: unknown,
  token: string | null = TOKEN,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const { POST } = await import("@/app/api/webhooks/asaas/route");
  const resposta = await POST(
    new Request("https://app.birdjud.com.br/api/webhooks/asaas", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { "asaas-access-token": token } : {}),
      },
      body: JSON.stringify(corpo),
    }),
  );
  return { status: resposta.status, json: await resposta.json() };
}

describe("webhook: o que nao e nosso", () => {
  it("pagamento de outro sistema da conta sai com 200", async () => {
    // Este e o caso que travava a fila.
    for (const outro of ["laudojud", "anjosdasuasaude", "chamaja"]) {
      const r = await chamar({
        event: "PAYMENT_RECEIVED",
        payment: {
          id: "pay_do_vizinho",
          externalReference: `${outro}:fatura:9`,
          value: 100,
        },
      });
      expect(r.status).toBe(200);
      expect(r.json.deOutroSistema).toBe(outro);
    }
  });

  it("evento sem referencia sai com 200, nao com 400", async () => {
    // Reenviar nao faz a referencia aparecer: recusar so trava a fila.
    const r = await chamar({
      event: "PAYMENT_CONFIRMED",
      payment: { id: "pay_sem_ref" },
    });
    expect(r.status).toBe(200);
    expect(r.json.semReferencia).toBe(true);
  });

  it("evento que nao e de baixa continua reconhecido", async () => {
    const r = await chamar({ event: "PAYMENT_CREATED", payment: { id: "p" } });
    expect(r.status).toBe(200);
    expect(r.json.ignorado).toBe("PAYMENT_CREATED");
  });

  it("referencia nossa de cliente, nao de fatura, nao da baixa em nada", async () => {
    const r = await chamar({
      event: "PAYMENT_RECEIVED",
      payment: { id: "p", externalReference: referencia("escritorio", "x") },
    });
    expect(r.status).toBe(200);
    expect(r.json.ignorado).toBe("escritorio");
  });
});

describe("webhook: a porta continua fechada", () => {
  it("sem token, 401", async () => {
    const r = await chamar({ event: "PAYMENT_RECEIVED" }, null);
    expect(r.status).toBe(401);
  });

  it("token errado, 401", async () => {
    const r = await chamar({ event: "PAYMENT_RECEIVED" }, "token-errado");
    expect(r.status).toBe(401);
  });

  // Token alheio nao entra: a conta e compartilhada, o token do webhook nao.
  it("corpo que nao e evento, 400", async () => {
    const r = await chamar({ sem: "evento" });
    expect(r.status).toBe(400);
  });
});

const temBanco = Boolean(process.env.DATABASE_URL_PLATAFORMA);
const seTemBanco = temBanco ? describe : describe.skip;

seTemBanco("webhook: a baixa, contra o banco", () => {
  const ids: string[] = [];

  afterEach(async () => {
    for (const id of ids.splice(0)) {
      await prismaPlataforma()
        .escritorio.delete({ where: { id } })
        .catch(() => {});
    }
  });

  async function fatura() {
    const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const escritorio = await prismaPlataforma().escritorio.create({
      data: {
        slug: `hook-${sufixo}`,
        nome: `Hook ${sufixo}`,
        cidade: "Salvador",
        cnpj: "11.222.333/0001-81",
        faixa: "ATE_1",
      },
    });
    ids.push(escritorio.id);
    const f = await prismaPlataforma().fatura.create({
      data: {
        escritorioId: escritorio.id,
        competencia: "2026-10",
        valorCentavos: 29_900,
        vencimento: new Date("2026-10-17T12:00:00Z"),
      },
    });
    return { escritorio, f };
  }

  it("da baixa e guarda quem pagou, quanto e como", async () => {
    const { escritorio, f } = await fatura();
    const r = await chamar({
      event: "PAYMENT_RECEIVED",
      payment: {
        id: "pay_nosso_1",
        externalReference: referencia("fatura", f.id),
        customer: "cus_123",
        value: 299,
        netValue: 294.01,
        billingType: "PIX",
        paymentDate: "2026-10-15",
      },
    });
    expect(r.status).toBe(200);

    const paga = await prismaPlataforma().fatura.findUniqueOrThrow({
      where: { id: f.id },
    });
    expect(paga.status).toBe("PAGA");
    expect(paga.idExterno).toBe("pay_nosso_1");

    // O retrato: de qual sistema, de quem, quanto e por qual caminho.
    const baixa = paga.baixa as Record<string, unknown>;
    expect(baixa.sistema).toBe("birdjud");
    expect(baixa.marcada).toBe(true);
    expect(baixa.forma).toBe("PIX");
    expect(baixa.valor).toBe(299);
    expect(baixa.clienteNoProvedor).toBe("cus_123");
    expect((baixa.escritorio as Record<string, unknown>).slug).toBe(
      escritorio.slug,
    );
    expect((baixa.escritorio as Record<string, unknown>).nome).toBe(
      escritorio.nome,
    );
  });

  it("referencia sem marca ainda acha a fatura (cobranca antiga)", async () => {
    // Compatibilidade: cobranca emitida antes da marca existir leva so o id.
    const { f } = await fatura();
    const r = await chamar({
      event: "PAYMENT_CONFIRMED",
      payment: { id: "pay_antigo", externalReference: f.id, value: 299 },
    });
    expect(r.status).toBe(200);
    const paga = await prismaPlataforma().fatura.findUniqueOrThrow({
      where: { id: f.id },
    });
    expect(paga.status).toBe("PAGA");
    expect((paga.baixa as Record<string, unknown>).marcada).toBe(false);
  });

  it("fatura inexistente sai com 200, nao com 404", async () => {
    const r = await chamar({
      event: "PAYMENT_RECEIVED",
      payment: {
        id: "pay_fantasma",
        externalReference: referencia("fatura", "nao-existe-mesmo"),
      },
    });
    expect(r.status).toBe(200);
    expect(r.json.naoEnossa).toBe(true);
  });

  it("reenvio da fatura ja paga nao reabre nada", async () => {
    const { f } = await fatura();
    const evento = {
      event: "PAYMENT_RECEIVED",
      payment: {
        id: "pay_reenvio",
        externalReference: referencia("fatura", f.id),
        value: 299,
        billingType: "BOLETO",
      },
    };
    expect((await chamar(evento)).status).toBe(200);
    const segunda = await chamar(evento);
    expect(segunda.status).toBe(200);
    expect(segunda.json.jaProcessada).toBe(true);
  });
});
