// Modulo de IA: instrucoes, medicao de consumo e tratamento de recusa.
//
// A API da Anthropic e servida por um HTTP local, entao os testes conferem o
// que o sistema MANDA e o que faz com o que volta — sem chave e sem gastar.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import {
  EntradaLongaDemais,
  IARecusou,
  LIMITE_DE_CARACTERES,
  milTokens,
  pedir,
  pedirEGravar,
  SemChaveDeIA,
} from "../src/lib/ia";
import {
  entradaDaAnalise,
  entradaDaMinuta,
  SISTEMA_ANALISE,
  SISTEMA_MINUTA,
} from "../src/lib/prompts-ia";
import { consumoDoMes } from "../src/lib/consumo";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

describe("instrucoes da IA", () => {
  it("proibem inventar fundamentacao — a regra que mais importa aqui", () => {
    for (const sistema of [SISTEMA_ANALISE, SISTEMA_MINUTA]) {
      expect(sistema).toContain("NUNCA invente numero de lei");
      expect(sistema).toContain("RASCUNHO");
    }
  });

  it("tratam prazo como indicacao a conferir, nunca como afirmacao", () => {
    expect(SISTEMA_ANALISE).toContain("(conferir nos autos)");
    expect(SISTEMA_ANALISE).toContain("nunca afirmacao");
  });

  it("a entrada da analise leva o contexto do processo junto do texto", () => {
    const entrada = entradaDaAnalise({
      texto: "Intimacao para manifestar-se.",
      numeroProcesso: "00012345620268260100",
      tribunal: "TJSP",
      orgao: "1a Vara Civel",
    });
    expect(entrada).toContain("Processo: 00012345620268260100");
    expect(entrada).toContain("TJSP");
    expect(entrada).toContain("Intimacao para manifestar-se.");
  });

  it("a entrada da minuta separa o que o juizo disse do que o advogado pediu", () => {
    const entrada = entradaDaMinuta({
      texto: "Manifeste-se sobre os embargos.",
      numeroProcesso: null,
      tribunal: null,
      orgao: null,
      cliente: "Cliente Exemplo",
      instrucao: "Impugnar os embargos por intempestividade.",
    });
    expect(entrada).toContain("Publicacao a que se responde:");
    expect(entrada).toContain("Instrucao do advogado:");
    expect(entrada).toContain("Cliente Exemplo");
    // Sem numero de processo, a linha simplesmente nao aparece.
    expect(entrada).not.toContain("Processo:");
  });
});

describe("unidade de cobranca", () => {
  it("conta milhares de tokens, arredondando para cima", () => {
    // Um centavo por token seria centenas de vezes o custo do modelo; a
    // unidade da fatura e o milhar.
    expect(milTokens(500, 200)).toBe(1);
    expect(milTokens(1000, 1)).toBe(2);
    expect(milTokens(3000, 2000)).toBe(5);
  });

  it("chamada minuscula ainda conta como um milhar", () => {
    expect(milTokens(1, 1)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// API da Anthropic servida localmente
// ---------------------------------------------------------------------------

type Resposta = { status: number; json: unknown };

let servidor: Server;
let recebido: { corpo: Record<string, unknown>; cabecalhos: Record<string, unknown> } | null = null;
let responder: () => Resposta = () => ({ status: 200, json: {} });

function respostaDoModelo(texto: string, extras: Record<string, unknown> = {}): Resposta {
  return {
    status: 200,
    json: {
      id: "msg_teste",
      type: "message",
      role: "assistant",
      model: "claude-opus-5",
      content: [{ type: "text", text: texto }],
      stop_reason: "end_turn",
      usage: { input_tokens: 1200, output_tokens: 800 },
      ...extras,
    },
  };
}

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let corpo = "";
    req.on("data", (p) => (corpo += p));
    req.on("end", () => {
      recebido = { corpo: JSON.parse(corpo || "{}"), cabecalhos: req.headers };
      const resposta = responder();
      res.writeHead(resposta.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(resposta.json));
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  const porta = (servidor.address() as { port: number }).port;
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${porta}`;
  process.env.ANTHROPIC_API_KEY = "chave-de-teste";
});

afterAll(async () => {
  await new Promise<void>((ok) => servidor.close(() => ok()));
});

beforeEach(() => {
  recebido = null;
  responder = () => respostaDoModelo("RESUMO\nIntimacao para manifestacao.");
});

describe("chamada ao modelo", () => {
  it("manda o modelo, o teto de saida e o esforco pedido", async () => {
    await pedir(SISTEMA_ANALISE, "Publicacao qualquer", "low");
    expect(recebido?.corpo.model).toBe("claude-opus-5");
    expect(recebido?.corpo.max_tokens).toBe(16000);
    expect(recebido?.corpo.output_config).toMatchObject({ effort: "low" });
  });

  it("liga o fallback de recusa", async () => {
    await pedir(SISTEMA_ANALISE, "Publicacao qualquer");
    // Texto de processo criminal ou de familia toca assunto pesado; sem o
    // fallback, o advogado veria o sistema simplesmente falhar.
    expect(recebido?.corpo.fallbacks).toBe("default");
    expect(String(recebido?.cabecalhos["anthropic-beta"])).toContain(
      "server-side-fallback-2026-07-01"
    );
  });

  it("marca o sistema para cache: ele nao muda entre chamadas", async () => {
    await pedir(SISTEMA_ANALISE, "Publicacao qualquer");
    const sistema = recebido?.corpo.system as { cache_control?: unknown }[];
    expect(sistema[0]?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("devolve o texto e conta os tokens, somando o que veio do cache", async () => {
    responder = () =>
      respostaDoModelo("RESUMO\nOk.", {
        usage: { input_tokens: 300, output_tokens: 200, cache_read_input_tokens: 900 },
      });

    const resultado = await pedir(SISTEMA_ANALISE, "Publicacao");
    expect(resultado.texto).toContain("RESUMO");
    // Token lido do cache custa menos, mas nao e de graca: entra na conta.
    expect(resultado.tokensEntrada).toBe(1200);
    expect(resultado.tokensSaida).toBe(200);
  });

  it("registra o modelo que REALMENTE respondeu", async () => {
    responder = () => respostaDoModelo("Ok.", { model: "claude-opus-4-8" });
    const resultado = await pedir(SISTEMA_ANALISE, "Publicacao");
    // Com fallback, quem responde pode nao ser quem foi pedido — e a peca
    // precisa poder ser auditada.
    expect(resultado.modelo).toBe("claude-opus-4-8");
  });

  it("recusa do modelo vira erro proprio, nao texto vazio", async () => {
    responder = () => ({
      status: 200,
      json: {
        id: "msg_r",
        type: "message",
        role: "assistant",
        model: "claude-opus-5",
        content: [],
        stop_reason: "refusal",
        stop_details: { type: "refusal", category: "bio" },
        usage: { input_tokens: 10, output_tokens: 0 },
      },
    });

    await expect(pedir(SISTEMA_ANALISE, "Publicacao")).rejects.toBeInstanceOf(IARecusou);
  });

  it("entrada longa demais e barrada ANTES de virar chamada paga", async () => {
    const gigante = "a".repeat(LIMITE_DE_CARACTERES + 1);
    await expect(pedir(SISTEMA_ANALISE, gigante)).rejects.toBeInstanceOf(EntradaLongaDemais);
    expect(recebido).toBeNull();
  });
});

describe("sem chave configurada", () => {
  it("recusa a chamada com erro proprio, sem tocar na rede", async () => {
    const chave = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    recebido = null;
    try {
      await expect(pedir(SISTEMA_ANALISE, "Publicacao")).rejects.toBeInstanceOf(SemChaveDeIA);
      // Falta de configuracao da plataforma e 503, nao erro de quem pediu.
      await expect(pedir(SISTEMA_ANALISE, "Publicacao")).rejects.toMatchObject({ status: 503 });
      expect(recebido).toBeNull();
    } finally {
      process.env.ANTHROPIC_API_KEY = chave;
    }
  });
});

let escritorio = "";
let usuarioId = "";
const marca = Date.now();

d("analise gravada e medida", () => {
  beforeAll(async () => {
    const e = await prismaPlataforma().escritorio.create({
      data: { slug: `ia-${marca}`, nome: "Escritorio da IA" },
    });
    escritorio = e.id;
    const usuario = await comEscritorio(escritorio, (db) =>
      db.usuario.create({
        data: semEscritorio({
          nome: "Dra. IA",
          email: "dra@ia.adv.br",
          senhaHash: "hash",
          papel: "ADMIN",
        }),
      })
    );
    usuarioId = usuario.id;
  });

  afterAll(async () => {
    if (escritorio) {
      await prismaPlataforma().escritorio.delete({ where: { id: escritorio } }).catch(() => {});
    }
    await prismaPlataforma().$disconnect();
  });

  it("grava o resultado com os tokens e mede o consumo", async () => {
    responder = () =>
      respostaDoModelo("RESUMO\nIntimacao.", {
        usage: { input_tokens: 2000, output_tokens: 1500 },
      });

    const analise = await pedirEGravar({
      escritorioId: escritorio,
      usuarioId,
      tipo: "ANALISE_PUBLICACAO",
      sistema: SISTEMA_ANALISE,
      entrada: "Publicacao",
    });
    expect(analise.texto).toContain("RESUMO");

    const gravada = await comEscritorio(escritorio, (db) =>
      db.analiseIA.findFirstOrThrow({ where: { id: analise.id } })
    );
    expect(gravada).toMatchObject({
      tipo: "ANALISE_PUBLICACAO",
      tokensEntrada: 2000,
      tokensSaida: 1500,
      modelo: "claude-opus-5",
    });

    const consumo = await consumoDoMes(escritorio);
    const ia = consumo.find((l) => l.metrica === "IA_MIL_TOKENS");
    expect(ia?.quantidade).toBe(4); // 3500 tokens -> 4 milhares
  });

  it("uma segunda analise soma ao consumo do mes", async () => {
    responder = () =>
      respostaDoModelo("RESUMO\nOutra.", {
        usage: { input_tokens: 1000, output_tokens: 1000 },
      });

    await pedirEGravar({
      escritorioId: escritorio,
      usuarioId,
      tipo: "ANALISE_PUBLICACAO",
      sistema: SISTEMA_ANALISE,
      entrada: "Outra publicacao",
    });

    const consumo = await consumoDoMes(escritorio);
    const ia = consumo.find((l) => l.metrica === "IA_MIL_TOKENS");
    expect(ia?.quantidade).toBe(6); // 4 + 2
  });

  it("a analise de um escritorio nao aparece no outro", async () => {
    const outro = await prismaPlataforma().escritorio.create({
      data: { slug: `ia-b-${marca}`, nome: "Outro" },
    });
    try {
      await expect(comEscritorio(outro.id, (db) => db.analiseIA.count())).resolves.toBe(0);
    } finally {
      await prismaPlataforma().escritorio.delete({ where: { id: outro.id } }).catch(() => {});
    }
  });
});
