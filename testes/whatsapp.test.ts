// Modulo WHATSAPP: os avisos do escritorio tambem pelo numero dele, na Cloud
// API da Meta. A Meta e servida por um HTTP local.
//
// O que se prova aqui e o que o escritorio sente: numero que nao da para ler
// nao vira aviso perdido, erro que a Meta ja disse ser definitivo nao vira
// tres tentativas, o mesmo aviso nao sai duas vezes, e um canal nao atrapalha
// o outro.
import { createServer, type Server } from "node:http";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  comEscritorio,
  prismaPlataforma,
  semEscritorio,
} from "../src/lib/prisma";
import { salvarIntegracao } from "../src/lib/integracao";
import { consumoDoMes } from "../src/lib/consumo";
import { enviarAvisosNoWhatsapp, gerarAvisos } from "../src/lib/avisos";
import {
  enviarModelo,
  explicar,
  FalhaNoWhatsapp,
  paraE164BR,
  SemNumeroDeWhatsapp,
} from "../src/lib/whatsapp";
import {
  limparParametro,
  MODELOS,
  modeloDoTipo,
} from "../src/lib/modelos-whatsapp";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

describe("telefone e parametro, antes de falar com a Meta", () => {
  it("le o telefone como a equipe digita", () => {
    expect(paraE164BR("(71) 99999-8888")).toBe("5571999998888");
    expect(paraE164BR("71999998888")).toBe("5571999998888");
    expect(paraE164BR("+55 71 99999-8888")).toBe("5571999998888");
    expect(paraE164BR("5571999998888")).toBe("5571999998888");
    // Fixo, sem o nono digito.
    expect(paraE164BR("(71) 3333-4444")).toBe("557133334444");
  });

  it("numero que nao da para ter certeza vira null, nao chute", () => {
    expect(paraE164BR("99999-8888")).toBeNull(); // sem DDD
    expect(paraE164BR("999")).toBeNull();
    expect(paraE164BR("")).toBeNull();
    expect(paraE164BR(null)).toBeNull();
    expect(paraE164BR("(01) 99999-8888")).toBeNull(); // DDD que nao existe
  });

  it("parametro de modelo sai em uma linha e nunca vazio", () => {
    // A Meta recusa a mensagem inteira quando o parametro tem quebra de linha.
    expect(limparParametro("Audiencia\nde instrucao")).toBe(
      "Audiencia de instrucao",
    );
    expect(limparParametro("  dois   espacos  ")).toBe("dois espacos");
    expect(limparParametro(null)).toBe("—");
    expect(limparParametro("")).toBe("—");
    expect(limparParametro("x".repeat(300)).length).toBe(200);
  });

  it("cada tipo de aviso tem modelo, e o texto casa com os parametros", () => {
    for (const [tipo, modelo] of Object.entries(MODELOS)) {
      expect(modeloDoTipo(tipo)).toBe(modelo);
      const usados = [...modelo.texto.matchAll(/\{\{(\d+)\}\}/g)].map((m) =>
        Number(m[1]),
      );
      // Todo {{n}} do texto aprovado precisa ter significado declarado aqui,
      // porque a ordem e o contrato com a Meta.
      expect(Math.max(...usados)).toBe(modelo.parametros.length);
      expect(new Set(usados).size).toBe(modelo.parametros.length);
    }
  });

  it("traduz os erros da Meta que o escritorio resolve sozinho", () => {
    expect(explicar(132001, "x")).toMatch(/aprovado/);
    expect(explicar(131047, "x")).toMatch(/24 horas/);
    expect(explicar(131026, "x")).toMatch(/nao recebe/);
    expect(explicar(190, "x")).toMatch(/Reconecte|reconecte/);
    // Codigo desconhecido passa a mensagem da Meta, sem inventar explicacao.
    expect(explicar(999999, "mensagem original")).toBe("mensagem original");
  });
});

// ---------------------------------------------------------------------------
// Meta servida localmente
// ---------------------------------------------------------------------------

type Chamada = { caminho: string; corpo: Record<string, any> };

let servidor: Server;
let chamadas: Chamada[] = [];
let responder: (c: Chamada) => { status: number; json: unknown } = () => ({
  status: 200,
  json: { messages: [{ id: "wamid.1" }] },
});

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let cru = "";
    req.on("data", (p) => {
      cru += p;
    });
    req.on("end", () => {
      const chamada: Chamada = {
        caminho: new URL(req.url ?? "/", "http://local").pathname,
        corpo: cru ? JSON.parse(cru) : {},
      };
      chamadas.push(chamada);
      const resposta = responder(chamada);
      res.writeHead(resposta.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(resposta.json));
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  const porta = (servidor.address() as { port: number }).port;
  process.env.META_BASE_URL = `http://127.0.0.1:${porta}`;
});

afterAll(async () => {
  await new Promise<void>((ok) => servidor.close(() => ok()));
  delete process.env.META_BASE_URL;
});

const marca = Date.now();
let alfa = "";
let semModulo = "";
let usuarioAlfa = "";

d("avisos pelo WhatsApp", () => {
  beforeAll(async () => {
    process.env.SEGREDO_CHAVE ??= Buffer.alloc(32, 9).toString("base64");

    const a = await prismaPlataforma().escritorio.create({
      data: { slug: `zap-a-${marca}`, nome: "Alfa Zap" },
    });
    const b = await prismaPlataforma().escritorio.create({
      data: { slug: `zap-b-${marca}`, nome: "Beta Sem Zap" },
    });
    alfa = a.id;
    semModulo = b.id;

    await comEscritorio(alfa, async (db) => {
      await db.moduloContratado.create({
        data: semEscritorio({ modulo: "WHATSAPP", ativo: true }),
      });
      const usuario = await db.usuario.create({
        data: semEscritorio({
          nome: "Advogada",
          email: `zap-${marca}@teste.br`,
          senhaHash: "x",
          papel: "ADMIN",
          telefone: "(71) 99999-8888",
          recebeWhatsapp: true,
        }),
      });
      usuarioAlfa = usuario.id;
      await db.publicacao.create({
        data: semEscritorio({
          idExterno: `zap-pub-${marca}`,
          texto: "Fica intimado para, no prazo de 5 dias, manifestar-se.",
          dataDisponibilizacao: new Date(),
          urgente: true,
          prazoDias: 5,
        }),
      });
    });

    // Beta tem usuario querendo WhatsApp, mas nao contratou o modulo.
    await comEscritorio(semModulo, async (db) => {
      await db.usuario.create({
        data: semEscritorio({
          nome: "Sem modulo",
          email: `zap-sem-${marca}@teste.br`,
          senhaHash: "x",
          papel: "ADMIN",
          telefone: "(71) 98888-7777",
          recebeWhatsapp: true,
        }),
      });
      await db.publicacao.create({
        data: semEscritorio({
          idExterno: `zap-pub-b-${marca}`,
          texto: "Intimacao qualquer",
          dataDisponibilizacao: new Date(),
        }),
      });
    });

    await salvarIntegracao(
      alfa,
      "WHATSAPP_META",
      { numeroId: "111", token: "tok" },
      "OK",
    );
  });

  afterAll(async () => {
    for (const id of [alfa, semModulo]) {
      if (id)
        await prismaPlataforma()
          .escritorio.delete({ where: { id } })
          .catch(() => {});
    }
    await prismaPlataforma().$disconnect();
  });

  beforeEach(() => {
    chamadas = [];
    responder = () => ({
      status: 200,
      json: { messages: [{ id: `wamid.${Date.now()}` }] },
    });
  });

  afterEach(async () => {
    // Cada teste comeca sem aviso pendente de WhatsApp do anterior.
    await comEscritorio(alfa, (db) =>
      db.aviso.deleteMany({ where: { canal: "WHATSAPP" } }),
    );
  });

  it("manda modelo aprovado, nunca texto livre", async () => {
    await enviarModelo(alfa, {
      para: "5571999998888",
      modelo: "birdjud_resumo_publicacoes",
      parametros: ["Alfa Zap", "3", "1"],
    });

    expect(chamadas).toHaveLength(1);
    const corpo = chamadas[0].corpo;
    expect(chamadas[0].caminho).toBe("/111/messages");
    expect(corpo.type).toBe("template");
    expect(corpo.text).toBeUndefined();
    expect(corpo.template.name).toBe("birdjud_resumo_publicacoes");
    expect(corpo.template.language.code).toBe("pt_BR");
    expect(
      corpo.template.components[0].parameters.map((p: any) => p.text),
    ).toEqual(["Alfa Zap", "3", "1"]);
  });

  it("gera o aviso nos dois canais, sem duplicar quando roda de novo", async () => {
    const primeira = await gerarAvisos(alfa);
    expect(primeira.resumos).toBe(2); // e-mail + WhatsApp

    const segunda = await gerarAvisos(alfa);
    expect(segunda.resumos).toBe(0);

    const avisos = await comEscritorio(alfa, (db) =>
      db.aviso.findMany({ where: { tipo: "RESUMO_PUBLICACOES" } }),
    );
    const zap = avisos.find((a) => a.canal === "WHATSAPP");
    expect(zap?.destino).toBe("5571999998888");
    expect(zap?.modelo).toBe("birdjud_resumo_publicacoes");
    expect(zap?.parametros).toEqual(["Alfa Zap", "1", "1"]);
  });

  it("sem o modulo contratado, nao ha aviso de WhatsApp — mesmo com o usuario querendo", async () => {
    await gerarAvisos(semModulo);
    const zap = await comEscritorio(semModulo, (db) =>
      db.aviso.count({ where: { canal: "WHATSAPP" } }),
    );
    expect(zap).toBe(0);
  });

  it("envia os pendentes e mede o consumo", async () => {
    await gerarAvisos(alfa);
    const antes = (await consumoDoMes(alfa)).find(
      (l) => l.metrica === "WHATSAPP_MSG",
    );

    const resultado = await enviarAvisosNoWhatsapp(alfa);
    expect(resultado.enviados).toBe(1);
    expect(resultado.falhas).toBe(0);

    const depois = (await consumoDoMes(alfa)).find(
      (l) => l.metrica === "WHATSAPP_MSG",
    );
    expect(depois?.quantidade).toBe((antes?.quantidade ?? 0) + 1);

    const zap = await comEscritorio(alfa, (db) =>
      db.aviso.findFirst({ where: { canal: "WHATSAPP" } }),
    );
    expect(zap?.estado).toBe("ENVIADO");
    expect(zap?.enviadoEm).not.toBeNull();

    // Segunda rodada nao reenvia o que ja saiu.
    chamadas = [];
    const denovo = await enviarAvisosNoWhatsapp(alfa);
    expect(denovo.enviados).toBe(0);
    expect(chamadas).toHaveLength(0);
  });

  it("erro definitivo para na primeira, sem gastar tres tentativas", async () => {
    await gerarAvisos(alfa);
    responder = () => ({
      status: 400,
      json: {
        error: { code: 132001, message: "Template name does not exist" },
      },
    });

    const resultado = await enviarAvisosNoWhatsapp(alfa);
    expect(resultado.falhas).toBe(1);
    expect(chamadas).toHaveLength(1);

    const zap = await comEscritorio(alfa, (db) =>
      db.aviso.findFirst({ where: { canal: "WHATSAPP" } }),
    );
    expect(zap?.estado).toBe("FALHOU");
    expect(zap?.erro).toMatch(/aprovado/);
  });

  it("erro passageiro conta tentativa e continua pendente", async () => {
    await gerarAvisos(alfa);
    responder = () => ({
      status: 429,
      json: { error: { code: 130429, message: "Rate limit" } },
    });

    await enviarAvisosNoWhatsapp(alfa);

    const zap = await comEscritorio(alfa, (db) =>
      db.aviso.findFirst({ where: { canal: "WHATSAPP" } }),
    );
    expect(zap?.estado).toBe("PENDENTE");
    expect(zap?.tentativas).toBe(1);
  });

  it("numero nao conectado deixa os avisos de pe, sem gastar tentativa", async () => {
    const semNumero = await prismaPlataforma().escritorio.create({
      data: { slug: `zap-c-${marca}`, nome: "Sem numero" },
    });
    try {
      await comEscritorio(semNumero.id, async (db) => {
        await db.moduloContratado.create({
          data: semEscritorio({ modulo: "WHATSAPP", ativo: true }),
        });
        await db.usuario.create({
          data: semEscritorio({
            nome: "Alguem",
            email: `zap-c-${marca}@teste.br`,
            senhaHash: "x",
            papel: "ADMIN",
            telefone: "71999990000",
            recebeWhatsapp: true,
          }),
        });
        await db.publicacao.create({
          data: semEscritorio({
            idExterno: `zap-pub-c-${marca}`,
            texto: "Intimacao",
            dataDisponibilizacao: new Date(),
          }),
        });
      });

      await gerarAvisos(semNumero.id);
      const resultado = await enviarAvisosNoWhatsapp(semNumero.id);

      expect(resultado.semNumero).toBe(true);
      expect(chamadas).toHaveLength(0);
      const zap = await comEscritorio(semNumero.id, (db) =>
        db.aviso.findFirst({ where: { canal: "WHATSAPP" } }),
      );
      expect(zap?.estado).toBe("PENDENTE");
      expect(zap?.tentativas).toBe(0);

      await expect(
        enviarModelo(semNumero.id, {
          para: "5571999990000",
          modelo: "x",
          parametros: ["y"],
        }),
      ).rejects.toBeInstanceOf(SemNumeroDeWhatsapp);
    } finally {
      await prismaPlataforma()
        .escritorio.delete({ where: { id: semNumero.id } })
        .catch(() => {});
    }
  });

  it("quem nao quer WhatsApp continua so no e-mail", async () => {
    await comEscritorio(alfa, (db) =>
      db.usuario.update({
        where: { id: usuarioAlfa },
        data: { recebeWhatsapp: false },
      }),
    );
    try {
      await comEscritorio(alfa, (db) => db.aviso.deleteMany({}));
      const resultado = await gerarAvisos(alfa);
      expect(resultado.resumos).toBe(1);

      const canais = await comEscritorio(alfa, (db) =>
        db.aviso.findMany({ select: { canal: true } }),
      );
      expect(canais.every((a) => a.canal === "EMAIL")).toBe(true);
    } finally {
      await comEscritorio(alfa, (db) =>
        db.usuario.update({
          where: { id: usuarioAlfa },
          data: { recebeWhatsapp: true },
        }),
      );
    }
  });

  it("telefone ilegivel nao vira aviso de WhatsApp", async () => {
    await comEscritorio(alfa, (db) =>
      db.usuario.update({
        where: { id: usuarioAlfa },
        data: { telefone: "99999-8888" },
      }),
    );
    try {
      await comEscritorio(alfa, (db) => db.aviso.deleteMany({}));
      await gerarAvisos(alfa);
      const zap = await comEscritorio(alfa, (db) =>
        db.aviso.count({ where: { canal: "WHATSAPP" } }),
      );
      // Melhor nao existir do que existir apontando para numero adivinhado.
      expect(zap).toBe(0);
    } finally {
      await comEscritorio(alfa, (db) =>
        db.usuario.update({
          where: { id: usuarioAlfa },
          data: { telefone: "(71) 99999-8888" },
        }),
      );
    }
  });

  it("falha de rede nao e definitiva", async () => {
    await expect(
      enviarModelo(alfa, {
        para: "5571999998888",
        modelo: "birdjud_resumo_publicacoes",
        parametros: ["a", "b", "c"],
      }).then(() => null),
    ).resolves.toBeNull();

    responder = () => ({
      status: 500,
      json: { error: { message: "Internal" } },
    });
    const erro = await enviarModelo(alfa, {
      para: "5571999998888",
      modelo: "birdjud_resumo_publicacoes",
      parametros: ["a", "b", "c"],
    }).catch((e) => e);
    expect(erro).toBeInstanceOf(FalhaNoWhatsapp);
    expect((erro as FalhaNoWhatsapp).definitivo).toBe(false);
  });
});
