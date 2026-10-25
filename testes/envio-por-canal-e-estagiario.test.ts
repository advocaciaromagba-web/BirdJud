// Envio automatico por canal e o papel de estagiario (25/10/2026, vindos do
// sistema da Advocacia Roma).
//
// O que protege o escritorio: cliente com um canal desligado nao recebe nada
// por ele — nem o aviso que ja estava na fila — e quem clica em enviar ve o
// motivo, em vez de achar que entregou; o contato fica no cadastro. O
// estagiario e apoio: nao ocupa vaga de advogado e nao libera o que e
// privativo de advogado.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { motivoDoBloqueio, podeReceber } from "../src/lib/consentimento-de-envio";
import { asaasPodeAvisar, definirEnvioDoCliente } from "../src/lib/envio-do-cliente";
import { paraAvisarNoCompromisso } from "../src/lib/participantes-do-escritorio";
import { contaComoAdvogado } from "../src/lib/equipe";
import { PAPEIS, rotuloDoPapel } from "../src/lib/papeis";
import { mandarPecaPorEmail } from "../src/lib/documento-por-email";

describe("envio por canal e papéis, sem banco", () => {
  it("ausente conta como ligado; desligado bloqueia só aquele canal", () => {
    expect(podeReceber(null, "WHATSAPP")).toBe(true);
    expect(podeReceber({ nome: "Ana" }, "EMAIL")).toBe(true);
    expect(podeReceber({ nome: "Ana", notificarWhatsapp: false }, "WHATSAPP")).toBe(false);
    expect(podeReceber({ nome: "Ana", notificarWhatsapp: false }, "EMAIL")).toBe(true);
    expect(motivoDoBloqueio({ nome: "Ana Souza" }, "EMAIL")).toBe("E-mail: o envio automático para Ana Souza está desligado no cadastro.");
  });

  it("o Asaas só avisa com os dois canais ligados", () => {
    expect(asaasPodeAvisar({ notificarWhatsapp: true, notificarEmail: true })).toBe(true);
    expect(asaasPodeAvisar({ notificarWhatsapp: false, notificarEmail: true })).toBe(false);
  });

  it("estagiário é papel válido, com rótulo, e não conta como advogado", () => {
    expect(PAPEIS).toContain("ESTAGIARIO");
    expect(rotuloDoPapel("ESTAGIARIO")).toBe("Estagiário(a)");
    expect(rotuloDoPapel("USUARIO")).toBe("Apoio");
    expect(contaComoAdvogado("ESTAGIARIO")).toBe(false);
    expect(contaComoAdvogado("ADVOGADO")).toBe(true);
  });
});

const temBanco = Boolean(process.env.DATABASE_URL);
(temBanco ? describe : describe.skip)("envio por canal, contra o banco", () => {
  let esc = "";
  let clienteId = "";
  let compromissoId = "";
  let participanteId = "";

  beforeAll(async () => {
    esc = (await prismaPlataforma().escritorio.create({ data: { slug: `canal-${Date.now()}`, nome: "Banca dos Canais" } })).id;
    const u = await comEscritorio(esc, (db) =>
      db.usuario.create({ data: semEscritorio({ nome: "Dra. Canal", email: `canal-${Date.now()}@e.test`, senhaHash: "x", papel: "ADMIN" }) }),
    );
    clienteId = (
      await comEscritorio(esc, (db) =>
        db.cliente.create({ data: semEscritorio({ nome: "Cliente Silêncio", telefone: "(16) 99999-0000", email: "silencio@e.test" }) }),
      )
    ).id;
    await comEscritorio(esc, async (db) => {
      const c = await db.compromisso.create({
        data: semEscritorio({ titulo: "Audiência", tipo: "AUDIENCIA", inicio: new Date(Date.now() + 5 * 864e5), clienteId, responsavelId: u.id }),
      });
      compromissoId = c.id;
      participanteId = (await db.participanteDeCompromisso.create({ data: semEscritorio({ compromissoId: c.id, clienteId }) })).id;
      await db.participanteDeCompromisso.create({
        data: semEscritorio({ compromissoId: c.id, nome: "Testemunha Tereza", email: "tereza@e.test", papel: "testemunha" }),
      });
      await db.aviso.create({
        data: semEscritorio({
          compromissoId: c.id,
          participanteId,
          canal: "EMAIL",
          tipo: "LEMBRETE_AO_PARTICIPANTE",
          chave: `participante:${c.id}:fila`,
          destino: "silencio@e.test",
          assunto: "Lembrete",
          corpo: "Lembrete",
        }),
      });
    });
  });

  afterAll(async () => {
    if (esc) await prismaPlataforma().escritorio.delete({ where: { id: esc } }).catch(() => {});
  });

  it("com tudo ligado, o cliente entra pelos dois canais", async () => {
    const r = await paraAvisarNoCompromisso(esc, compromissoId);
    const cliente = r.avisar.find((a) => a.participanteId === participanteId);
    expect(cliente?.email).toBe("silencio@e.test");
    expect(r.envioDesligado).toEqual([]);
  });

  it("desligar o e-mail cancela o aviso que estava na fila e tira o canal", async () => {
    const m = await definirEnvioDoCliente(esc, clienteId, { notificarEmail: false }, "Dra. Canal");
    expect(m.avisosCancelados).toBe(1);
    const fila = await comEscritorio(esc, (db) => db.aviso.findFirstOrThrow({ where: { participanteId } }));
    expect(fila.estado).toBe("CANCELADO");
    const c = await comEscritorio(esc, (db) => db.cliente.findFirstOrThrow({ where: { id: clienteId } }));
    expect(c.email).toBe("silencio@e.test");
    expect(c.envioAlteradoPor).toBe("Dra. Canal");
    const r = await paraAvisarNoCompromisso(esc, compromissoId);
    const cliente = r.avisar.find((a) => a.participanteId === participanteId);
    expect(cliente?.email ?? null).toBeNull();
  });

  it("com os dois desligados, não entra e o motivo volta; a testemunha avulsa segue", async () => {
    await definirEnvioDoCliente(esc, clienteId, { notificarWhatsapp: false }, "Dra. Canal");
    const r = await paraAvisarNoCompromisso(esc, compromissoId);
    expect(r.avisar.some((a) => a.participanteId === participanteId)).toBe(false);
    expect(r.envioDesligado).toEqual(["Cliente Silêncio"]);
    expect(r.semContato).not.toContain("Cliente Silêncio");
    expect(r.avisar.some((a) => a.nome === "Testemunha Tereza")).toBe(true);
  });

  it("documento por e-mail recusa com o motivo", async () => {
    await comEscritorio(esc, (db) => db.moduloContratado.create({ data: semEscritorio({ modulo: "EMAIL", ativo: true }) }));
    const cliente = await comEscritorio(esc, (db) => db.cliente.findFirstOrThrow({ where: { id: clienteId } }));
    await expect(
      mandarPecaPorEmail(esc, "PROCURACAO" as never, { cliente, clienteId, advogados: [] } as never),
    ).rejects.toThrow(/desligado no cadastro/);
  });
});
