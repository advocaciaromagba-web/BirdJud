// Tarefas contra o banco.
//
// O que estes testes protegem: o vinculo com o processo, que e o que faz a
// tarefa aparecer na ficha certa, e a volta do "Concluir" — errar o clique
// tem de ter conserto.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import {
  TarefaNaoEncontrada,
  apagarTarefa,
  contarTarefas,
  criarTarefa,
  editarTarefa,
  mudarSituacao,
  tarefasDoEscritorio,
} from "../src/lib/tarefas-do-escritorio";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

d("tarefas do escritorio", () => {
  let escritorio = "";
  let pessoa = "";
  let outraPessoa = "";
  const NUMERO = "1002327-74.2024.8.26.0222";

  beforeAll(async () => {
    const e = await prismaPlataforma().escritorio.create({
      data: { slug: `tarefas-${Date.now()}`, nome: "Banca das Tarefas" },
    });
    escritorio = e.id;
    await comEscritorio(escritorio, async (db) => {
      const a = await db.usuario.create({
        data: semEscritorio({
          nome: "Dra. Responsavel",
          email: `a-${Date.now()}@t.test`,
          senhaHash: "x",
          papel: "ADVOGADO",
        }),
      });
      const b = await db.usuario.create({
        data: semEscritorio({
          nome: "Secretaria",
          email: `b-${Date.now()}@t.test`,
          senhaHash: "x",
          papel: "USUARIO",
        }),
      });
      pessoa = a.id;
      outraPessoa = b.id;
      await db.processo.create({
        data: semEscritorio({ numero: NUMERO }),
      });
    });
  });

  afterAll(async () => {
    if (escritorio) {
      await prismaPlataforma()
        .escritorio.delete({ where: { id: escritorio } })
        .catch(() => {});
    }
    await prismaPlataforma().$disconnect();
  });

  const nova = (sobre: Record<string, unknown> = {}) =>
    criarTarefa(
      escritorio,
      {
        titulo: "Juntar documentos",
        vencimento: new Date("2026-11-10T17:00:00Z"),
        responsavelId: pessoa,
        ...sobre,
      } as Parameters<typeof criarTarefa>[1],
      pessoa,
    );

  it("liga ao processo quando o numero digitado existe", async () => {
    const t = await nova({ numeroProcesso: NUMERO });
    expect(t.processoId).not.toBeNull();
    expect(t.numeroProcesso).toBe(NUMERO);
  });

  it("guarda o numero mesmo sem processo cadastrado, para nao perder o vinculo", async () => {
    const t = await nova({ numeroProcesso: "9999999-99.2099.8.26.0000" });
    expect(t.processoId).toBeNull();
    expect(t.numeroProcesso).toBe("9999999-99.2099.8.26.0000");
  });

  it("prioridade fora da lista vira MEDIA em vez de ir crua para a coluna", async () => {
    const t = await nova({ prioridade: "GRAVISSIMA" });
    expect(t.prioridade).toBe("MEDIA");
  });

  it("concluir grava a data, e reabrir apaga: errar o clique tem volta", async () => {
    const t = await nova();
    const feita = await mudarSituacao(escritorio, t.id, "CONCLUIDA");
    expect(feita.situacao).toBe("CONCLUIDA");
    expect(feita.concluidaEm).not.toBeNull();

    const devolta = await mudarSituacao(escritorio, t.id, "PENDENTE");
    expect(devolta.situacao).toBe("PENDENTE");
    expect(devolta.concluidaEm).toBeNull();
  });

  it("a lista separa ativas de concluidas, e a contagem bate", async () => {
    const t = await nova({ titulo: "Para concluir" });
    await mudarSituacao(escritorio, t.id, "CONCLUIDA");

    const ativas = await tarefasDoEscritorio(escritorio, false);
    const feitas = await tarefasDoEscritorio(escritorio, true);
    expect(ativas.map((x) => x.id)).not.toContain(t.id);
    expect(feitas.map((x) => x.id)).toContain(t.id);

    const contagem = await contarTarefas(escritorio);
    expect(contagem.ativas).toBe(ativas.length);
    expect(contagem.concluidas).toBe(feitas.length);
  });

  it("editar troca o responsavel e refaz o vinculo do processo", async () => {
    const t = await nova({ numeroProcesso: null });
    const mudada = await editarTarefa(escritorio, t.id, {
      responsavelId: outraPessoa,
      numeroProcesso: NUMERO,
    });
    expect(mudada.responsavelId).toBe(outraPessoa);
    expect(mudada.processoId).not.toBeNull();
  });

  it("editar sem mexer no processo nao desfaz o vinculo", async () => {
    const t = await nova({ numeroProcesso: NUMERO });
    const mudada = await editarTarefa(escritorio, t.id, { titulo: "Outro titulo" });
    expect(mudada.processoId).toBe(t.processoId);
  });

  it("tarefa de outro escritorio nao e encontrada nem para apagar", async () => {
    await expect(
      apagarTarefa(escritorio, "id-que-nao-existe"),
    ).rejects.toBeInstanceOf(TarefaNaoEncontrada);
  });
});
