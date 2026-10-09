// Entrega das mensagens: o retorno da Meta, o alerta para a equipe e o
// reenvio. O que se prova e o que o escritorio sente: mensagem que nao
// chegou nunca passa calada, o sistema tenta de novo sozinho so quando
// adianta, e o reenvio vai para o contato corrigido do cadastro.
import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { enviarAvisosNoWhatsapp } from "../src/lib/avisos";
import {
  HORAS_SEM_CONFIRMACAO,
  categoriaDaFalha,
  motivoDaFalha,
  mudancaPorStatus,
  quandoReenviarSozinho,
  rotuloDaEntrega,
  semConfirmacao,
} from "../src/lib/entrega";
import {
  NaoDaParaReenviar,
  TIPO_DO_ALERTA,
  conferirEntregas,
  marcarResolvida,
  mensagensDoEscritorio,
  reenviar,
} from "../src/lib/entrega-do-escritorio";

const MIN = 60 * 1000;
const HORA = 60 * MIN;
const agora = new Date("2026-10-09T12:00:00Z");

describe("o erro da Meta, em lingua de escritorio", () => {
  it("separa de quem e o problema", () => {
    expect(categoriaDaFalha("WHATSAPP", 131026)).toBe("NUMERO");
    expect(categoriaDaFalha("WHATSAPP", 131050)).toBe("RECUSOU");
    expect(categoriaDaFalha("WHATSAPP", 131000)).toBe("TEMPORARIO");
    expect(categoriaDaFalha("WHATSAPP", 131049)).toBe("TEMPORARIO");
    expect(categoriaDaFalha("WHATSAPP", 0)).toBe("TEMPORARIO");
    expect(categoriaDaFalha("WHATSAPP", 131042)).toBe("PLATAFORMA");
    expect(categoriaDaFalha("WHATSAPP", 132001)).toBe("PLATAFORMA");
    expect(categoriaDaFalha("WHATSAPP", null)).toBe("OUTRO");
    expect(categoriaDaFalha("WHATSAPP", 999)).toBe("OUTRO");
    expect(categoriaDaFalha("EMAIL", null)).toBe("EMAIL");
  });

  it("explica o motivo, e passa o da Meta quando nao conhece o codigo", () => {
    expect(motivoDaFalha(131026)).toMatch(/nao recebe WhatsApp/);
    expect(motivoDaFalha(131050)).toMatch(/bloqueou/);
    expect(motivoDaFalha(424242, "Texto da Meta")).toBe("Texto da Meta");
    expect(motivoDaFalha(424242, null)).toMatch(/nao informou/);
  });
});

describe("o retorno da Meta, fora de ordem", () => {
  const novo = { estado: "ENVIADO", entregueEm: null, lidoEm: null };
  const t = new Date("2026-10-09T10:00:00Z");

  it("entregue, lida e falhou mudam o que devem", () => {
    expect(mudancaPorStatus(novo, "sent", t)).toBeNull();
    expect(mudancaPorStatus(novo, "delivered", t)).toEqual({ entregueEm: t });
    expect(mudancaPorStatus(novo, "failed", t)).toEqual({ estado: "FALHOU", falhouEm: t });
  });

  it("lida antes de entregue vale como as duas", () => {
    expect(mudancaPorStatus(novo, "read", t)).toEqual({ lidoEm: t, entregueEm: t });
  });

  it("nada anda para tras e nada se repete", () => {
    const entregue = { estado: "ENVIADO", entregueEm: t, lidoEm: null };
    expect(mudancaPorStatus(entregue, "delivered", t)).toBeNull();
    expect(mudancaPorStatus(entregue, "failed", t)).toBeNull();
    expect(mudancaPorStatus({ ...novo, estado: "FALHOU" }, "failed", t)).toBeNull();
    expect(mudancaPorStatus({ ...novo, estado: "CANCELADO" }, "delivered", t)).toBeNull();
  });
});

describe("quando o sistema reenvia sozinho", () => {
  const base = {
    canal: "WHATSAPP",
    tipo: "LEMBRETE_AO_PARTICIPANTE",
    chave: "zap:participante:x",
    erroCodigo: 131000,
    falhouEm: agora,
    inicioDoCompromisso: new Date(agora.getTime() + 48 * HORA),
  };

  it("instabilidade: em 30 minutos; limite de engajamento: em um dia", () => {
    expect(quandoReenviarSozinho(base, agora)).toEqual(new Date(agora.getTime() + 30 * MIN));
    expect(quandoReenviarSozinho({ ...base, erroCodigo: 131049 }, agora)).toEqual(new Date(agora.getTime() + 24 * HORA));
  });

  it("nunca: numero errado, plataforma, e-mail, documento ou segundo reenvio automatico", () => {
    expect(quandoReenviarSozinho({ ...base, erroCodigo: 131026 }, agora)).toBeNull();
    expect(quandoReenviarSozinho({ ...base, erroCodigo: 131042 }, agora)).toBeNull();
    expect(quandoReenviarSozinho({ ...base, canal: "EMAIL" }, agora)).toBeNull();
    expect(quandoReenviarSozinho({ ...base, tipo: "DOCUMENTO" }, agora)).toBeNull();
    expect(quandoReenviarSozinho({ ...base, chave: "reenvio:auto:abc" }, agora)).toBeNull();
  });

  it("nunca para compromisso que ja tera comecado", () => {
    const daqui20 = new Date(agora.getTime() + 20 * MIN);
    expect(quandoReenviarSozinho({ ...base, inicioDoCompromisso: daqui20 }, agora)).toBeNull();
    const daqui10h = new Date(agora.getTime() + 10 * HORA);
    expect(quandoReenviarSozinho({ ...base, erroCodigo: 131049, inicioDoCompromisso: daqui10h }, agora)).toBeNull();
  });
});

describe("sem confirmacao e rotulo na auditoria", () => {
  const enviado = {
    canal: "WHATSAPP",
    estado: "ENVIADO",
    idNaMeta: "wamid.x",
    entregueEm: null,
    lidoEm: null,
    enviadoEm: new Date(agora.getTime() - (HORAS_SEM_CONFIRMACAO + 1) * HORA),
  };

  it("WhatsApp aceito e sem entregue depois de horas", () => {
    expect(semConfirmacao(enviado, agora)).toBe(true);
    expect(semConfirmacao({ ...enviado, enviadoEm: new Date(agora.getTime() - HORA) }, agora)).toBe(false);
    expect(semConfirmacao({ ...enviado, entregueEm: agora }, agora)).toBe(false);
    // Saiu antes do retorno existir: nao ha como saber, nao acusa.
    expect(semConfirmacao({ ...enviado, idNaMeta: null }, agora)).toBe(false);
    expect(semConfirmacao({ ...enviado, canal: "EMAIL" }, agora)).toBe(false);
  });

  it("rotulo diz o que de fato se sabe", () => {
    expect(rotuloDaEntrega({ ...enviado, lidoEm: agora, entregueEm: agora })).toBe("Lida");
    expect(rotuloDaEntrega({ ...enviado, entregueEm: agora })).toBe("Entregue");
    expect(rotuloDaEntrega(enviado)).toBe("Sem confirmacao de entrega");
    expect(rotuloDaEntrega({ ...enviado, idNaMeta: null })).toBeNull();
    expect(rotuloDaEntrega({ ...enviado, canal: "EMAIL" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// No banco, com a Meta servida localmente e o webhook de verdade
// ---------------------------------------------------------------------------

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

const SEGREDO = "segredo-de-teste";
let servidor: Server;
let proximoId = 0;

async function webhook(statuses: unknown[]): Promise<number> {
  const { POST } = await import("@/app/api/webhooks/whatsapp/route");
  const corpo = JSON.stringify({ entry: [{ changes: [{ value: { statuses } }] }] });
  const r = await POST(
    new Request("https://birdjud.com.br/api/webhooks/whatsapp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": `sha256=${createHmac("sha256", SEGREDO).update(corpo, "utf8").digest("hex")}`,
      },
      body: corpo,
    }),
  );
  return r.status;
}

const marca = Date.now();
let esc = "";
let responsavel = "";
let compromisso = "";
let participante = "";
let cliente = "";

async function avisoPendente(chave: string, extra: Record<string, unknown> = {}) {
  return comEscritorio(esc, (db) =>
    db.aviso.create({
      data: semEscritorio({
        canal: "WHATSAPP",
        tipo: "LEMBRETE_AO_PARTICIPANTE",
        chave,
        destino: "5571988887777",
        assunto: "Audiencia amanha",
        corpo: "Lembrete da audiencia.",
        modelo: "birdjud_lembrete_participante",
        parametros: ["Maria", "Banca", "Audiencia", "amanha", "Forum", "71 3333-4444"],
        compromissoId: compromisso,
        participanteId: participante,
        ...extra,
      }),
    }),
  );
}

async function enviarERetornarId(chave: string): Promise<{ id: string; idNaMeta: string }> {
  const a = await avisoPendente(chave);
  await enviarAvisosNoWhatsapp(esc);
  const depois = await comEscritorio(esc, (db) => db.aviso.findFirstOrThrow({ where: { id: a.id } }));
  expect(depois.estado).toBe("ENVIADO");
  expect(depois.idNaMeta).toMatch(/^wamid\.entrega\./);
  return { id: a.id, idNaMeta: depois.idNaMeta! };
}

const lerAviso = (id: string) => comEscritorio(esc, (db) => db.aviso.findFirstOrThrow({ where: { id } }));
const alertasDe = (id: string) =>
  comEscritorio(esc, (db) => db.aviso.findMany({ where: { tipo: TIPO_DO_ALERTA, chave: { startsWith: `falha:${id}:` } } }));

d("entrega no banco", () => {
  beforeAll(async () => {
    servidor = createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        proximoId += 1;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ messages: [{ id: `wamid.entrega.${marca}.${proximoId}` }] }));
      });
    });
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    process.env.META_BASE_URL = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
    process.env.WHATSAPP_NUMERO_ID = "111";
    process.env.WHATSAPP_TOKEN = "tok";
    process.env.WHATSAPP_APP_SECRET = SEGREDO;

    const e = await prismaPlataforma().escritorio.create({ data: { slug: `entrega-${marca}`, nome: "Banca Entrega" } });
    esc = e.id;
    await comEscritorio(esc, async (db) => {
      await db.moduloContratado.create({ data: semEscritorio({ modulo: "WHATSAPP", ativo: true }) });
      await db.usuario.create({
        data: semEscritorio({ nome: "Admin", email: `adm-entrega-${marca}@teste.br`, senhaHash: "x", papel: "ADMIN" }),
      });
      const r = await db.usuario.create({
        data: semEscritorio({ nome: "Dra. Responsavel", email: `resp-entrega-${marca}@teste.br`, senhaHash: "x", papel: "ADVOGADO" }),
      });
      responsavel = r.id;
      const c = await db.cliente.create({ data: semEscritorio({ nome: "Maria Cliente", telefone: "(71) 98888-7777" }) });
      cliente = c.id;
      const k = await db.compromisso.create({
        data: semEscritorio({
          titulo: "Audiencia de instrucao",
          tipo: "AUDIENCIA",
          inicio: new Date(Date.now() + 3 * 24 * HORA),
          responsavelId: responsavel,
          clienteId: cliente,
        }),
      });
      compromisso = k.id;
      const p = await db.participanteDeCompromisso.create({
        data: semEscritorio({ compromissoId: compromisso, clienteId: cliente }),
      });
      participante = p.id;
    });
  });

  afterAll(async () => {
    await prismaPlataforma().trabalho.deleteMany({ where: { escritorioId: esc } });
    await prismaPlataforma().escritorio.delete({ where: { id: esc } }).catch(() => {});
    await new Promise<void>((ok) => servidor.close(() => ok()));
    delete process.env.META_BASE_URL;
  });

  beforeEach(async () => {
    await prismaPlataforma().trabalho.deleteMany({ where: { escritorioId: esc } });
  });

  it("guarda o id da Meta e le entregue e lida pelo webhook", async () => {
    const { id, idNaMeta } = await enviarERetornarId(`t1:${marca}`);
    const s = Math.floor(Date.now() / 1000);
    // Lida chega antes de entregue: vale como as duas.
    expect(await webhook([{ id: idNaMeta, status: "read", timestamp: String(s) }])).toBe(200);
    expect(await webhook([{ id: idNaMeta, status: "delivered", timestamp: String(s - 5) }])).toBe(200);
    const a = await lerAviso(id);
    expect(a.lidoEm?.getTime()).toBe(s * 1000);
    expect(a.entregueEm?.getTime()).toBe(s * 1000);
    expect(rotuloDaEntrega(a)).toBe("Lida");
  });

  it("numero sem WhatsApp: falha com motivo e alerta o responsavel uma vez so", async () => {
    const { id, idNaMeta } = await enviarERetornarId(`t2:${marca}`);
    const falha = { id: idNaMeta, status: "failed", timestamp: String(Math.floor(Date.now() / 1000)), errors: [{ code: 131026, title: "Message undeliverable" }] };
    await webhook([falha]);
    await webhook([falha]); // a Meta repete

    const a = await lerAviso(id);
    expect(a.estado).toBe("FALHOU");
    expect(a.erroCodigo).toBe(131026);
    expect(a.erro).toMatch(/nao recebe WhatsApp/);

    const alertas = await alertasDe(id);
    expect(alertas).toHaveLength(1);
    expect(alertas[0].usuarioId).toBe(responsavel);
    expect(alertas[0].canal).toBe("EMAIL");
    expect(alertas[0].corpo).toMatch(/Maria Cliente/);
    expect(alertas[0].corpo).toMatch(/\/mensagens/);
    // E o trabalhador e chamado na hora para mandar o alerta.
    const fila = await prismaPlataforma().trabalho.findMany({ where: { escritorioId: esc, tipo: "LEMBRAR" } });
    expect(fila.length).toBeGreaterThan(0);

    // A rodada de hora em hora nao alerta de novo.
    expect((await conferirEntregas(esc)).alertas).toBe(0);

    await marcarResolvida(esc, id, "CONTATO_DIRETO", "Secretaria", "Liguei e avisei");
    const resolvida = await lerAviso(id);
    expect(resolvida.tratamento).toBe("CONTATO_DIRETO");
    expect(resolvida.tratadoPor).toBe("Secretaria");
    await expect(marcarResolvida(esc, id, "DESCARTADO", "Outra", null)).rejects.toBeInstanceOf(NaoDaParaReenviar);
  });

  it("instabilidade: sem alerta, reenvio automatico unico, e o segundo erro vai para a equipe", async () => {
    const { id, idNaMeta } = await enviarERetornarId(`t3:${marca}`);
    const falhouEm = Math.floor(Date.now() / 1000);
    await webhook([{ id: idNaMeta, status: "failed", timestamp: String(falhouEm), errors: [{ code: 131000 }] }]);
    expect(await alertasDe(id)).toHaveLength(0);
    // Reenvio marcado na fila para daqui a 30 minutos.
    const fila = await prismaPlataforma().trabalho.findMany({ where: { escritorioId: esc, tipo: "LEMBRAR" } });
    expect(fila.some((t) => t.agendadoPara.getTime() === falhouEm * 1000 + 30 * MIN)).toBe(true);

    // Antes da hora, nada.
    expect((await conferirEntregas(esc, new Date(falhouEm * 1000 + 10 * MIN))).reenviados).toBe(0);
    // Na hora, um reenvio.
    expect((await conferirEntregas(esc, new Date(falhouEm * 1000 + 31 * MIN))).reenviados).toBe(1);
    expect((await conferirEntregas(esc, new Date(falhouEm * 1000 + 32 * MIN))).reenviados).toBe(0);

    const original = await lerAviso(id);
    expect(original.tratamento).toBe("REENVIO_AUTOMATICO");
    const copia = await comEscritorio(esc, (db) => db.aviso.findFirstOrThrow({ where: { reenvioDeId: id } }));
    expect(copia.chave).toBe(`reenvio:auto:${id}`);
    expect(copia.estado).toBe("PENDENTE");

    // O reenvio sai e falha de novo: agora e com a equipe.
    await enviarAvisosNoWhatsapp(esc);
    const enviada = await lerAviso(copia.id);
    await webhook([{ id: enviada.idNaMeta, status: "failed", timestamp: String(Math.floor(Date.now() / 1000)), errors: [{ code: 131000 }] }]);
    expect(await alertasDe(copia.id)).toHaveLength(1);
  });

  it("reenvio manual vai para o telefone corrigido no cadastro", async () => {
    const { id, idNaMeta } = await enviarERetornarId(`t4:${marca}`);
    await webhook([{ id: idNaMeta, status: "failed", errors: [{ code: 131026 }] }]);
    await comEscritorio(esc, (db) => db.cliente.update({ where: { id: cliente }, data: { telefone: "(71) 97777-6666" } }));

    const r = await reenviar(esc, id, { automatico: false, quem: "Dra. Responsavel" });
    expect(r.destino).toBe("5571977776666");
    expect(r.mudouDestino).toBe(true);
    const original = await lerAviso(id);
    expect(original.tratamento).toBe("REENVIADO");
    expect(original.observacao).toMatch(/5571977776666/);
    await expect(reenviar(esc, id, { automatico: false, quem: "x" })).rejects.toThrow(/ja foi tratada/);

    await comEscritorio(esc, (db) => db.cliente.update({ where: { id: cliente }, data: { telefone: "(71) 98888-7777" } }));
  });

  it("nao reenvia para quem pediu para parar, nem documento", async () => {
    const a = await avisoPendente(`t5:${marca}`, { estado: "FALHOU", falhouEm: new Date(), erroCodigo: 131026 });
    await comEscritorio(esc, (db) => db.bloqueioDeWhatsapp.create({ data: semEscritorio({ telefone: "5571988887777" }) }));
    await expect(reenviar(esc, a.id, { automatico: false, quem: "x" })).rejects.toThrow(/nao receber/);
    await comEscritorio(esc, (db) => db.bloqueioDeWhatsapp.deleteMany({}));

    const doc = await avisoPendente(`t6:${marca}`, { tipo: "DOCUMENTO", estado: "FALHOU", falhouEm: new Date(), clienteId: cliente });
    await expect(reenviar(esc, doc.id, { automatico: false, quem: "x" })).rejects.toThrow(/ficha do cliente/);
  });

  it("a tela mostra o nao entregue com o outro canal, o sem confirmacao e o resolvido", async () => {
    // Par no e-mail do mesmo aviso, que chegou.
    await comEscritorio(esc, (db) =>
      db.aviso.create({
        data: semEscritorio({
          canal: "EMAIL",
          tipo: "LEMBRETE_AO_PARTICIPANTE",
          chave: `t7:${marca}`,
          destino: "maria@cliente.br",
          assunto: "x",
          corpo: "x",
          estado: "ENVIADO",
          enviadoEm: new Date(),
        }),
      }),
    );
    const falha = await avisoPendente(`zap:t7:${marca}`, { estado: "FALHOU", falhouEm: new Date(), erroCodigo: 131026, erro: "Numero" });
    const mudo = await avisoPendente(`t8:${marca}`, {
      estado: "ENVIADO",
      idNaMeta: `wamid.mudo.${marca}`,
      enviadoEm: new Date(Date.now() - (HORAS_SEM_CONFIRMACAO + 2) * HORA),
    });
    // Um retorno recebido depois: prova que o webhook esta vivo.
    await avisoPendente(`t9:${marca}`, { estado: "ENVIADO", idNaMeta: `wamid.vivo.${marca}`, enviadoEm: new Date(), entregueEm: new Date() });

    const m = await mensagensDoEscritorio(esc);
    const naTela = m.naoEntregues.find((x) => x.id === falha.id)!;
    expect(naTela.destinatario).toBe("Maria Cliente");
    expect(naTela.categoria).toBe("NUMERO");
    expect(naTela.outroCanal).toEqual({ canal: "E-mail", situacao: "enviado" });
    expect(naTela.podeReenviar).toBe(true);
    expect(m.semConfirmacao.map((x) => x.id)).toContain(mudo.id);
    expect(m.resolvidas.some((x) => x.tratamento === "Avisado por outro meio")).toBe(true);
    // Alerta interno nao aparece como mensagem ao cliente.
    expect(m.naoEntregues.some((x) => x.tipo === TIPO_DO_ALERTA)).toBe(false);
  });

  it("retorno de mensagem desconhecida nao quebra o webhook", async () => {
    expect(await webhook([{ id: "wamid.ninguem", status: "delivered" }])).toBe(200);
  });
});
