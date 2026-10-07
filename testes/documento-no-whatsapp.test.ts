// A peca em PDF indo para o WhatsApp do cliente.
//
// O QUE ESTES TESTES PROTEGEM: documento de cliente. Mandar a procuracao de
// uma pessoa para o telefone de outra nao da erro nenhum, chega instantaneo e
// NAO SE DESFAZ. E um recibo com o valor em branco e quitacao de um valor que
// ninguem conferiu.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { consumoDoMes } from "../src/lib/consumo";
import {
  NaoDaParaMandar,
  mandarPecaNoWhatsapp,
} from "../src/lib/documento-no-whatsapp";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

d("mandar a peca no WhatsApp", () => {
  let escritorio = "";
  let servidor: Server;
  let subidos: Array<{ nome: string; bytes: number; tipo: string }> = [];
  let mandadas: Array<Record<string, unknown>> = [];

  const ESCRITORIO = {
    nome: "Banca do Documento",
    cidade: "Barreiras",
    telefoneAtendimento: "(77) 3611-0000",
    razaoSocial: null,
    cnpj: null,
    registroOab: null,
    enderecos: null,
  };
  const cliente = (telefone: string | null) => ({
    nome: "Maria Helena de Souza",
    documento: "12345678900",
    email: "maria@exemplo.test",
    telefone,
    endereco: null,
  });

  beforeAll(async () => {
    servidor = createServer(async (req, res) => {
      const pedacos: Buffer[] = [];
      for await (const p of req) pedacos.push(p as Buffer);
      const bruto = Buffer.concat(pedacos);
      const tipo = req.headers["content-type"] ?? "";
      res.setHeader("content-type", "application/json");

      if (tipo.startsWith("multipart/")) {
        const forma = await new Response(bruto, {
          headers: { "content-type": tipo },
        }).formData();
        const arquivo = forma.get("file") as File;
        subidos.push({
          nome: arquivo.name,
          bytes: (await arquivo.arrayBuffer()).byteLength,
          tipo: String(forma.get("type")),
        });
        res.end(JSON.stringify({ id: `midia-${subidos.length}` }));
        return;
      }

      mandadas.push(JSON.parse(bruto.toString() || "{}"));
      res.end(JSON.stringify({ messages: [{ id: `wamid.doc${mandadas.length}` }] }));
    });
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    const porta = (servidor.address() as { port: number }).port;
    process.env.META_BASE_URL = `http://127.0.0.1:${porta}`;
    process.env.WHATSAPP_NUMERO_ID = "111";
    process.env.WHATSAPP_TOKEN = "tok";

    const e = await prismaPlataforma().escritorio.create({
      data: {
        slug: `doc-${Date.now()}`,
        nome: ESCRITORIO.nome,
        cidade: "Barreiras",
        telefoneAtendimento: ESCRITORIO.telefoneAtendimento,
      },
    });
    escritorio = e.id;
    await comEscritorio(escritorio, (db) =>
      db.moduloContratado.create({
        data: semEscritorio({ modulo: "WHATSAPP", ativo: true }),
      }),
    );
  });

  afterAll(async () => {
    delete process.env.META_BASE_URL;
    delete process.env.WHATSAPP_NUMERO_ID;
    delete process.env.WHATSAPP_TOKEN;
    if (escritorio) {
      await prismaPlataforma()
        .escritorio.delete({ where: { id: escritorio } })
        .catch(() => {});
    }
    await new Promise<void>((ok) => servidor.close(() => ok()));
    await prismaPlataforma().$disconnect();
  });

  it("sobe o PDF como arquivo e manda o id no cabecalho", async () => {
    subidos = [];
    mandadas = [];
    const r = await mandarPecaNoWhatsapp(escritorio, "PROCURACAO", {
      clienteId: "cli-1",
      cliente: cliente("(77) 98888-0000"),
      escritorio: ESCRITORIO,
    });

    expect(r.telefone).toBe("5577988880000");
    expect(subidos).toHaveLength(1);
    expect(subidos[0].tipo).toBe("application/pdf");
    expect(subidos[0].nome).toContain(".pdf");
    expect(subidos[0].bytes).toBeGreaterThan(500);

    const corpo = mandadas[0] as {
      to: string;
      template: { name: string; components: Array<Record<string, never>> };
    };
    expect(corpo.to).toBe("5577988880000");
    expect(corpo.template.name).toBe("birdjud_documento");
    const cabecalho = JSON.stringify(corpo.template.components[0]);
    expect(cabecalho).toContain("midia-1");
    expect(cabecalho).toContain("document");
    // O PDF NAO vai dentro do JSON.
    expect(JSON.stringify(corpo)).not.toContain("%PDF");
  });

  it("conta a mensagem no consumo do mes", async () => {
    // Sem isto, a franquia do modulo nao enxergaria o documento mandado e o
    // excedente da fatura sairia menor do que o uso real.
    const consumo = await consumoDoMes(escritorio);
    const zap = consumo.find((l) => l.metrica === "WHATSAPP_MSG");
    expect(zap?.quantidade ?? 0).toBeGreaterThan(0);
  });

  it("CLIENTE SEM TELEFONE nao manda, e nao sobe nada", async () => {
    subidos = [];
    mandadas = [];
    await expect(
      mandarPecaNoWhatsapp(escritorio, "PROCURACAO", {
        clienteId: "cli-2",
        cliente: cliente(null),
        escritorio: ESCRITORIO,
      }),
    ).rejects.toBeInstanceOf(NaoDaParaMandar);
    // Nem subiu arquivo nem gastou mensagem: a recusa e antes de tudo.
    expect(subidos).toHaveLength(0);
    expect(mandadas).toHaveLength(0);
  });

  it("telefone que nao da para ler e recusado, com o numero na mensagem", async () => {
    await expect(
      mandarPecaNoWhatsapp(escritorio, "PROCURACAO", {
        clienteId: "cli-3",
        cliente: cliente("123"),
        escritorio: ESCRITORIO,
      }),
    ).rejects.toThrow(/123/);
  });

  it("quem pediu para parar nao recebe nem documento", async () => {
    // O pedido vale para tudo, nao so para lembrete: documento e a mensagem
    // mais invasiva que o sistema manda.
    await comEscritorio(escritorio, (db) =>
      db.bloqueioDeWhatsapp.create({
        data: semEscritorio({ telefone: "5577977770000" }),
      }),
    );
    subidos = [];
    await expect(
      mandarPecaNoWhatsapp(escritorio, "CONTRATO", {
        clienteId: "cli-4",
        cliente: cliente("77977770000"),
        escritorio: ESCRITORIO,
      }),
    ).rejects.toThrow(/nao receber mais/);
    expect(subidos).toHaveLength(0);
  });

  it("RECIBO SEM VALOR nao sai: seria quitacao de valor que ninguem conferiu", async () => {
    subidos = [];
    await expect(
      mandarPecaNoWhatsapp(escritorio, "RECIBO", {
        clienteId: "cli-5",
        cliente: cliente("(77) 98888-0000"),
        escritorio: ESCRITORIO,
        recibo: null,
      }),
    ).rejects.toThrow(/campo em branco/);
    expect(subidos).toHaveLength(0);
  });

  it("recibo com valor sai normalmente", async () => {
    subidos = [];
    mandadas = [];
    await mandarPecaNoWhatsapp(escritorio, "RECIBO", {
      clienteId: "cli-6",
      cliente: cliente("(77) 98888-0000"),
      escritorio: ESCRITORIO,
      recibo: {
        valorCentavos: 300000,
        referenteA: "honorarios da acao trabalhista",
        forma: "Pix",
        quando: new Date("2026-10-07T12:00:00Z"),
      },
    });
    expect(subidos).toHaveLength(1);
    const corpo = JSON.stringify(mandadas[0]);
    expect(corpo).toContain("recibo de pagamento de honorarios");
    // A mensagem traz o telefone do escritorio: este numero nao atende.
    expect(corpo).toContain("(77) 3611-0000");
  });

  it("sem o modulo contratado, nao manda", async () => {
    const outro = await prismaPlataforma().escritorio.create({
      data: { slug: `doc-sem-${Date.now()}`, nome: "Sem modulo" },
    });
    try {
      await expect(
        mandarPecaNoWhatsapp(outro.id, "PROCURACAO", {
          clienteId: "cli-7",
          cliente: cliente("(77) 98888-0000"),
          escritorio: ESCRITORIO,
        }),
      ).rejects.toThrow(/nao esta contratado/);
    } finally {
      await prismaPlataforma().escritorio.delete({ where: { id: outro.id } });
    }
  });
});
