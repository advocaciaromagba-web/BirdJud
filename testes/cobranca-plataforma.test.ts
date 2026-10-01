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
  emitirCobrancaDaFatura,
  mensagemDaFatura,
  temCobrancaDaPlataforma,
} from "@/lib/cobranca-plataforma";

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

describe("descricao da cobranca", () => {
  // O extrato de quem paga mostra so a descricao. "BirdJud" doze vezes por
  // ano nao diz qual mes foi pago.
  it("leva a competencia", () => {
    expect(descricaoDaFatura("2026-10")).toBe("BirdJud — assinatura 10/2026");
  });
});

describe("chave da plataforma", () => {
  it("reconhece quando esta configurada", () => {
    expect(temCobrancaDaPlataforma()).toBe(true);
  });

  it("vazia nao conta como configurada", () => {
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
    expect(m.texto).toContain("boleto, Pix ou cartao");
  });

  // Sem link o e-mail ainda sai, mas nao promete o que nao tem.
  it("sem link, nao inventa botao de pagar", () => {
    const m = mensagemDaFatura({ ...base, link: null });
    expect(m.texto).not.toContain("http");
    expect(m.texto).toContain("sera enviado em seguida");
  });
});

seTemBanco("emissao contra o banco", () => {
  const ids: string[] = [];

  afterEach(async () => {
    responder = asaasNormal();
    for (const id of ids.splice(0)) {
      await prismaPlataforma()
        .escritorio.delete({ where: { id } })
        .catch(() => {});
    }
  });

  async function escritorioComFatura(opcoes: { cnpj: string | null }) {
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
      },
    });
    return { escritorio, fatura };
  }

  it("emite, guarda o id e o link, e manda a nossa referencia", async () => {
    responder = asaasNormal();
    const { fatura } = await escritorioComFatura({ cnpj: "11.222.333/0001-81" });

    const emitida = await emitirCobrancaDaFatura(fatura.id);
    expect(emitida?.idExterno).toMatch(/^pay_/);
    expect(emitida?.linkPagamento).toContain("https://asaas.test/");

    const dePagamento = chamadas.filter((c) => c.caminho === "/payments");
    const pagamento = dePagamento[dePagamento.length - 1];
    // Sem externalReference o webhook recebe o pagamento e nao sabe de quem e.
    expect(pagamento?.corpo?.externalReference).toBe(fatura.id);
    // UNDEFINED e o que entrega boleto, Pix e cartao na mesma tela.
    expect(pagamento?.corpo?.billingType).toBe("UNDEFINED");
    expect(pagamento?.corpo?.value).toBe(299);

    const guardada = await prismaPlataforma().fatura.findUniqueOrThrow({
      where: { id: fatura.id },
    });
    expect(guardada.idExterno).toBe(emitida?.idExterno);
    expect(guardada.emitidaEm).not.toBeNull();
  });

  // A regua roda pelo cron E pode ser passada a mao por um operador no mesmo
  // dia. Cobrar duas vezes o mesmo mes e o erro que aparece como dinheiro.
  it("emitir de novo nao cria segunda cobranca", async () => {
    responder = asaasNormal();
    const { fatura } = await escritorioComFatura({ cnpj: "11.222.333/0001-81" });

    const primeira = await emitirCobrancaDaFatura(fatura.id);
    const antes = chamadas.filter((c) => c.caminho === "/payments").length;
    const segunda = await emitirCobrancaDaFatura(fatura.id);
    const depois = chamadas.filter((c) => c.caminho === "/payments").length;

    expect(segunda?.idExterno).toBe(primeira?.idExterno);
    expect(depois).toBe(antes);
  });

  it("o assinante e criado uma vez so, e reaproveitado", async () => {
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

  it("fatura ja paga nao e cobrada", async () => {
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

  it("Asaas fora do ar levanta, e nao grava id pela metade", async () => {
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
