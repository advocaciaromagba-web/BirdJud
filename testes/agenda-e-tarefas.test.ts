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
import { gerarLembretesDeTarefas } from "../src/lib/avisos";

describe("natureza: o que e agenda e o que e tarefa", () => {
  it("audiência, perícia e atendimento são agenda", () => {
    expect(naturezaDoTitulo("Audiência de instrução")).toBe("AGENDA");
    expect(naturezaDoTitulo("Perícia médica")).toBe("AGENDA");
    expect(naturezaDoTitulo("Atendimento ao cliente")).toBe("AGENDA");
  });

  it("peça, manifestação e recurso são tarefa", () => {
    expect(naturezaDoTitulo("Contestação")).toBe("TAREFA");
    expect(naturezaDoTitulo("Manifestar sobre documentos")).toBe("TAREFA");
    expect(naturezaDoTitulo("Recurso de apelação")).toBe("TAREFA");
    expect(naturezaDoTitulo("Montar a inicial")).toBe("TAREFA");
  });

  it("título que fala das duas coisas não decide sozinho", () => {
    // "quesitos para a pericia" e trabalho de escrever sobre uma pericia.
    expect(naturezaDoTitulo("Quesitos para a perícia")).toBeNull();
    expect(recusaDeTarefa("Quesitos para a perícia")).toBeNull();
  });

  it("a agenda recusa tarefa, pelo tipo e pelo título", () => {
    expect(recusaDaAgenda("TAREFA", "Qualquer coisa")).not.toBeNull();
    expect(recusaDaAgenda("PRAZO", "Qualquer coisa")).not.toBeNull();
    expect(recusaDaAgenda("COMPROMISSO", "Fazer contestação")).not.toBeNull();
    expect(recusaDaAgenda("AUDIENCIA", "Audiência de conciliação")).toBeNull();
    expect(ehTipoDaAgenda("TAREFA")).toBe(false);
  });

  it("tarefas recusa audiência e perícia", () => {
    expect(recusaDeTarefa("Audiência de conciliação")).not.toBeNull();
    expect(recusaDeTarefa("Perícia no local")).not.toBeNull();
    expect(recusaDeTarefa("Contestacao")).toBeNull();
  });

  it("prazo fatal vai para o fim do dia em Brasília", () => {
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

  it("a instrução não pede ao modelo o que o sistema calcula", () => {
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
    // A mesma conta da triagem de publicações (testes/triagem-do-escritorio).
    expect(comPrazo.campos.prazoFatal.valor).toBe("2026-11-25");
    expect(comPrazo.campos.entrega.valor).toBe("2026-11-19");
    // Conta sobre leitura: nunca chega como "leitura clara".
    expect(comPrazo.campos.prazoFatal.confianca).toBe("MEDIA");
    expect(comPrazo.observacoes[0]).toMatch(/^Prazo:/);
  });

  it("data de DISPONIBILIZACAO no diário: pública no útil seguinte e corre no útil depois", () => {
    const lida = interpretar(
      "TAREFA",
      JSON.stringify({
        campos: {
          titulo: { valor: "Contestacao", confianca: "ALTA" },
          dataDoAto: { valor: "03/11/2026", confianca: "ALTA" },
          tipoDaData: { valor: "disponibilização", confianca: "ALTA" },
          prazoDias: { valor: "15", confianca: "ALTA" },
          contagem: { valor: "uteis", confianca: "ALTA" },
        },
        observacoes: [],
      }),
    );
    expect(lida.campos.tipoDaData.valor).toBe("DISPONIBILIZACAO");
    const comPrazo = calcularPrazoDaLeitura(lida, "2026-11-03");
    // Um dia útil a mais que a intimação do teste acima (25/11).
    expect(comPrazo.campos.prazoFatal.valor).toBe("2026-11-26");
    expect(comPrazo.observacoes[0]).toContain("publicada em 04/11/2026");
  });

  it("sem os dias, não inventa data", () => {
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
          titulo: "Contestação",
          tipo: "TAREFA",
          inicio: new Date("2026-11-19T12:00:00Z"),
          observacoes: "PRAZO FATAL: 25/11/2026.",
        }),
      });
      await db.prazo.create({
        data: semEscritorio({
          titulo: "Contestação",
          termoInicial: new Date("2026-11-03"),
          dias: 15,
          inicioContagem: new Date("2026-11-04"),
          vencimento: new Date("2026-11-25"),
          explicacao: "15 dias úteis",
        }),
      });
      await db.compromisso.create({
        data: semEscritorio({ titulo: "Audiência", tipo: "AUDIENCIA", inicio: new Date("2026-12-01T13:00:00Z") }),
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
          titulo: "Contestação",
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

      const tarefa = await db.tarefa.findFirstOrThrow({ where: { titulo: "Contestação" } });
      expect(tarefa.vencimento.toISOString()).toBe("2026-11-19T12:00:00.000Z");
      expect(tarefa.prazoFatal?.toISOString()).toBe("2026-11-26T02:59:00.000Z");
      expect(tarefa.responsavelId).toBe(admin);

      // Nada some sem registro.
      const excluido = await db.compromissoExcluido.findFirstOrThrow({ where: { titulo: "Contestação" } });
      expect(excluido.motivo).toBe("VIROU_TAREFA");
      const prazo = await db.prazo.findFirstOrThrow({ where: { titulo: "Contestação" } });
      expect(prazo.tarefaId).toBe(tarefa.id);
      const triagem = await db.triagemDePublicacao.findFirstOrThrow({ where: { id: triagemId } });
      expect(triagem.tarefaId).toBe(tarefa.id);
      expect(triagem.compromissoId).toBeNull();
    });
  });

  it("prazo solto vira tarefa própria; cumprido vira concluída", async () => {
    await comEscritorio(escritorio, (db) =>
      db.prazo.create({
        data: semEscritorio({
          titulo: "Recurso de apelação",
          termoInicial: new Date("2026-10-01"),
          dias: 15,
          inicioContagem: new Date("2026-10-02"),
          vencimento: new Date("2026-10-22"),
          explicacao: "15 dias úteis",
          cumpridoEm: new Date("2026-10-20T15:00:00Z"),
        }),
      }),
    );
    expect(await separarAgendaETarefas(escritorio)).toEqual({ deCompromissos: 0, dePrazos: 1 });
    const t = await comEscritorio(escritorio, (db) =>
      db.tarefa.findFirstOrThrow({ where: { titulo: "Recurso de apelação" } }),
    );
    expect(t.situacao).toBe("CONCLUIDA");
    expect(t.prazoFatal?.toISOString()).toBe("2026-10-23T02:59:00.000Z");
  });

  it("rodar de novo não faz nada", async () => {
    expect(await separarAgendaETarefas(escritorio)).toEqual({ deCompromissos: 0, dePrazos: 0 });
  });
});

d("regua do prazo fatal: 4 dias úteis antes, véspera e o dia", () => {
  let escritorio = "";
  let draId = "";

  beforeAll(async () => {
    escritorio = (await prismaPlataforma().escritorio.create({
      data: { slug: `fatal-${Date.now()}`, nome: "Banca do Fatal" },
    })).id;
    await comEscritorio(escritorio, async (db) => {
      const dra = await db.usuario.create({
        data: semEscritorio({ nome: "Dra. Fatal", email: `fatal-${Date.now()}@f.test`, senhaHash: "x", papel: "ADMIN" }),
      });
      draId = dra.id;
      await db.tarefa.create({
        data: semEscritorio({
          titulo: "Contestação",
          // Entrega ja passou: so o fatal avisa daqui para a frente.
          vencimento: new Date("2026-10-19T12:00:00Z"),
          // Fatal na segunda 26/10/2026, fim do dia em Brasilia.
          prazoFatal: new Date("2026-10-27T02:59:00Z"),
          responsavelId: dra.id,
          criadoPorId: dra.id,
        }),
      });
    });
  });

  afterAll(async () => {
    if (escritorio) await prismaPlataforma().escritorio.delete({ where: { id: escritorio } }).catch(() => {});
    await prismaPlataforma().$disconnect();
  });

  const avisos = () =>
    comEscritorio(escritorio, (db) =>
      db.aviso.findMany({ where: { tipo: "LEMBRETE_TAREFA" }, select: { chave: true, assunto: true } }),
    );

  it("na madrugada espera; as 10h de terca (4 dias úteis antes) avisa uma vez", async () => {
    expect(await gerarLembretesDeTarefas(escritorio, new Date("2026-10-20T06:00:00Z"))).toBe(0);
    expect(await gerarLembretesDeTarefas(escritorio, new Date("2026-10-20T13:00:00Z"))).toBe(1);
    expect(await gerarLembretesDeTarefas(escritorio, new Date("2026-10-20T14:00:00Z"))).toBe(0);
    // Quarta: faltam 3, ainda o mesmo marco — nao repete.
    expect(await gerarLembretesDeTarefas(escritorio, new Date("2026-10-21T13:00:00Z"))).toBe(0);
    const [primeiro] = await avisos();
    expect(primeiro.chave).toContain("FATAL-4du");
    expect(primeiro.assunto).toContain("PRAZO FATAL, faltam 4 dias úteis: 26/10/2026");
  });

  it("duas tarefas da mesma pessoa no mesmo marco: UMA mensagem, com as duas", async () => {
    // Segunda tarefa com o mesmo fatal; na quinta (22/10) ela nasce, e so ela
    // esta pendente de aviso: sai sozinha. Na sexta as duas chegam a vespera
    // juntas: um aviso so, com a chave das duas.
    await comEscritorio(escritorio, (db) =>
      db.tarefa.create({
        data: semEscritorio({
          titulo: "Juntar procuração",
          vencimento: new Date("2026-10-19T12:00:00Z"),
          prazoFatal: new Date("2026-10-27T02:59:00Z"),
          responsavelId: draId,
          criadoPorId: draId,
        }),
      }),
    );
    expect(await gerarLembretesDeTarefas(escritorio, new Date("2026-10-22T13:00:00Z"))).toBe(1);
    const [, segundo] = await avisos();
    expect(segundo.chave).toContain("FATAL-4du");
    expect(segundo.chave.includes("|")).toBe(false);
  });

  it("na sexta (véspera útil) e na segunda (o dia) avisa de novo, uma mensagem por pessoa", async () => {
    expect(await gerarLembretesDeTarefas(escritorio, new Date("2026-10-23T13:00:00Z"))).toBe(1);
    expect(await gerarLembretesDeTarefas(escritorio, new Date("2026-10-26T13:00:00Z"))).toBe(1);
    const todos = await avisos();
    const agrupados = todos.filter((a) => a.chave.includes("|"));
    expect(agrupados).toHaveLength(2);
    expect(agrupados[0].assunto).toBe("Lembrete: 2 tarefas com prazo chegando");
    const chaves = todos.flatMap((a) => a.chave.split("|")).map((c) => c.split(":")[1]).sort();
    expect(chaves).toEqual(["FATAL-1du", "FATAL-1du", "FATAL-4du", "FATAL-4du", "FATAL-hoje", "FATAL-hoje"]);
  });

});
