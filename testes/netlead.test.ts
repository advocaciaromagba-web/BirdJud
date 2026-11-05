// Agenda no NetLead: so horario sai do escritorio. O NetLead e simulado.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AVISO_CHAVE_INVALIDA, enviarAgendaDe, enviarFoto, guardarChave, ligarOuDesligar, montarEventos, testarChave } from "../src/lib/netlead";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";

type Pedido = { metodo: string; url: string; auth: string | null; corpo: unknown };
let pedidos: Pedido[] = [];
function netleadFalso(resposta: (p: Pedido) => { status: number; json?: unknown }) {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const p = {
      metodo: init.method ?? "GET",
      url,
      auth: new Headers(init.headers).get("authorization"),
      corpo: init.body ? JSON.parse(String(init.body)) : null,
    };
    pedidos.push(p);
    const r = resposta(p);
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status, headers: { "content-type": "application/json" } });
  });
}
afterEach(() => {
  vi.unstubAllGlobals();
  pedidos = [];
});

describe("o que sai do escritório", () => {
  it("só id interno, horário e tipo genérico — nenhum dado pessoal", () => {
    const compromisso = {
      id: "cmabc123",
      tipo: "AUDIENCIA",
      inicio: new Date("2026-11-10T13:00:00Z"),
      fim: null,
      // Campos que existem no compromisso e NUNCA podem sair:
      titulo: "Audiência de Maria da Silva",
      local: "Rua das Flores, 100",
      link: "https://meet.exemplo/sala?senha=1234",
      observacoes: "Cliente telefone (71) 99999-8888, processo 1002327-74.2024.8.26.0222",
    };
    const [e] = montarEventos([compromisso]);
    expect(Object.keys(e).sort()).toEqual(["fim", "id", "inicio", "tipo"]);
    expect(e).toEqual({ id: "evento-cmabc123", inicio: "2026-11-10T13:00:00.000Z", fim: "2026-11-10T14:00:00.000Z", tipo: "Audiência" });
    const texto = JSON.stringify(e);
    for (const vazado of ["Maria", "Flores", "meet", "9999", "1002327"]) expect(texto).not.toContain(vazado);
  });

  it("prazo, tarefa e concluído não ocupam; fim errado vira uma hora", () => {
    const base = { inicio: new Date("2026-11-10T13:00:00Z") };
    const eventos = montarEventos([
      { id: "a", tipo: "PRAZO", fim: null, ...base },
      { id: "b", tipo: "TAREFA", fim: null, ...base },
      { id: "c", tipo: "PERICIA", fim: null, concluido: true, ...base },
      { id: "d", tipo: "COMPROMISSO", fim: new Date("2026-11-10T12:00:00Z"), ...base },
    ]);
    expect(eventos).toEqual([{ id: "evento-d", inicio: "2026-11-10T13:00:00.000Z", fim: "2026-11-10T14:00:00.000Z", tipo: "Atendimento" }]);
  });
});

describe("as respostas do NetLead", () => {
  it("teste da chave diz de quem é a agenda; 401 é chave inválida", async () => {
    netleadFalso((p) => (p.auth === "Bearer nlag_boa" ? { status: 200, json: { pessoa: "Dra. Helena" } } : { status: 401 }));
    expect(await testarChave("nlag_boa")).toEqual({ ok: true, pessoa: "Dra. Helena" });
    expect(await testarChave("nlag_ruim")).toMatchObject({ ok: false, chaveInvalida: true });
    expect(pedidos[0].url).toBe("https://netlead.com.br/api/externo/agenda");
  });

  it("envio: 200 entregue, 401 chave inválida, 5xx tenta depois", async () => {
    netleadFalso(() => ({ status: 200, json: { bloqueados: 2 } }));
    expect(await enviarFoto("k", [])).toMatchObject({ situacao: "ENVIADO", bloqueados: 2 });
    netleadFalso(() => ({ status: 401 }));
    expect(await enviarFoto("k", [])).toEqual({ situacao: "CHAVE_INVALIDA", erro: AVISO_CHAVE_INVALIDA });
    netleadFalso(() => ({ status: 503 }));
    expect(await enviarFoto("k", [])).toMatchObject({ situacao: "FALHOU" });
  });
});

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

d("agenda no NetLead com o banco", () => {
  let escritorio = "";
  let pessoa = "";
  let outra = "";

  beforeAll(async () => {
    escritorio = (await prismaPlataforma().escritorio.create({ data: { slug: `netlead-${Date.now()}`, nome: "Banca do NetLead" } })).id;
    await comEscritorio(escritorio, async (db) => {
      pessoa = (await db.usuario.create({ data: semEscritorio({ nome: "Dra. Helena", email: `n-${Date.now()}@t.test`, senhaHash: "x" }) })).id;
      outra = (await db.usuario.create({ data: semEscritorio({ nome: "Dr. Outro", email: `o-${Date.now()}@t.test`, senhaHash: "x" }) })).id;
      const amanha = new Date(Date.now() + 86_400_000);
      await db.compromisso.createMany({
        data: [
          { titulo: "Audiência da Maria", tipo: "AUDIENCIA", inicio: amanha, responsavelId: pessoa },
          { titulo: "Do outro", tipo: "AUDIENCIA", inicio: amanha, responsavelId: outra },
          { titulo: "Antiga", tipo: "AUDIENCIA", inicio: new Date(Date.now() - 3 * 86_400_000), responsavelId: pessoa },
        ].map((c) => semEscritorio(c)) as never,
      });
    });
  });

  afterAll(async () => {
    if (escritorio) await prismaPlataforma().escritorio.delete({ where: { id: escritorio } }).catch(() => {});
    await prismaPlataforma().$disconnect();
  });

  it("a chave fica cifrada; ligar manda só os horários da pessoa; 401 pausa; chave nova destrava", async () => {
    await guardarChave(escritorio, pessoa, "  nlag_segredo_1234 ");
    const guardada = await comEscritorio(escritorio, (db) => db.agendaNoNetlead.findFirst({ where: { usuarioId: pessoa } }));
    expect(guardada?.chaveFinal).toBe("1234");
    expect(Buffer.from(guardada!.chave).toString("utf8")).not.toContain("nlag_segredo");

    // Desligado nao envia nada.
    netleadFalso(() => ({ status: 200 }));
    expect(await enviarAgendaDe(escritorio, pessoa)).toEqual({ situacao: "DESLIGADO" });
    expect(pedidos).toHaveLength(0);

    expect(await ligarOuDesligar(escritorio, pessoa, true)).toMatchObject({ situacao: "ENVIADO", eventos: 1 });
    expect(pedidos[0].auth).toBe("Bearer nlag_segredo_1234");
    expect(JSON.stringify(pedidos[0].corpo)).not.toContain("Maria");

    netleadFalso(() => ({ status: 401 }));
    await enviarAgendaDe(escritorio, pessoa);
    expect(await enviarAgendaDe(escritorio, pessoa)).toMatchObject({ situacao: "PAUSADO" });

    await guardarChave(escritorio, pessoa, "nlag_nova_9999");
    netleadFalso(() => ({ status: 200 }));
    expect(await enviarAgendaDe(escritorio, pessoa)).toMatchObject({ situacao: "ENVIADO" });

    // Desligar manda a foto vazia, que libera os horarios la.
    pedidos = [];
    expect(await ligarOuDesligar(escritorio, pessoa, false)).toMatchObject({ situacao: "ENVIADO" });
    expect(pedidos[0].corpo).toEqual({ eventos: [] });
  });
});
