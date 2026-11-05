// Aviso de tarefa em duas entregas por dia (12h e 18h, Brasilia).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { descreverEntrega, proximaEntrega, quandoAvisarTarefa } from "../src/lib/janela-de-avisos";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { avisarTarefaDesignada, remarcarAvisoDaTarefa } from "../src/lib/avisos";

const br = (s: string) => new Date(`${s}-03:00`);

describe("a janela de entrega", () => {
  it("até o meio-dia sai às 12h; à tarde, às 18h; à noite, às 12h do dia seguinte", () => {
    expect(proximaEntrega(br("2026-11-05T08:30:00"))).toEqual(br("2026-11-05T12:00:00"));
    expect(proximaEntrega(br("2026-11-05T11:59:00"))).toEqual(br("2026-11-05T12:00:00"));
    expect(proximaEntrega(br("2026-11-05T12:00:00"))).toEqual(br("2026-11-05T18:00:00"));
    expect(proximaEntrega(br("2026-11-05T18:00:00"))).toEqual(br("2026-11-06T12:00:00"));
    expect(proximaEntrega(br("2026-11-05T23:50:00"))).toEqual(br("2026-11-06T12:00:00"));
    // Virada do mes e do ano.
    expect(proximaEntrega(br("2026-12-31T19:00:00"))).toEqual(br("2027-01-01T12:00:00"));
  });

  it("urgente com entrega hoje sai na hora", () => {
    const agora = br("2026-11-05T13:00:00");
    expect(quandoAvisarTarefa({ prioridade: "URGENTE", vencimento: br("2026-11-05T23:00:00") }, agora)).toBeNull();
    // Urgente para outro dia espera a janela.
    expect(quandoAvisarTarefa({ prioridade: "URGENTE", vencimento: br("2026-11-07T17:00:00") }, agora)).toEqual(br("2026-11-05T18:00:00"));
  });

  it("entrega que vence antes da janela sai na hora; a já vencida espera", () => {
    const agora = br("2026-11-05T13:00:00");
    expect(quandoAvisarTarefa({ prioridade: "MEDIA", vencimento: br("2026-11-05T15:00:00") }, agora)).toBeNull();
    expect(quandoAvisarTarefa({ prioridade: "MEDIA", vencimento: br("2026-11-05T10:00:00") }, agora)).toEqual(br("2026-11-05T18:00:00"));
    expect(quandoAvisarTarefa({ prioridade: "ALTA", vencimento: br("2026-11-06T17:00:00") }, agora)).toEqual(br("2026-11-05T18:00:00"));
  });

  it("descreve para a tela", () => {
    const agora = br("2026-11-05T13:00:00");
    expect(descreverEntrega(br("2026-11-05T18:00:00"), agora)).toBe("às 18h de hoje");
    expect(descreverEntrega(br("2026-11-06T12:00:00"), agora)).toBe("às 12h de amanhã");
    expect(descreverEntrega(br("2026-11-09T12:00:00"), agora)).toBe("às 12h de 09/11");
  });
});

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

d("aviso de tarefa no banco", () => {
  let escritorio = "";
  let quem = "";
  let chefe = "";

  beforeAll(async () => {
    const e = await prismaPlataforma().escritorio.create({ data: { slug: `janela-${Date.now()}`, nome: "Banca da Janela" } });
    escritorio = e.id;
    await comEscritorio(escritorio, async (db) => {
      quem = (await db.usuario.create({ data: semEscritorio({ nome: "Estagiária", email: `j-${Date.now()}@t.test`, senhaHash: "x", papel: "USUARIO" }) })).id;
      chefe = (await db.usuario.create({ data: semEscritorio({ nome: "Chefe", email: `c-${Date.now()}@t.test`, senhaHash: "x", papel: "ADMIN" }) })).id;
    });
  });

  afterAll(async () => {
    if (escritorio) await prismaPlataforma().escritorio.delete({ where: { id: escritorio } }).catch(() => {});
    await prismaPlataforma().$disconnect();
  });

  it("nasce com a hora da entrega e é remarcado quando vira urgente", async () => {
    const agora = br("2026-11-05T13:00:00");
    const t = await comEscritorio(escritorio, (db) =>
      db.tarefa.create({
        data: semEscritorio({ titulo: "Minutar contestação", vencimento: br("2026-11-05T22:00:00"), prioridade: "MEDIA", responsavelId: quem }),
      }),
    );
    expect(await avisarTarefaDesignada(escritorio, t.id, chefe, agora)).toBeGreaterThan(0);
    const avisos = () => comEscritorio(escritorio, (db) => db.aviso.findMany({ where: { tipo: "TAREFA_DESIGNADA" } }));
    expect((await avisos()).map((a) => a.liberarEm)).toEqual([br("2026-11-05T18:00:00")]);

    // Prioridade sem mudanca de dia continua na janela.
    expect(await remarcarAvisoDaTarefa(escritorio, t.id, agora)).toBe(0);

    await comEscritorio(escritorio, (db) => db.tarefa.update({ where: { id: t.id }, data: { prioridade: "URGENTE" } }));
    expect(await remarcarAvisoDaTarefa(escritorio, t.id, agora)).toBe(1);
    expect((await avisos()).map((a) => a.liberarEm)).toEqual([null]);
  });
});
