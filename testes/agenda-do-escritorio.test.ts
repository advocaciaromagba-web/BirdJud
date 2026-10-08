// A agenda por dentro: editar, excluir, arquivar — e o rastro que cada um
// deixa. A regra sob teste e uma so: nada some sem registro.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import {
  HORAS_DE_SEGURANCA,
  arquivarVencidos,
  editarCompromisso,
  excluidosDoEscritorio,
  excluirCompromisso,
  notificacoesDaAgenda,
} from "../src/lib/agenda-do-escritorio";
import { avisarAgora } from "../src/lib/avisos";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;
const HORA = 60 * 60 * 1000;

let escritorio = "";
let usuarioId = "";
let clienteId = "";

async function audiencia(titulo: string, inicio: Date, tipo = "AUDIENCIA") {
  return comEscritorio(escritorio, async (db) => {
    const c = await db.compromisso.create({
      data: semEscritorio({
        titulo,
        tipo,
        inicio,
        local: "Forum de Guariba",
        clienteId,
        responsavelId: usuarioId,
      }),
    });
    await db.participanteDeCompromisso.create({
      data: semEscritorio({
        compromissoId: c.id,
        clienteId,
        telefone: "+5516999990000",
        email: "cliente@agenda.test",
      }),
    });
    await db.participanteDeCompromisso.create({
      data: semEscritorio({
        compromissoId: c.id,
        nome: "Testemunha Tereza",
        email: "tereza@agenda.test",
        papel: "testemunha",
      }),
    });
    return c;
  });
}

async function aviso(compromissoId: string, estado: string, sufixo: string) {
  return comEscritorio(escritorio, (db) =>
    db.aviso.create({
      data: semEscritorio({
        compromissoId,
        canal: "EMAIL",
        tipo: "LEMBRETE_AO_PARTICIPANTE",
        chave: `participante:${compromissoId}:${sufixo}`,
        destino: "tereza@agenda.test",
        assunto: "Lembrete",
        corpo: "Lembrete",
        estado,
        enviadoEm: estado === "ENVIADO" ? new Date() : null,
      }),
    }),
  );
}

d("agenda do escritorio", () => {
  beforeAll(async () => {
    process.env.DOMINIO_PLATAFORMA ??= "birdjud.test";
    const e = await prismaPlataforma().escritorio.create({
      data: { slug: `agenda-${Date.now()}`, nome: "Escritorio da Agenda" },
    });
    escritorio = e.id;
    const u = await comEscritorio(escritorio, (db) =>
      db.usuario.create({
        data: semEscritorio({
          nome: "Dra. Agenda",
          email: `dra-${Date.now()}@agenda.test`,
          senhaHash: "x",
          papel: "ADMIN",
        }),
      }),
    );
    usuarioId = u.id;
    const c = await comEscritorio(escritorio, (db) =>
      db.cliente.create({ data: semEscritorio({ nome: "Cliente Clara" }) }),
    );
    clienteId = c.id;
  });

  afterAll(async () => {
    if (escritorio) {
      await prismaPlataforma().escritorio.delete({ where: { id: escritorio } }).catch(() => {});
    }
    await prismaPlataforma().$disconnect();
  });

  it("mudar a data cancela os lembretes pendentes e preserva os enviados", async () => {
    const c = await audiencia("Instrucao", new Date(Date.now() + 5 * 24 * HORA));
    const enviado = await aviso(c.id, "ENVIADO", "ja-foi");
    const pendente = await aviso(c.id, "PENDENTE", "na-fila");

    const semMudarData = await editarCompromisso(escritorio, c.id, { titulo: "Instrucao e julgamento" });
    expect(semMudarData.mudouAData).toBe(false);

    const r = await editarCompromisso(escritorio, c.id, {
      inicio: new Date(Date.now() + 6 * 24 * HORA),
    });
    expect(r.mudouAData).toBe(true);

    const depois = await comEscritorio(escritorio, (db) =>
      db.aviso.findMany({ where: { id: { in: [enviado.id, pendente.id] } } }),
    );
    const e = depois.find((a) => a.id === enviado.id)!;
    const p = depois.find((a) => a.id === pendente.id)!;
    expect(e.estado).toBe("ENVIADO");
    expect(e.chave).toBe(enviado.chave);
    expect(p.estado).toBe("CANCELADO");
    expect(p.erro).toMatch(/data alterada/);
    // A chave original fica livre: a regua grava o lembrete certo de novo.
    expect(p.chave).not.toBe(pendente.chave);
    expect(p.chave).toContain(pendente.chave);
  });

  it("editar recusa processo, cliente ou responsavel que nao existem", async () => {
    const c = await audiencia("Pericia", new Date(Date.now() + 2 * 24 * HORA), "PERICIA");
    await expect(
      editarCompromisso(escritorio, c.id, { processoId: "nao-existe" }),
    ).rejects.toThrow(/Processo nao encontrado/);
    await expect(
      editarCompromisso(escritorio, c.id, { responsavelId: "nao-existe" }),
    ).rejects.toThrow(/Responsavel nao encontrado/);
    await expect(
      editarCompromisso(escritorio, "nao-existe", { titulo: "x" }),
    ).rejects.toThrow(/Compromisso nao encontrado/);
  });

  it("excluir deixa o retrato na auditoria, cancela pendentes e guarda os enviados", async () => {
    const c = await audiencia("Audiencia a excluir", new Date(Date.now() + 3 * 24 * HORA));
    const enviado = await aviso(c.id, "ENVIADO", "foi");
    const pendente = await aviso(c.id, "PENDENTE", "fila");

    await excluirCompromisso(escritorio, c.id, { usuarioId, nome: "Dra. Agenda" });

    const sumiu = await comEscritorio(escritorio, (db) =>
      db.compromisso.findFirst({ where: { id: c.id } }),
    );
    expect(sumiu).toBeNull();

    const auditoria = (await excluidosDoEscritorio(escritorio)).find(
      (x) => x.compromissoId === c.id,
    )!;
    expect(auditoria.motivo).toBe("EXCLUIDO");
    expect(auditoria.titulo).toBe("Audiencia a excluir");
    expect(auditoria.nomeDoCliente).toBe("Cliente Clara");
    expect(auditoria.nomeDoResponsavel).toBe("Dra. Agenda");
    expect(auditoria.nomeDeQuemExcluiu).toBe("Dra. Agenda");
    expect(auditoria.participantes).toEqual(["Cliente Clara", "Testemunha Tereza"]);

    // O aviso enviado sobrevive ao compromisso: e a prova de que saiu.
    const avisos = await comEscritorio(escritorio, (db) =>
      db.aviso.findMany({ where: { id: { in: [enviado.id, pendente.id] } } }),
    );
    expect(avisos.find((a) => a.id === enviado.id)?.estado).toBe("ENVIADO");
    expect(avisos.find((a) => a.id === enviado.id)?.compromissoId).toBeNull();
    expect(avisos.find((a) => a.id === pendente.id)?.estado).toBe("CANCELADO");

    await expect(
      excluirCompromisso(escritorio, c.id, { usuarioId, nome: null }),
    ).rejects.toThrow(/Compromisso nao encontrado/);
  });

  it("arquiva o que venceu com margem, e nunca prazo ou tarefa", async () => {
    const agora = new Date();
    const vencida = await audiencia(
      "Audiencia de ontem",
      new Date(agora.getTime() - (HORAS_DE_SEGURANCA + 1) * HORA),
    );
    const recente = await audiencia(
      "Audiencia que atrasou",
      new Date(agora.getTime() - (HORAS_DE_SEGURANCA - 1) * HORA),
    );
    const prazo = await audiencia(
      "Prazo vencido",
      new Date(agora.getTime() - 3 * 24 * HORA),
      "PRAZO",
    );
    const tarefa = await audiencia(
      "Tarefa atrasada",
      new Date(agora.getTime() - 3 * 24 * HORA),
      "TAREFA",
    );
    const pendente = await aviso(vencida.id, "PENDENTE", "atrasado");

    const r = await arquivarVencidos(escritorio, agora);
    expect(r.titulos).toContain("Audiencia de ontem");
    expect(r.titulos).not.toContain("Audiencia que atrasou");
    expect(r.titulos).not.toContain("Prazo vencido");
    expect(r.titulos).not.toContain("Tarefa atrasada");

    const restantes = await comEscritorio(escritorio, (db) =>
      db.compromisso.findMany({
        where: { id: { in: [vencida.id, recente.id, prazo.id, tarefa.id] } },
        select: { id: true },
      }),
    );
    expect(restantes.map((c) => c.id).sort()).toEqual(
      [recente.id, prazo.id, tarefa.id].sort(),
    );

    const auditoria = (await excluidosDoEscritorio(escritorio)).find(
      (x) => x.compromissoId === vencida.id,
    )!;
    expect(auditoria.motivo).toBe("VENCIDO");
    expect(auditoria.nomeDeQuemExcluiu).toBeNull();

    const cancelado = await comEscritorio(escritorio, (db) =>
      db.aviso.findFirst({ where: { id: pendente.id } }),
    );
    expect(cancelado?.estado).toBe("CANCELADO");

    // Rodar de novo nao arquiva nada e nao duplica a auditoria.
    expect((await arquivarVencidos(escritorio, agora)).arquivados).toBe(0);
  });

  it("avisar agora grava um aviso novo a cada clique, ligado ao compromisso", async () => {
    const c = await audiencia("Audiencia com aviso manual", new Date(Date.now() + 4 * 24 * HORA));

    const primeira = await avisarAgora(escritorio, c.id, "AGENDADO");
    // Dois participantes com e-mail; sem modulo WhatsApp, so o e-mail sai.
    expect(primeira.criados).toBe(2);
    expect(primeira.soPorWhatsappDesligado).toEqual([]);

    const segunda = await avisarAgora(escritorio, c.id, "LEMBRETE_1H");
    expect(segunda.criados).toBe(2);

    const avisos = await comEscritorio(escritorio, (db) =>
      db.aviso.findMany({ where: { compromissoId: c.id }, orderBy: { criadoEm: "asc" } }),
    );
    expect(avisos).toHaveLength(4);
    expect(avisos.every((a) => a.estado === "PENDENTE")).toBe(true);
    expect(avisos.filter((a) => a.tipo === "COMPROMISSO_MARCADO")).toHaveLength(2);
    const lembrete = avisos.find((a) => a.tipo === "LEMBRETE_AO_PARTICIPANTE")!;
    expect(lembrete.assunto).toContain("daqui a pouco");

    await expect(avisarAgora(escritorio, "nao-existe", "AGENDADO")).rejects.toThrow(
      /Compromisso nao encontrado/,
    );

    // A auditoria resolve o nome de quem recebeu pelo contato.
    const lista = await notificacoesDaAgenda(escritorio);
    const daTereza = lista.find(
      (n) => n.compromisso?.id === c.id && n.destino === "tereza@agenda.test" && n.tipo === "COMPROMISSO_MARCADO",
    )!;
    expect(daTereza.destinatario).toBe("Testemunha Tereza");
    expect(daTereza.rotulo).toBe("Confirmacao do agendamento");
    const daClara = lista.find(
      (n) => n.compromisso?.id === c.id && n.destino === "cliente@agenda.test",
    )!;
    expect(daClara.destinatario).toBe("Cliente Clara");
    expect(daClara.compromisso?.nomeDoResponsavel).toBe("Dra. Agenda");
  });
});
