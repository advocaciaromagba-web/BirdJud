// Agenda x tarefas: a separacao e a trava.
//
// O que se prova: audiencia e pericia nao entram em Tarefas, peca e recurso
// nao entram na Agenda; a leitura de documento para tarefa traz o prazo
// calculado pelo SISTEMA, nao pela IA; e o que estava misturado antes da
// separacao passa para Tarefas sem sumir nada.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ehTipoDaAgenda,
  naturezaDoTitulo,
  recusaDaAgenda,
  recusaDeTarefa,
} from "../src/lib/natureza";
import {
  calcularPrazoDaLeitura,
  interpretar,
  montarInstrucao,
} from "../src/lib/leitura-documento";
import { fimDoDia } from "../src/lib/tarefas";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { separarAgendaETarefas } from "../src/lib/agenda-do-escritorio";

describe("natureza: o que e agenda e o que e tarefa", () => {
  it("audiencia, pericia e atendimento sao agenda", () => {
    expect(naturezaDoTitulo("Audiência de instrução")).toBe("AGENDA");
    expect(naturezaDoTitulo("Perícia médica")).toBe("AGENDA");
    expect(naturezaDoTitulo("Atendimento ao cliente")).toBe("AGENDA");
  });

  it("peca, manifestacao e recurso sao tarefa", () => {
    expect(naturezaDoTitulo("Contestação")).toBe("TAREFA");
    expect(naturezaDoTitulo("Manifestar sobre documentos")).toBe("TAREFA");
    expect(naturezaDoTitulo("Recurso de apelação")).toBe("TAREFA");
    expect(naturezaDoTitulo("Montar a inicial")).toBe("TAREFA");
  });

  it("titulo que fala das duas coisas nao decide sozinho", () => {
    // "quesitos para a pericia" e trabalho de escrever sobre uma pericia.
    expect(naturezaDoTitulo("Quesitos para a pericia")).toBeNull();
    expect(recusaDeTarefa("Quesitos para a pericia")).toBeNull();
  });

  it("a agenda recusa tarefa, pelo tipo e pelo titulo", () => {
    expect(recusaDaAgenda("TAREFA", "Qualquer coisa")).not.toBeNull();
    expect(recusaDaAgenda("PRAZO", "Qualquer coisa")).not.toBeNull();
    expect(recusaDaAgenda("COMPROMISSO", "Fazer contestacao")).not.toBeNull();
    expect(recusaDaAgenda("AUDIENCIA", "Audiencia de conciliacao")).toBeNull();
    expect(ehTipoDaAgenda("TAREFA")).toBe(false);
  });

  it("tarefas recusa audiencia e pericia", () => {
    expect(recusaDeTarefa("Audiencia de conciliacao")).not.toBeNull();
    expect(recusaDeTarefa("Pericia no local")).not.toBeNull();
    expect(recusaDeTarefa("Contestacao")).toBeNull();
  });

  it("prazo fatal vai para o fim do dia em Brasilia", () => {
    expect(fimDoDia("2026-11-25")?.toISOString()).toBe("2026-11-26T02:59:00.000Z");
    expect(fimDoDia("")).toBeNull();
    expect(fimDoDia("25/11")).toBeUndefined();
  });
});

describe("tarefa lendo o documento", () => {
  const resposta = JSON.stringify({
    campos: {
      titulo: { valor: "Contestacao", confianca: "ALTA", origem: "despacho" },
      dataDoAto: { valor: "03/11/2026", confianca: "ALTA" },
      prazoDias: { valor: "15 dias", confianca: "ALTA" },
      contagem: { valor: "uteis", confianca: "ALTA" },
      prazoFatal: { valor: "2026-12-31", confianca: "ALTA" },
    },
    observacoes: [],
  });

  it("a instrucao nao pede ao modelo o que o sistema calcula", () => {
    const instrucao = montarInstrucao("TAREFA");
    expect(instrucao).toContain('"prazoDias"');
    expect(instrucao).not.toContain('"prazoFatal"');
    expect(instrucao).not.toContain('"entrega"');
  });

  it("prazo fatal vindo da IA e descartado; o do sistema entra", () => {
    const lida = interpretar("TAREFA", resposta);
    expect(lida.campos.prazoFatal).toBeUndefined();
    expect(lida.campos.dataDoAto.valor).toBe("2026-11-03");
    expect(lida.campos.prazoDias.valor).toBe("15");
    expect(lida.campos.contagem.valor).toBe("UTEIS");

    const comPrazo = calcularPrazoDaLeitura(lida, "2026-11-03");
    // A mesma conta da triagem de publicacoes (testes/triagem-do-escritorio).
    expect(comPrazo.campos.prazoFatal.valor).toBe("2026-11-25");
    expect(comPrazo.campos.entrega.valor).toBe("2026-11-19");
    // Conta sobre leitura: nunca chega como "leitura clara".
    expect(comPrazo.campos.prazoFatal.confianca).toBe("MEDIA");
    expect(comPrazo.observacoes[0]).toMatch(/^Prazo:/);
  });

  it("sem os dias, nao inventa data", () => {
    const lida = interpretar(
      "TAREFA",
      JSON.stringify({ campos: { titulo: { valor: "Recurso" } }, observacoes: [] }),
    );
    expect(calcularPrazoDaLeitura(lida, "2026-11-03").campos.prazoFatal).toBeUndefined();
  });
});

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

d("o que estava misturado passa para Tarefas", () => {
  let escritorio = "";
  let admin = "";

  beforeAll(async () => {
    const e = await prismaPlataforma().escritorio.create({
      data: { slug: `separar-${Date.now()}`, nome: "Banca da Separacao" },
    });
    escritorio = e.id;
    admin = (
      await comEscritorio(escritorio, (db) =>
        db.usuario.create({
          data: semEscritorio({
            nome: "Dra. Separa",
            email: `dra-${Date.now()}@separa.test`,
            senhaHash: "x",
            papel: "ADMIN",
          }),
        }),
      )
    ).id;
  });

  afterAll(async () => {
    if (escritorio) {
      await prismaPlataforma().escritorio.delete({ where: { id: escritorio } }).catch(() => {});
    }
    await prismaPlataforma().$disconnect();
  });

  it("compromisso TAREFA + Prazo viram uma tarefa com entrega e fatal", async () => {
    const triagemId = await comEscritorio(escritorio, async (db) => {
      const c = await db.compromisso.create({
        data: semEscritorio({
          titulo: "Contestacao",
          tipo: "TAREFA",
          inicio: new Date("2026-11-19T12:00:00Z"),
          observacoes: "PRAZO FATAL: 25/11/2026.",
        }),
      });
      await db.prazo.create({
        data: semEscritorio({
          titulo: "Contestacao",
          termoInicial: new Date("2026-11-03"),
          dias: 15,
          inicioContagem: new Date("2026-11-04"),
          vencimento: new Date("2026-11-25"),
          explicacao: "15 dias uteis",
        }),
      });
      await db.compromisso.create({
        data: semEscritorio({ titulo: "Audiencia", tipo: "AUDIENCIA", inicio: new Date("2026-12-01T13:00:00Z") }),
      });
      const p = await db.publicacao.create({
        data: semEscritorio({
          texto: "Contestar em 15 dias.",
          dataDisponibilizacao: new Date("2026-11-03T12:00:00Z"),
          idExterno: `pub-${Date.now()}`,
        }),
      });
      const t = await db.triagemDePublicacao.create({
        data: semEscritorio({
          publicacaoId: p.id,
          especie: "TAREFA",
          tipo: "TAREFA",
          titulo: "Contestacao",
          resumo: "",
          confianca: "ALTA",
          compromissoId: c.id,
        }),
      });
      return t.id;
    });

    const r = await separarAgendaETarefas(escritorio);
    expect(r).toEqual({ deCompromissos: 1, dePrazos: 0 });

    await comEscritorio(escritorio, async (db) => {
      // Na agenda ficou so a audiencia.
      const agenda = await db.compromisso.findMany();
      expect(agenda.map((c) => c.tipo)).toEqual(["AUDIENCIA"]);

      const tarefa = await db.tarefa.findFirstOrThrow({ where: { titulo: "Contestacao" } });
      expect(tarefa.vencimento.toISOString()).toBe("2026-11-19T12:00:00.000Z");
      expect(tarefa.prazoFatal?.toISOString()).toBe("2026-11-26T02:59:00.000Z");
      expect(tarefa.responsavelId).toBe(admin);

      // Nada some sem registro.
      const excluido = await db.compromissoExcluido.findFirstOrThrow({ where: { titulo: "Contestacao" } });
      expect(excluido.motivo).toBe("VIROU_TAREFA");
      const prazo = await db.prazo.findFirstOrThrow({ where: { titulo: "Contestacao" } });
      expect(prazo.tarefaId).toBe(tarefa.id);
      const triagem = await db.triagemDePublicacao.findFirstOrThrow({ where: { id: triagemId } });
      expect(triagem.tarefaId).toBe(tarefa.id);
      expect(triagem.compromissoId).toBeNull();
    });
  });

  it("prazo solto vira tarefa propria; cumprido vira concluida", async () => {
    await comEscritorio(escritorio, (db) =>
      db.prazo.create({
        data: semEscritorio({
          titulo: "Recurso de apelacao",
          termoInicial: new Date("2026-10-01"),
          dias: 15,
          inicioContagem: new Date("2026-10-02"),
          vencimento: new Date("2026-10-22"),
          explicacao: "15 dias uteis",
          cumpridoEm: new Date("2026-10-20T15:00:00Z"),
        }),
      }),
    );
    expect(await separarAgendaETarefas(escritorio)).toEqual({ deCompromissos: 0, dePrazos: 1 });
    const t = await comEscritorio(escritorio, (db) =>
      db.tarefa.findFirstOrThrow({ where: { titulo: "Recurso de apelacao" } }),
    );
    expect(t.situacao).toBe("CONCLUIDA");
    expect(t.prazoFatal?.toISOString()).toBe("2026-10-23T02:59:00.000Z");
  });

  it("rodar de novo nao faz nada", async () => {
    expect(await separarAgendaETarefas(escritorio)).toEqual({ deCompromissos: 0, dePrazos: 0 });
  });
});
