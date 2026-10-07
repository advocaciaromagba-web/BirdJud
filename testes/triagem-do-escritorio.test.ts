// A triagem contra o banco, com um modelo de mentira no lugar da Anthropic.
//
// O QUE ESTES TESTES PROTEGEM: a data. A IA diz quantos DIAS o texto menciona;
// quem diz que DIA isso e, com feriado e dia util, e o sistema. Trocar essas
// duas linhas e o jeito de perder um prazo sem erro nenhum aparecer.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import {
  aceitarTriagem,
  recusarTriagem,
  triarPendentes,
  triarPublicacao,
} from "../src/lib/triagem-do-escritorio";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

d("triagem da publicacao", () => {
  let escritorio = "";
  let servidor: Server;
  let saida: Record<string, unknown> = {};
  let chamadas = 0;
  /** Quando true, o modelo responde erro — e o sistema tem de se virar. */
  let quebrado = false;

  const PUBLICADA_EM = new Date("2026-11-03T12:00:00Z");

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
            usage: { input_tokens: 900, output_tokens: 200 },
          }),
        );
      });
    });
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    const porta = (servidor.address() as { port: number }).port;
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${porta}`;
    process.env.ANTHROPIC_API_KEY = "chave-de-teste";

    const e = await prismaPlataforma().escritorio.create({
      data: { slug: `triagem-${Date.now()}`, nome: "Banca da Triagem" },
    });
    escritorio = e.id;
    await comEscritorio(escritorio, async (db) => {
      for (const modulo of ["IA", "PUBLICACOES_DJEN"]) {
        await db.moduloContratado.create({
          data: semEscritorio({ modulo, ativo: true }),
        });
      }
    });
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
    saida = {
      especie: "TAREFA",
      tipo: "TAREFA",
      titulo: "Contestacao",
      resumo: "Citada a parte re para contestar.",
      prazoDias: 15,
      contagem: "UTEIS",
      dataDoAto: null,
      confianca: "ALTA",
      atencao: null,
    };
  });

  let n = 0;
  async function publicacao(texto: string) {
    n += 1;
    return comEscritorio(escritorio, (db) =>
      db.publicacao.create({
        data: semEscritorio({
          idExterno: `pub-${Date.now()}-${n}`,
          texto,
          dataDisponibilizacao: PUBLICADA_EM,
        }),
      }),
    );
  }

  it("A DATA SAI DO SISTEMA, nao da IA", async () => {
    // A IA so disse "15 dias". O vencimento abaixo so esta certo porque o
    // calculo pulou fins de semana e feriados — inclusive 20/11, Consciencia
    // Negra, que um modelo de linguagem esquece com frequencia.
    const p = await publicacao("Citada para contestar no prazo de 15 dias.");
    const t = await triarPublicacao(escritorio, p.id);

    expect(t.especie).toBe("TAREFA");
    expect(t.prazoFatal?.toISOString().slice(0, 10)).toBe("2026-11-25");
    // Tres dias uteis antes do fatal, pulando o feriado de 20/11.
    expect(t.prazoSugerido?.toISOString().slice(0, 10)).toBe("2026-11-19");
    expect(t.explicacao).toBeTruthy();
  });

  it("audiencia com data marcada vira agendamento naquela data", async () => {
    saida = {
      especie: "AGENDAMENTO",
      tipo: "AUDIENCIA",
      titulo: "Audiencia de instrucao",
      resumo: "Designada audiencia.",
      prazoDias: null,
      contagem: "UTEIS",
      dataDoAto: "2026-12-10T14:30",
      confianca: "ALTA",
      atencao: "O cliente precisa comparecer.",
    };
    const p = await publicacao("Designo audiencia para 10/12/2026 as 14h30.");
    const t = await triarPublicacao(escritorio, p.id);

    expect(t.especie).toBe("AGENDAMENTO");
    expect(t.tipo).toBe("AUDIENCIA");
    expect(t.dataDoAto?.toISOString()).toBe("2026-12-10T17:30:00.000Z");
    expect(t.atencao).toContain("comparecer");
  });

  it("DATA NO PASSADO e descartada, nao agendada", async () => {
    // Publicacao velha reprocessada encheria a agenda de audiencias que ja
    // aconteceram, e ninguem mais olharia a agenda.
    saida = { ...saida, especie: "AGENDAMENTO", tipo: "AUDIENCIA", dataDoAto: "2020-01-02T10:00", prazoDias: null };
    const p = await publicacao("Audiencia designada ha muito tempo.");
    const t = await triarPublicacao(escritorio, p.id);
    expect(t.dataDoAto).toBeNull();
  });

  it("IA fora do ar nao deixa a publicacao sem sugestao", async () => {
    // A lista sem sugestao e a lista de antes, e e dela que o prazo escapa.
    // A sugestao simples sai de palavra-chave, e a confianca BAIXA e o aviso
    // disso para quem le.
    quebrado = true;
    const p = await publicacao("Fica designada audiencia de conciliacao.");
    const t = await triarPublicacao(escritorio, p.id);
    expect(t.especie).toBe("AGENDAMENTO");
    expect(t.tipo).toBe("AUDIENCIA");
    expect(t.confianca).toBe("BAIXA");
  });

  it("aceitar cria o compromisso na data sugerida E o prazo no fatal", async () => {
    const p = await publicacao("Citada para contestar no prazo de 15 dias.");
    const t = await triarPublicacao(escritorio, p.id);
    const aceite = await aceitarTriagem(escritorio, t.id);

    expect(aceite.prazoId).not.toBeNull();
    const c = await comEscritorio(escritorio, (db) =>
      db.compromisso.findFirstOrThrow({ where: { id: aceite.compromissoId } }),
    );
    // O compromisso na data de trabalhar...
    expect(c.inicio.toISOString().slice(0, 10)).toBe("2026-11-19");
    expect(c.tipo).toBe("TAREFA");
    // ...e o fatal escrito nas observacoes, para quem abrir a agenda ver.
    expect(c.observacoes).toContain("PRAZO FATAL: 25/11/2026");

    // O prazo de verdade, na tela de Prazos, vence no fatal.
    const prazo = await comEscritorio(escritorio, (db) =>
      db.prazo.findFirstOrThrow({ where: { id: aceite.prazoId! } }),
    );
    expect(prazo.vencimento.toISOString().slice(0, 10)).toBe("2026-11-25");

    // E a publicacao sai da lista de abertas.
    const depois = await comEscritorio(escritorio, (db) =>
      db.publicacao.findFirstOrThrow({ where: { id: p.id } }),
    );
    expect(depois.lida).toBe(true);
  });

  it("aceitar duas vezes nao cria dois compromissos", async () => {
    const p = await publicacao("Manifeste-se em 5 dias.");
    const t = await triarPublicacao(escritorio, p.id);
    const um = await aceitarTriagem(escritorio, t.id);
    const dois = await aceitarTriagem(escritorio, t.id);
    expect(dois.compromissoId).toBe(um.compromissoId);
  });

  it("triar de novo refaz a sugestao, mas nao mexe na ja aceita", async () => {
    const p = await publicacao("Manifeste-se em 5 dias.");
    const t = await triarPublicacao(escritorio, p.id);
    await aceitarTriagem(escritorio, t.id);

    saida = { ...saida, titulo: "Outra coisa", especie: "AGENDAMENTO" };
    const refeita = await triarPublicacao(escritorio, p.id);
    expect(refeita.titulo).not.toBe("Outra coisa");
  });

  it("recusar tira a sugestao da frente sem apagar a publicacao", async () => {
    const p = await publicacao("Publicado o acordao.");
    const t = await triarPublicacao(escritorio, p.id);
    await recusarTriagem(escritorio, t.id);
    const linha = await comEscritorio(escritorio, (db) =>
      db.triagemDePublicacao.findFirstOrThrow({ where: { id: t.id } }),
    );
    expect(linha.recusadaEm).not.toBeNull();
    expect(
      await comEscritorio(escritorio, (db) =>
        db.publicacao.count({ where: { id: p.id } }),
      ),
    ).toBe(1);
  });

  it("a rotina tria so o que falta, e nao gasta IA de novo no que ja tem", async () => {
    await publicacao("Manifeste-se em 10 dias, nova.");
    await publicacao("Contestar em 15 dias, nova tambem.");
    chamadas = 0;
    const feitas = await triarPendentes(escritorio);
    expect(feitas).toBeGreaterThanOrEqual(2);
    const gastas = chamadas;

    chamadas = 0;
    expect(await triarPendentes(escritorio)).toBe(0);
    expect(chamadas).toBe(0);
    expect(gastas).toBeGreaterThan(0);
  });
});
