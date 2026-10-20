// A BirdJud cobrando os escritorios.
//
// Isto tem teste porque o erro aqui aparece como dinheiro: cobrar duas vezes
// o mesmo mes, ou nao cobrar e suspender o escritorio por uma fatura que
// ninguem lhe apresentou.
import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prismaPlataforma } from "@/lib/prisma";
import {
  AssinanteSemDocumento,
  PlataformaSemCobranca,
  assinanteNoAsaas,
  descricaoDaFatura,
  ehFaturaAnual,
  emitirCobrancaDaFatura,
  mensagemDaFatura,
  pagarFaturaNoCartao,
  temCobrancaDaPlataforma,
} from "@/lib/cobranca-plataforma";
import { PedidoInvalido } from "@/lib/cobrancas";
import { lerReferencia, referencia } from "@/lib/referencia-cobranca";

type Chamada = {
  metodo: string;
  caminho: string;
  corpo: Record<string, unknown> | null;
};

let servidor: Server;
const chamadas: Chamada[] = [];
let responder: (c: Chamada) => { status: number; json: unknown } = () => ({
  status: 200,
  json: {},
});
let proximo = 0;

const temBanco = Boolean(process.env.DATABASE_URL_PLATAFORMA);
const seTemBanco = temBanco ? describe : describe.skip;

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let cru = "";
    req.on("data", (p) => (cru += p));
    req.on("end", () => {
      const chamada: Chamada = {
        metodo: req.method ?? "GET",
        caminho: new URL(req.url ?? "/", "http://local").pathname,
        corpo: cru ? (JSON.parse(cru) as Record<string, unknown>) : null,
      };
      chamadas.push(chamada);
      const r = responder(chamada);
      res.writeHead(r.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(r.json));
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  const porta = (servidor.address() as { port: number }).port;
  process.env.ASAAS_BASE_URL = `http://127.0.0.1:${porta}`;
  process.env.ASAAS_PLATAFORMA_CHAVE = "chave-de-teste";
});

afterAll(async () => {
  await new Promise<void>((ok) => servidor.close(() => ok()));
  delete process.env.ASAAS_BASE_URL;
  delete process.env.ASAAS_PLATAFORMA_CHAVE;
});

function asaasNormal() {
  return (chamada: Chamada) => {
    if (chamada.metodo === "POST" && chamada.caminho === "/customers") {
      proximo += 1;
      return { status: 200, json: { id: `cus_${proximo}` } };
    }
    if (chamada.metodo === "POST" && chamada.caminho === "/payments") {
      proximo += 1;
      return {
        status: 200,
        json: {
          id: `pay_${proximo}`,
          invoiceUrl: `https://asaas.test/i/pay_${proximo}`,
        },
      };
    }
    return { status: 404, json: {} };
  };
}

describe("descrição da cobrança", () => {
  // O extrato de quem paga mostra so a descricao. "BirdJud" doze vezes por
  // ano nao diz qual mes foi pago.
  it("leva a competência", () => {
    expect(descricaoDaFatura("2026-10")).toBe("BirdJud — assinatura 10/2026");
  });

  // A fatura anual cobra 12 meses: no boleto, "assinatura 10/2026" faria
  // parecer uma mensalidade de R$ 3.000.
  it("anual diz que são 12 meses", () => {
    expect(descricaoDaFatura("2026-10", true)).toBe("BirdJud — assinatura anual (12 meses) a partir de 10/2026");
  });

  it("reconhece a fatura anual pelos itens", () => {
    expect(ehFaturaAnual([{ descricao: "Assinatura anual: 12 x 279,00", valorCentavos: 334_800 }])).toBe(true);
    expect(ehFaturaAnual([{ descricao: "Plano Completo", valorCentavos: 27_900 }])).toBe(false);
    expect(ehFaturaAnual(null)).toBe(false);
  });
});

describe("chave da plataforma", () => {
  it("reconhece quando esta configurada", () => {
    expect(temCobrancaDaPlataforma()).toBe(true);
  });

  it("vazia não conta como configurada", () => {
    const antes = process.env.ASAAS_PLATAFORMA_CHAVE;
    process.env.ASAAS_PLATAFORMA_CHAVE = "   ";
    expect(temCobrancaDaPlataforma()).toBe(false);
    process.env.ASAAS_PLATAFORMA_CHAVE = antes;
  });
});

describe("mensagem da fatura", () => {
  const base = {
    nomeDoEscritorio: "Advocacia Roma",
    competencia: "2026-10",
    valorCentavos: 29_900,
    vencimento: new Date("2026-10-17T12:00:00Z"),
  };

  it("traz valor, vencimento e link", () => {
    const m = mensagemDaFatura({ ...base, link: "https://asaas.test/i/pay_1" });
    expect(m.assunto).toContain("2026-10");
    expect(m.assunto).toContain("17/10/2026");
    // O Intl poe espaco NAO SEPARAVEL entre "R$" e o numero. Comparar com
    // espaco comum faz o teste falhar por um caractere invisivel.
    expect(m.texto.replace(/\u00a0/g, " ")).toContain("R$ 299,00");
    expect(m.texto).toContain("https://asaas.test/i/pay_1");
    expect(m.texto).toContain("Pagar (boleto ou Pix)");
  });

  it("anual: o e-mail diz que e o plano de 12 meses", () => {
    const m = mensagemDaFatura({ ...base, valorCentavos: 301_320, link: "https://asaas.test/i/pay_1", anual: true });
    expect(m.assunto).toContain("plano anual");
    expect(m.texto).toContain("12 meses a partir de 2026-10");
    expect(m.texto).toContain("10% de desconto");
    expect(m.texto.replace(/\u00a0/g, " ")).toContain("R$ 3.013,20");
  });

  it("anual: o e-mail oferece o parcelamento, com o endereço da tela Plano", () => {
    const m = mensagemDaFatura({
      ...base, link: "https://asaas.test/i/pay_1", anual: true,
      enderecoDoPlano: "https://roma.birdjud.com.br/plano",
    });
    expect(m.texto).toContain("à vista ou em até 6x (com a tarifa do cartão)");
    expect(m.texto).toContain("https://roma.birdjud.com.br/plano");
    // Mensal: cartao so a vista.
    const mensal = mensagemDaFatura({ ...base, link: null, enderecoDoPlano: "https://x/plano" }).texto;
    expect(mensal).toContain("No cartão (com a tarifa do cartão), na tela Plano: https://x/plano");
    expect(mensal).not.toContain("6x");
  });

  // Sem link o e-mail ainda sai, mas nao promete o que nao tem.
  it("sem link, não inventa botão de pagar", () => {
    const m = mensagemDaFatura({ ...base, link: null });
    expect(m.texto).not.toContain("http");
    expect(m.texto).toContain("será enviado em seguida");
  });
});

seTemBanco("emissão contra o banco", () => {
  const ids: string[] = [];

  afterEach(async () => {
    responder = asaasNormal();
    for (const id of ids.splice(0)) {
      await prismaPlataforma()
        .escritorio.delete({ where: { id } })
        .catch(() => {});
    }
  });

  async function escritorioComFatura(opcoes: { cnpj: string | null; detalhe?: object[] }) {
    const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const escritorio = await prismaPlataforma().escritorio.create({
      data: {
        slug: `teste-${sufixo}`,
        nome: `Teste ${sufixo}`,
        cnpj: opcoes.cnpj,
        faixa: "ATE_1",
      },
    });
    ids.push(escritorio.id);
    const fatura = await prismaPlataforma().fatura.create({
      data: {
        escritorioId: escritorio.id,
        competencia: "2026-10",
        valorCentavos: 29_900,
        vencimento: new Date("2026-10-17T12:00:00Z"),
        ...(opcoes.detalhe ? { detalhe: opcoes.detalhe } : {}),
      },
    });
    return { escritorio, fatura };
  }

  it("emite, guarda o id e o link, e manda a nossa referência", async () => {
    responder = asaasNormal();
    const { fatura } = await escritorioComFatura({ cnpj: "11.222.333/0001-81" });

    const emitida = await emitirCobrancaDaFatura(fatura.id);
    expect(emitida?.idExterno).toMatch(/^pay_/);
    expect(emitida?.linkPagamento).toContain("https://asaas.test/");

    const dePagamento = chamadas.filter((c) => c.caminho === "/payments");
    const pagamento = dePagamento[dePagamento.length - 1];
    // Sem externalReference o webhook recebe o pagamento e nao sabe de quem e.
    // E sem a marca do sistema nao sabe de qual SISTEMA e: esta conta Asaas e
    // compartilhada entre varios sistemas da Blackbird, e o evento de
    // pagamento de qualquer um deles chega no webhook de todos.
    expect(pagamento?.corpo?.externalReference).toBe(
      referencia("fatura", fatura.id),
    );
    expect(lerReferencia(String(pagamento?.corpo?.externalReference))).toEqual({
      dono: "nosso",
      tipo: "fatura",
      id: fatura.id,
    });
    // Boleto com Pix. O cartao e cobranca a parte, com a tarifa repassada.
    expect(pagamento?.corpo?.billingType).toBe("BOLETO");
    expect(pagamento?.corpo?.value).toBe(299);

    const guardada = await prismaPlataforma().fatura.findUniqueOrThrow({
      where: { id: fatura.id },
    });
    expect(guardada.idExterno).toBe(emitida?.idExterno);
    expect(guardada.emitidaEm).not.toBeNull();
  });

  it("fatura anual vai ao Asaas descrita como anual", async () => {
    responder = asaasNormal();
    const { fatura } = await escritorioComFatura({
      cnpj: "11.222.333/0001-81",
      detalhe: [
        { descricao: "Assinatura anual: 12 x 279,00", valorCentavos: 334_800 },
        { descricao: "Desconto do plano anual (10%)", valorCentavos: -33_480 },
      ],
    });
    await emitirCobrancaDaFatura(fatura.id);
    const dePagamento = chamadas.filter((c) => c.caminho === "/payments");
    expect(dePagamento[dePagamento.length - 1]?.corpo?.description).toBe(
      "BirdJud — assinatura anual (12 meses) a partir de 10/2026",
    );
  });

  // A regua roda pelo cron E pode ser passada a mao por um operador no mesmo
  // dia. Cobrar duas vezes o mesmo mes e o erro que aparece como dinheiro.
  it("emitir de novo não cria segunda cobrança", async () => {
    responder = asaasNormal();
    const { fatura } = await escritorioComFatura({ cnpj: "11.222.333/0001-81" });

    const primeira = await emitirCobrancaDaFatura(fatura.id);
    const antes = chamadas.filter((c) => c.caminho === "/payments").length;
    const segunda = await emitirCobrancaDaFatura(fatura.id);
    const depois = chamadas.filter((c) => c.caminho === "/payments").length;

    expect(segunda?.idExterno).toBe(primeira?.idExterno);
    expect(depois).toBe(antes);
  });

  it("o assinante e criado uma vez só, e reaproveitado", async () => {
    responder = asaasNormal();
    const { escritorio } = await escritorioComFatura({
      cnpj: "11.222.333/0001-81",
    });
    const dados = { nome: "Teste", cnpj: "11.222.333/0001-81", email: null };

    const a = await assinanteNoAsaas(escritorio.id, dados);
    const antes = chamadas.filter((c) => c.caminho === "/customers").length;
    const b = await assinanteNoAsaas(escritorio.id, dados);
    const depois = chamadas.filter((c) => c.caminho === "/customers").length;

    expect(b).toBe(a);
    expect(depois).toBe(antes);
  });

  it("fatura já paga não e cobrada", async () => {
    responder = asaasNormal();
    const { fatura } = await escritorioComFatura({ cnpj: "11.222.333/0001-81" });
    await prismaPlataforma().fatura.update({
      where: { id: fatura.id },
      data: { status: "PAGA", pagoEm: new Date() },
    });
    expect(await emitirCobrancaDaFatura(fatura.id)).toBeNull();
  });

  it("sem CNPJ, recusa com mensagem que diz o que fazer", async () => {
    responder = asaasNormal();
    const { fatura } = await escritorioComFatura({ cnpj: null });
    await expect(emitirCobrancaDaFatura(fatura.id)).rejects.toThrow(
      AssinanteSemDocumento,
    );
  });

  it("Asaas fora do ar levanta, e não grava id pela metade", async () => {
    const { fatura } = await escritorioComFatura({ cnpj: "11.222.333/0001-81" });
    responder = () => ({ status: 500, json: {} });

    await expect(emitirCobrancaDaFatura(fatura.id)).rejects.toThrow();
    const guardada = await prismaPlataforma().fatura.findUniqueOrThrow({
      where: { id: fatura.id },
    });
    expect(guardada.idExterno).toBeNull();
    expect(guardada.emitidaEm).toBeNull();
  });

  it("sem chave configurada, levanta PlataformaSemCobranca", async () => {
    responder = asaasNormal();
    const { fatura } = await escritorioComFatura({ cnpj: "11.222.333/0001-81" });
    const antes = process.env.ASAAS_PLATAFORMA_CHAVE;
    delete process.env.ASAAS_PLATAFORMA_CHAVE;
    await expect(emitirCobrancaDaFatura(fatura.id)).rejects.toThrow(
      PlataformaSemCobranca,
    );
    process.env.ASAAS_PLATAFORMA_CHAVE = antes;
  });
});

// Anual parcelado no cartao. O risco aqui e dinheiro duas vezes: a cobranca a
// vista e a parcelada vivas ao mesmo tempo, e o escritorio pagando as duas.
seTemBanco("parcelar a fatura anual no cartão", () => {
  const ids: string[] = [];
  let statusNoAsaas = "PENDING";
  let n = 0;

  function asaasComParcelas() {
    return (c: Chamada) => {
      if (c.metodo === "POST" && c.caminho === "/customers") return { status: 200, json: { id: `cus_parc_${++n}` } };
      if (c.metodo === "POST" && c.caminho === "/payments") {
        const id = `pay_parc_${++n}`;
        return {
          status: 200,
          json: c.corpo?.installmentCount
            ? { id, installment: `ins_parc_${n}`, invoiceUrl: `https://asaas.test/i/${id}` }
            : { id, invoiceUrl: `https://asaas.test/i/${id}` },
        };
      }
      if (c.metodo === "GET" && c.caminho.startsWith("/payments/")) return { status: 200, json: { status: statusNoAsaas } };
      if (c.metodo === "DELETE" && c.caminho.startsWith("/payments/")) return { status: 200, json: { deleted: true } };
      return { status: 404, json: {} };
    };
  }

  const ANUAL = [
    { descricao: "Assinatura anual: 12 x 279,00", valorCentavos: 334_800 },
    { descricao: "Desconto do plano anual (10%)", valorCentavos: -33_480 },
  ];

  async function faturaEmitida(detalhe: object[] = ANUAL) {
    const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const escritorio = await prismaPlataforma().escritorio.create({
      data: { slug: `parc-${sufixo}`, nome: `Parc ${sufixo}`, cnpj: "11.222.333/0001-81", faixa: "ATE_1" },
    });
    ids.push(escritorio.id);
    const fatura = await prismaPlataforma().fatura.create({
      data: {
        escritorioId: escritorio.id, competencia: "2026-10", valorCentavos: 301_320, detalhe,
        vencimento: new Date("2026-10-20T12:00:00Z"),
      },
    });
    await emitirCobrancaDaFatura(fatura.id);
    return { escritorio, fatura: await prismaPlataforma().fatura.findUniqueOrThrow({ where: { id: fatura.id } }) };
  }

  afterEach(async () => {
    statusNoAsaas = "PENDING";
    for (const id of ids.splice(0)) await prismaPlataforma().escritorio.delete({ where: { id } }).catch(() => {});
  });

  it("cancela o boleto e cria o parcelamento em 6x no cartão", async () => {
    responder = asaasComParcelas();
    const { escritorio, fatura } = await faturaEmitida();
    const avista = fatura.idExterno!;
    const antes = chamadas.length;

    const r = await pagarFaturaNoCartao(escritorio.id, fatura.id, 6, new Date("2026-10-16T12:00:00Z"));
    expect(r.parcelas).toBe(6);
    // Tarifa e antecipacao repassadas (ver assinatura-anual.test.ts).
    expect(r.valorCentavos).toBe(334_248);
    expect(r.linkPagamento).toMatch(/^https:\/\/asaas.test\/i\/pay_parc_/);

    const novas = chamadas.slice(antes);
    expect(novas.map((c) => `${c.metodo} ${c.caminho}`)).toEqual([
      `GET /payments/${avista}`,
      `DELETE /payments/${avista}`,
      "POST /payments",
    ]);
    const corpo = novas[2].corpo!;
    expect(corpo.billingType).toBe("CREDIT_CARD");
    expect(corpo.installmentCount).toBe(6);
    expect(corpo.totalValue).toBe(3342.48);
    // Nunca value junto com totalValue: o Asaas recusa.
    expect(corpo.value).toBeUndefined();
    expect(corpo.dueDate).toBe("2026-10-20");
    expect(corpo.externalReference).toBe(referencia("fatura", fatura.id));

    const guardada = await prismaPlataforma().fatura.findUniqueOrThrow({ where: { id: fatura.id } });
    expect(guardada.parcelamentoId).toMatch(/^ins_parc_/);
    expect(guardada.parcelas).toBe(6);
    expect(guardada.idExterno).not.toBe(avista);
    expect(guardada.status).toBe("ABERTA");
    // A fatura passa a dizer o que foi cobrado, com a tarifa em linha propria.
    expect(guardada.valorCentavos).toBe(334_248);
    const itens = guardada.detalhe as { descricao: string; valorCentavos: number }[];
    expect(itens[itens.length - 1]).toEqual({
      descricao: "Tarifa do cartão parcelado em 6x e antecipação (repassadas)",
      valorCentavos: 32_928,
    });
  });

  it("cartão a vista: value, sem parcelamento, com a tarifa", async () => {
    responder = asaasComParcelas();
    const { escritorio, fatura } = await faturaEmitida([{ descricao: "Plano Completo", valorCentavos: 27_900 }]);
    await prismaPlataforma().fatura.update({ where: { id: fatura.id }, data: { valorCentavos: 27_900 } });
    const antes = chamadas.length;
    const r = await pagarFaturaNoCartao(escritorio.id, fatura.id, 1);
    expect(r).toMatchObject({ parcelas: 1, valorCentavos: 28_811 });
    const corpo = chamadas.slice(antes).find((c) => c.metodo === "POST")!.corpo!;
    expect(corpo).toMatchObject({ billingType: "CREDIT_CARD", value: 288.11 });
    expect(corpo.installmentCount).toBeUndefined();
    expect(corpo.totalValue).toBeUndefined();
    const guardada = await prismaPlataforma().fatura.findUniqueOrThrow({ where: { id: fatura.id } });
    expect(guardada.parcelas).toBe(1);
    expect(guardada.parcelamentoId).toBeNull();
  });

  it("parcelas fora do permitido: recusa sem tocar no Asaas", async () => {
    responder = asaasComParcelas();
    const { escritorio, fatura } = await faturaEmitida();
    const antes = chamadas.length;
    await expect(pagarFaturaNoCartao(escritorio.id, fatura.id, 7)).rejects.toThrow(PedidoInvalido);
    await expect(pagarFaturaNoCartao(escritorio.id, fatura.id, 0)).rejects.toThrow(PedidoInvalido);
    await expect(pagarFaturaNoCartao(escritorio.id, fatura.id, Number.NaN)).rejects.toThrow(PedidoInvalido);
    expect(chamadas.length).toBe(antes);
  });

  it("pedir de novo não cria segundo parcelamento", async () => {
    responder = asaasComParcelas();
    const { escritorio, fatura } = await faturaEmitida();
    const primeiro = await pagarFaturaNoCartao(escritorio.id, fatura.id, 6);
    const antes = chamadas.length;
    const segundo = await pagarFaturaNoCartao(escritorio.id, fatura.id, 6);
    expect(segundo.linkPagamento).toBe(primeiro.linkPagamento);
    expect(chamadas.length).toBe(antes);
  });

  it("a vista já paga no Asaas: recusa e não cancela nada", async () => {
    responder = asaasComParcelas();
    const { escritorio, fatura } = await faturaEmitida();
    statusNoAsaas = "RECEIVED";
    const antes = chamadas.length;
    await expect(pagarFaturaNoCartao(escritorio.id, fatura.id, 6)).rejects.toThrow(/já foi paga/);
    expect(chamadas.slice(antes).some((c) => c.metodo === "DELETE")).toBe(false);
  });

  it("mensalidade não parcela (só a vista)", async () => {
    responder = asaasComParcelas();
    const { escritorio, fatura } = await faturaEmitida([{ descricao: "Plano Completo", valorCentavos: 27_900 }]);
    await expect(pagarFaturaNoCartao(escritorio.id, fatura.id, 2)).rejects.toThrow(/só vai ao cartão a vista/);
  });

  it("fatura de outro escritório: não encontrada", async () => {
    responder = asaasComParcelas();
    const { fatura } = await faturaEmitida();
    const { escritorio: outro } = await faturaEmitida();
    await expect(pagarFaturaNoCartao(outro.id, fatura.id, 6)).rejects.toThrow(/não encontrada/);
  });

  // Cancelou a a vista e o Asaas caiu antes do parcelamento: a fatura fica
  // sem cobranca (a regua emite a a vista de novo), nunca apontando para uma
  // cobranca que ja nao existe.
  it("Asaas cai depois de cancelar: a fatura fica sem cobrança, pronta para reemitir", async () => {
    const normal = asaasComParcelas();
    responder = normal;
    const { escritorio, fatura } = await faturaEmitida();
    responder = (c) => (c.metodo === "POST" && c.caminho === "/payments" ? { status: 500, json: {} } : normal(c));
    await expect(pagarFaturaNoCartao(escritorio.id, fatura.id, 6)).rejects.toThrow();
    const guardada = await prismaPlataforma().fatura.findUniqueOrThrow({ where: { id: fatura.id } });
    expect(guardada.idExterno).toBeNull();
    expect(guardada.parcelamentoId).toBeNull();

    responder = normal;
    const de_novo = await emitirCobrancaDaFatura(fatura.id);
    expect(de_novo?.idExterno).toMatch(/^pay_parc_/);
  });
});
