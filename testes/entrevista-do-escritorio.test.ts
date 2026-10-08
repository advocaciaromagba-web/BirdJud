// A entrevista contra o banco, com um modelo de mentira no lugar da Anthropic.
//
// O QUE ESTES TESTES PROTEGEM:
//
// 1. a tela nunca fica sem roteiro — nem sem modulo de IA, nem com a API
//    fora do ar. Entrevista e conversa marcada: nao da para adiar porque um
//    servico de terceiro caiu;
// 2. reescrever a anotacao APAGA a analise anterior. Uma analise que descreve
//    um texto que nao existe mais e pior que nenhuma, porque parece conferida;
// 3. anotacao curta nao vira chamada paga. Com tres linhas a IA preencheria o
//    vazio inventando, que e exatamente o que o prompt proibe.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { ROTEIRO_BASICO, TranscricaoCurta } from "../src/lib/entrevista";
import {
  anotar,
  criarEntrevista,
  entrevistasDoEscritorio,
  gerarRoteiro,
  ligarAoCliente,
  organizar,
} from "../src/lib/entrevista-do-escritorio";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

/** Texto longo o bastante para valer uma organizacao. */
const RELATO = [
  "O cliente trabalhou cinco anos na fazenda sem registro em carteira.",
  "Saiu em marco de 2026, depois de uma discussao com o gerente.",
  "Nao recebeu aviso previo nem as ferias que tinha a receber.",
  "Disse que o colega do setor viu tudo e aceita testemunhar.",
  "Tem recibos de pagamento feitos a mao, guardados numa pasta em casa.",
].join(" ");

d("entrevista de triagem", () => {
  let escritorio = "";
  let servidor: Server;
  let saida: Record<string, unknown> = {};
  let chamadas = 0;
  let quebrado = false;

  beforeAll(async () => {
    servidor = createServer((req, res) => {
      let corpo = "";
      req.on("data", (p) => (corpo += p));
      req.on("end", () => {
        chamadas += 1;
        if (quebrado) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: "fora do ar" } }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "msg_teste",
            type: "message",
            role: "assistant",
            model: "claude-opus-5",
            content: [{ type: "text", text: JSON.stringify(saida) }],
            stop_reason: "end_turn",
            usage: { input_tokens: 1200, output_tokens: 400 },
          }),
        );
      });
    });
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    const porta = (servidor.address() as { port: number }).port;
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${porta}`;
    process.env.ANTHROPIC_API_KEY = "chave-de-teste";

    const e = await prismaPlataforma().escritorio.create({
      data: { slug: `entrevista-${Date.now()}`, nome: "Banca da Entrevista" },
    });
    escritorio = e.id;
    await comEscritorio(escritorio, (db) =>
      db.moduloContratado.create({
        data: semEscritorio({ modulo: "IA", ativo: true }),
      }),
    );
  });

  afterAll(async () => {
    delete process.env.ANTHROPIC_BASE_URL;
    if (escritorio) {
      await prismaPlataforma()
        .escritorio.delete({ where: { id: escritorio } })
        .catch(() => {});
    }
    await new Promise<void>((ok) => servidor.close(() => ok()));
    await prismaPlataforma().$disconnect();
  });

  beforeEach(() => {
    chamadas = 0;
    quebrado = false;
    saida = { perguntas: ["Quando foi dispensado?", "Tem recibo?"] };
  });

  /** Quanto de IA ja foi medido para este escritorio no mes. */
  async function medido(): Promise<number> {
    const linhas = await comEscritorio(escritorio, (db) =>
      db.consumoMensal.findMany({ where: { metrica: "IA_MIL_TOKENS" } }),
    );
    return linhas.reduce((soma, l) => soma + l.quantidade, 0);
  }

  async function nova(assunto = "Foi mandado embora sem receber") {
    return criarEntrevista(escritorio, {
      nome: "Pessoa Atendida",
      assunto,
      usuarioId: "usuario-de-teste",
    });
  }

  it("nasce sem cliente: quem procura o escritorio pode nao contratar", async () => {
    const e = await nova();
    expect(e.clienteId).toBeNull();
    expect(e.situacao).toBe("RASCUNHO");
  });

  it("o roteiro vem da IA e o consumo e medido", async () => {
    const e = await nova();
    const antes = await medido();
    const { perguntas, comIA } = await gerarRoteiro(escritorio, e.id, "u");
    expect(comIA).toBe(true);
    expect(perguntas).toEqual(["Quando foi dispensado?", "Tem recibo?"]);
    expect(await medido()).toBeGreaterThan(antes);
  });

  it("IA fora do ar nao deixa a entrevista sem roteiro", async () => {
    const e = await nova();
    quebrado = true;
    const { perguntas, comIA } = await gerarRoteiro(escritorio, e.id, "u");
    expect(comIA).toBe(false);
    expect(perguntas).toEqual([...ROTEIRO_BASICO]);
    const guardada = await comEscritorio(escritorio, (db) =>
      db.entrevista.findFirst({ where: { id: e.id } }),
    );
    expect(guardada?.situacao).toBe("ROTEIRO");
  });

  it("pedir o roteiro de novo substitui, nao empilha", async () => {
    const e = await nova();
    await gerarRoteiro(escritorio, e.id, "u");
    saida = { perguntas: ["Outra pergunta?"] };
    const { perguntas } = await gerarRoteiro(escritorio, e.id, "u");
    expect(perguntas).toEqual(["Outra pergunta?"]);
  });

  it("anotacao curta nao vira chamada paga", async () => {
    const e = await nova();
    await anotar(escritorio, e.id, "Foi demitido.");
    chamadas = 0;
    await expect(organizar(escritorio, e.id)).rejects.toBeInstanceOf(
      TranscricaoCurta,
    );
    expect(chamadas).toBe(0);
  });

  it("organiza a anotacao e guarda o texto original junto", async () => {
    const e = await nova();
    await anotar(escritorio, e.id, RELATO);
    saida = {
      area: "trabalhista",
      resumo: "Trabalhou sem registro e saiu sem receber.",
      fatos: ["Trabalhou cinco anos sem registro."],
      pretensoes: ["Receber as verbas"],
      documentosCitados: ["recibos feitos a mao"],
      documentosQueFaltam: ["CTPS"],
      testemunhas: ["colega do setor"],
      pontosDeAtencao: ["Conferir se ha risco de prescricao"],
      perguntasEmAberto: ["Qual era o salario?"],
      urgencia: "ALTA",
      valorEnvolvido: null,
    };
    const analise = await organizar(escritorio, e.id);
    expect(analise.area).toBe("trabalhista");
    expect(analise.urgencia).toBe("ALTA");

    const guardada = await comEscritorio(escritorio, (db) =>
      db.entrevista.findFirst({ where: { id: e.id } }),
    );
    expect(guardada?.situacao).toBe("ANALISADA");
    expect(guardada?.urgencia).toBe("ALTA");
    expect(guardada?.modelo).toBe("claude-opus-5");
    // O que foi dito continua la: sem ele ninguem confere a organizacao.
    expect(guardada?.transcricao).toBe(RELATO);
  });

  it("urgencia fora da lista vira MEDIA, em vez de ir crua para a coluna", async () => {
    const e = await nova();
    await anotar(escritorio, e.id, RELATO);
    saida = {
      area: "civel",
      resumo: "x",
      fatos: [],
      pretensoes: [],
      documentosCitados: [],
      documentosQueFaltam: [],
      testemunhas: [],
      pontosDeAtencao: [],
      perguntasEmAberto: [],
      urgencia: "GRAVISSIMA",
      valorEnvolvido: null,
    };
    const analise = await organizar(escritorio, e.id);
    expect(analise.urgencia).toBe("MEDIA");
  });

  it("reescrever a anotacao apaga a analise: ela descrevia outro texto", async () => {
    const e = await nova();
    await anotar(escritorio, e.id, RELATO);
    saida = {
      area: "trabalhista",
      resumo: "x",
      fatos: [],
      pretensoes: [],
      documentosCitados: [],
      documentosQueFaltam: [],
      testemunhas: [],
      pontosDeAtencao: [],
      perguntasEmAberto: [],
      urgencia: "BAIXA",
      valorEnvolvido: null,
    };
    await organizar(escritorio, e.id);

    await anotar(escritorio, e.id, `${RELATO} Depois disso, mudou tudo.`);
    const guardada = await comEscritorio(escritorio, (db) =>
      db.entrevista.findFirst({ where: { id: e.id } }),
    );
    expect(guardada?.analise).toBeNull();
    expect(guardada?.urgencia).toBeNull();
    expect(guardada?.situacao).toBe("ANOTADA");
  });

  it("liga ao cliente quando o caso e aceito", async () => {
    const e = await nova();
    const cliente = await comEscritorio(escritorio, (db) =>
      db.cliente.create({ data: semEscritorio({ nome: "Virou Cliente" }) }),
    );
    const ligada = await ligarAoCliente(escritorio, e.id, cliente.id);
    expect(ligada.clienteId).toBe(cliente.id);
  });

  it("a lista nao traz as arquivadas", async () => {
    const e = await nova("Assunto que foi arquivado");
    await comEscritorio(escritorio, (db) =>
      db.entrevista.update({
        where: { id: e.id },
        data: { situacao: "ARQUIVADA" },
      }),
    );
    const lista = await entrevistasDoEscritorio(escritorio);
    expect(lista.map((x) => x.id)).not.toContain(e.id);
  });
});
