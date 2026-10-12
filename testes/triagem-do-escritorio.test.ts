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
  let advogada = "";
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
      const u = await db.usuario.create({
        data: semEscritorio({
          nome: "Dra. Triagem",
          email: `dra-${Date.now()}@triagem.test`,
          senhaHash: "x",
          papel: "ADMIN",
        }),
      });
      advogada = u.id;
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

  it("aceitar peca cria TAREFA com entrega na sugerida e prazo fatal no fatal", async () => {
    const p = await publicacao("Citada para contestar no prazo de 15 dias.");
    const t = await triarPublicacao(escritorio, p.id);
    const aceite = await aceitarTriagem(escritorio, t.id, {}, advogada);

    // Contestacao e trabalho de escrever: vai para Tarefas, nunca para a agenda.
    expect(aceite.compromissoId).toBeNull();
    expect(aceite.tarefaId).not.toBeNull();
    const tarefa = await comEscritorio(escritorio, (db) =>
      db.tarefa.findFirstOrThrow({ where: { id: aceite.tarefaId! } }),
    );
    // A entrega na data de trabalhar...
    expect(tarefa.vencimento.toISOString().slice(0, 10)).toBe("2026-11-19");
    // ...e o fatal na mesma linha, no fim do dia.
    expect(tarefa.prazoFatal?.toISOString()).toBe("2026-11-26T02:59:00.000Z");
    // Ninguem escolhido: fica com quem aceitou.
    expect(tarefa.responsavelId).toBe(advogada);
    expect(tarefa.descricao).toContain("PRAZO FATAL: 25/11/2026");
    expect(
      await comEscritorio(escritorio, (db) => db.compromisso.count()),
    ).toBe(0);

    // E a publicacao sai da lista de abertas.
    const depois = await comEscritorio(escritorio, (db) =>
      db.publicacao.findFirstOrThrow({ where: { id: p.id } }),
    );
    expect(depois.lida).toBe(true);
  });

  it("tarefa sem responsavel e sem quem aceitou e recusada", async () => {
    const p = await publicacao("Manifeste-se em 5 dias, sem dono.");
    const t = await triarPublicacao(escritorio, p.id);
    await expect(aceitarTriagem(escritorio, t.id)).rejects.toThrow("Escolha quem vai fazer");
  });

  it("aceitar audiencia cria COMPROMISSO na agenda, nao tarefa", async () => {
    const antes = saida;
    saida = { ...saida, especie: "AGENDAMENTO", tipo: "AUDIENCIA", titulo: "Audiencia de conciliacao", dataDoAto: "2026-12-10T14:00", prazoDias: null };
    const p = await publicacao("Fica designada audiencia de conciliacao para 10/12/2026 as 14h.");
    const t = await triarPublicacao(escritorio, p.id);
    const aceite = await aceitarTriagem(escritorio, t.id, {}, advogada);
    saida = antes;
    expect(aceite.tarefaId).toBeNull();
    const c = await comEscritorio(escritorio, (db) =>
      db.compromisso.findFirstOrThrow({ where: { id: aceite.compromissoId! } }),
    );
    expect(c.tipo).toBe("AUDIENCIA");
  });

  it("aceitar duas vezes nao cria duas tarefas", async () => {
    const p = await publicacao("Manifeste-se em 5 dias.");
    const t = await triarPublicacao(escritorio, p.id);
    const um = await aceitarTriagem(escritorio, t.id, {}, advogada);
    const dois = await aceitarTriagem(escritorio, t.id, {}, advogada);
    expect(um.tarefaId).not.toBeNull();
    expect(dois.tarefaId).toBe(um.tarefaId);
  });

  it("triar de novo refaz a sugestao, mas nao mexe na ja aceita", async () => {
    const p = await publicacao("Manifeste-se em 5 dias.");
    const t = await triarPublicacao(escritorio, p.id);
    await aceitarTriagem(escritorio, t.id, {}, advogada);

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
