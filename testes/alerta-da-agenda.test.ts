// Alerta sonoro da agenda: 1 hora e 15 minutos antes, na tela de quem esta
// marcado.
//
// O que se prova: toca nas duas antecedencias e uma vez so cada; quem marca
// em cima da hora ouve so o de 15; remarcar toca de novo; so o responsavel
// (ou todos, sem responsavel) recebe; concluido, tarefa e o que ja passou
// ficam de fora; outro escritorio nao enxerga; o som liga e desliga.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import {
  alertasDevidos,
  textoDoQuantoFalta,
  type ProximoCompromisso,
} from "../src/lib/alerta-da-agenda";
import { proximosDoUsuario } from "../src/lib/proximos-da-agenda";

const MIN = 60_000;
const BASE = Date.parse("2026-10-20T14:00:00Z");
const c = (id: string, inicio: number): ProximoCompromisso => ({
  id,
  titulo: "Audiencia de conciliacao",
  tipo: "AUDIENCIA",
  inicio: new Date(inicio).toISOString(),
  local: null,
  link: null,
});

describe("quando o alerta toca", () => {
  const audiencia = c("a1", BASE);

  it("nada antes de faltar 1 hora", () => {
    expect(alertasDevidos([audiencia], BASE - 61 * MIN, new Set())).toEqual([]);
  });

  it("toca com 1 hora e com 15 minutos, uma vez cada", () => {
    const umaHora = alertasDevidos([audiencia], BASE - 60 * MIN, new Set());
    expect(umaHora).toHaveLength(1);
    expect(umaHora[0].antecedencia).toBe(60);
    expect(textoDoQuantoFalta(umaHora[0].faltamMinutos)).toBe("Falta 1 hora");

    const tocados = new Set([umaHora[0].chave]);
    expect(alertasDevidos([audiencia], BASE - 40 * MIN, tocados)).toEqual([]);

    const quinze = alertasDevidos([audiencia], BASE - 15 * MIN, tocados);
    expect(quinze).toHaveLength(1);
    expect(quinze[0].antecedencia).toBe(15);
    expect(textoDoQuantoFalta(quinze[0].faltamMinutos)).toBe("Faltam 15 minutos");
    tocados.add(quinze[0].chave);
    expect(alertasDevidos([audiencia], BASE - 5 * MIN, tocados)).toEqual([]);
  });

  it("marcado em cima da hora: so o de 15, nao os dois", () => {
    const devidos = alertasDevidos([audiencia], BASE - 10 * MIN, new Set());
    expect(devidos.map((d) => d.antecedencia)).toEqual([15]);
    expect(textoDoQuantoFalta(devidos[0].faltamMinutos)).toBe("Faltam 10 minutos");
  });

  it("ja comecou: nao toca", () => {
    expect(alertasDevidos([audiencia], BASE + MIN, new Set())).toEqual([]);
  });

  it("remarcado: toca de novo no horario novo", () => {
    const tocados = new Set(alertasDevidos([audiencia], BASE - 60 * MIN, new Set()).map((d) => d.chave));
    const remarcada = c("a1", BASE + 2 * 60 * MIN);
    expect(alertasDevidos([remarcada], BASE + 60 * MIN, tocados)).toHaveLength(1);
  });
});

const temBanco = Boolean(process.env.DATABASE_URL);
(temBanco ? describe : describe.skip)("o que vem para cada pessoa", () => {
  let escritorio = "";
  let outro = "";
  let dra = "";
  let dr = "";
  const agora = new Date(Date.now() + 365 * 24 * 60 * MIN);
  const em = (min: number) => new Date(agora.getTime() + min * MIN);

  beforeAll(async () => {
    const [e, o] = await Promise.all([
      prismaPlataforma().escritorio.create({ data: { slug: `alerta-${Date.now()}`, nome: "Banca do Alerta" } }),
      prismaPlataforma().escritorio.create({ data: { slug: `alerta-outro-${Date.now()}`, nome: "Outra Banca" } }),
    ]);
    escritorio = e.id;
    outro = o.id;
    [dra, dr] = await comEscritorio(escritorio, async (db) => {
      const a = await db.usuario.create({ data: semEscritorio({ nome: "Dra. Ana", email: `ana-${Date.now()}@a.test`, senhaHash: "x", papel: "ADVOGADO" }) });
      const b = await db.usuario.create({ data: semEscritorio({ nome: "Dr. Bruno", email: `bruno-${Date.now()}@a.test`, senhaHash: "x", papel: "ADVOGADO" }) });
      await db.compromisso.createMany({
        data: [
          { escritorioId: escritorio, titulo: "Audiencia da Ana", tipo: "AUDIENCIA", inicio: em(45), responsavelId: a.id },
          { escritorioId: escritorio, titulo: "Pericia do Bruno", tipo: "PERICIA", inicio: em(30), responsavelId: b.id },
          { escritorioId: escritorio, titulo: "Reuniao de todos", tipo: "COMPROMISSO", inicio: em(50) },
          { escritorioId: escritorio, titulo: "Ja concluida", tipo: "AUDIENCIA", inicio: em(20), responsavelId: a.id, concluido: true },
          { escritorioId: escritorio, titulo: "Tarefa do dia", tipo: "TAREFA", inicio: em(20), responsavelId: a.id },
          { escritorioId: escritorio, titulo: "Ja passou", tipo: "AUDIENCIA", inicio: em(-5), responsavelId: a.id },
        ],
      });
      return [a.id, b.id];
    });
    await comEscritorio(outro, (db) =>
      db.compromisso.create({ data: semEscritorio({ titulo: "De outro escritorio", tipo: "AUDIENCIA", inicio: em(10) }) }),
    );
  });

  afterAll(async () => {
    for (const id of [escritorio, outro]) {
      if (id) await prismaPlataforma().escritorio.delete({ where: { id } }).catch(() => {});
    }
  });

  it("o responsavel ve o seu e o de todos; nao o do colega, nem concluido, tarefa ou passado", async () => {
    const ana = await proximosDoUsuario(escritorio, dra, agora);
    expect(ana.compromissos.map((x) => x.titulo)).toEqual(["Audiencia da Ana", "Reuniao de todos"]);
    expect(ana.alertaSonoro).toBe(true);

    const bruno = await proximosDoUsuario(escritorio, dr, agora);
    expect(bruno.compromissos.map((x) => x.titulo)).toEqual(["Pericia do Bruno", "Reuniao de todos"]);
  });

  it("o som desligado vem desligado; o aviso continua", async () => {
    await comEscritorio(escritorio, (db) => db.usuario.update({ where: { id: dra }, data: { alertaSonoro: false } }));
    const ana = await proximosDoUsuario(escritorio, dra, agora);
    expect(ana.alertaSonoro).toBe(false);
    expect(ana.compromissos).toHaveLength(2);
  });
});
