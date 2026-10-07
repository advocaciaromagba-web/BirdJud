// A mensagem que CHEGA pelo WhatsApp, contra o banco.
//
// O QUE ESTES TESTES PROTEGEM: duas coisas que nao dao erro nenhum.
//
// 1. A Meta REENTREGA o mesmo evento quando o nosso 200 demora. Sem porteira,
//    o cliente recebe a resposta automatica duas, tres vezes.
// 2. O mesmo telefone pode ser cliente de DUAS bancas da plataforma.
//    Responder "confirmada a sua audiencia" ao escritorio errado conta a um
//    escritorio que aquela pessoa e cliente do outro. Isso nao se desfaz.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { tratarMensagem } from "../src/lib/entrada-whatsapp";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

const TELEFONE = "5577988880000";
/**
 * Id da mensagem proprio de cada rodada.
 *
 * A linha sem dono NAO e apagada junto com o escritorio — ela nao pertence a
 * nenhum —, e o indice unico de idNaMeta e global. Id fixo faria a segunda
 * rodada do teste cair direto em REPETIDA, que e justamente o contrario do que
 * cada caso quer provar.
 */
const RODADA = `${Date.now()}`;
const id = (nome: string) => `wamid.${nome}.${RODADA}`;

d("resposta recebida no WhatsApp", () => {
  let alfa = "";
  let beta = "";
  let compromissoDeAlfa = "";
  let participanteDeAlfa = "";
  let servidor: Server;
  let mandadas: Array<{ para: string; texto: string }> = [];

  /** A Meta de mentira: guarda o que o sistema tentou responder. */
  beforeAll(async () => {
    servidor = createServer(async (req, res) => {
      const pedacos: Buffer[] = [];
      for await (const p of req) pedacos.push(p as Buffer);
      const corpo = JSON.parse(Buffer.concat(pedacos).toString() || "{}");
      mandadas.push({ para: corpo.to, texto: corpo.text?.body ?? "" });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ messages: [{ id: `wamid.resp${mandadas.length}` }] }));
    });
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    const porta = (servidor.address() as { port: number }).port;
    process.env.META_BASE_URL = `http://127.0.0.1:${porta}`;
    process.env.WHATSAPP_NUMERO_ID = "111";
    process.env.WHATSAPP_TOKEN = "tok";

    const sufixo = `${Date.now()}`;
    const a = await prismaPlataforma().escritorio.create({
      data: { slug: `zapa-${sufixo}`, nome: "Banca Alfa" },
    });
    const b = await prismaPlataforma().escritorio.create({
      data: { slug: `zapb-${sufixo}`, nome: "Banca Beta" },
    });
    alfa = a.id;
    beta = b.id;

    const comp = await comEscritorio(alfa, (db) =>
      db.compromisso.create({
        data: semEscritorio({
          titulo: "Audiencia de instrucao",
          tipo: "AUDIENCIA",
          inicio: new Date("2026-11-10T17:00:00Z"),
        }),
      }),
    );
    compromissoDeAlfa = comp.id;
    const part = await comEscritorio(alfa, (db) =>
      db.participanteDeCompromisso.create({
        data: semEscritorio({
          compromissoId: comp.id,
          nome: "Maria Helena",
          telefone: TELEFONE,
        }),
      }),
    );
    participanteDeAlfa = part.id;
  });

  afterAll(async () => {
    delete process.env.META_BASE_URL;
    delete process.env.WHATSAPP_NUMERO_ID;
    delete process.env.WHATSAPP_TOKEN;
    // A linha sem dono nao cai no cascade do escritorio: nao e de nenhum.
    await prismaPlataforma()
      .respostaDeWhatsapp.deleteMany({ where: { telefone: TELEFONE } })
      .catch(() => {});
    for (const id of [alfa, beta]) {
      if (id)
        await prismaPlataforma()
          .escritorio.delete({ where: { id } })
          .catch(() => {});
    }
    await new Promise<void>((ok) => servidor.close(() => ok()));
    await prismaPlataforma().$disconnect();
  });

  /** O lembrete que ja saiu, que e o que a resposta responde. */
  async function lembreteEnviado(escritorioId: string, chave: string) {
    return comEscritorio(escritorioId, (db) =>
      db.aviso.create({
        data: semEscritorio({
          canal: "WHATSAPP",
          tipo: "LEMBRETE_AO_PARTICIPANTE",
          chave,
          destino: TELEFONE,
          assunto: "Lembrete",
          corpo: "Lembrete",
          estado: "ENVIADO",
          enviadoEm: new Date(),
        }),
      }),
    );
  }

  it("resposta sem lembrete nenhum nao e respondida nem atribuida", async () => {
    mandadas = [];
    const r = await tratarMensagem({ idNaMeta: id("solto"), de: TELEFONE, texto: "oi" });
    expect(r.desfecho).toBe("SEM_LEMBRETE");
    expect(r.escritorioId).toBeNull();
    // Sem dono nao ha a quem responder: a credencial e de um escritorio, e
    // escolher no palpite mandaria a resposta de uma banca ao cliente de outra.
    expect(mandadas).toHaveLength(0);
  });

  it("confirma a presenca e responde", async () => {
    mandadas = [];
    await lembreteEnviado(alfa, `zap:participante:${compromissoDeAlfa}:${participanteDeAlfa}`);

    const r = await tratarMensagem({ idNaMeta: id("sim"), de: TELEFONE, texto: "1" });
    expect(r.desfecho).toBe("TRATADA");
    expect(r.intencao).toBe("CONFIRMA");
    expect(r.escritorioId).toBe(alfa);
    expect(r.respondeu).toBe(true);

    const p = await comEscritorio(alfa, (db) =>
      db.participanteDeCompromisso.findFirst({ where: { id: participanteDeAlfa } }),
    );
    expect(p?.confirmadoEm).not.toBeNull();
    expect(p?.recusadoEm).toBeNull();

    expect(mandadas).toHaveLength(1);
    expect(mandadas[0].para).toBe(TELEFONE);
    expect(mandadas[0].texto).toContain("Banca Alfa");
    expect(mandadas[0].texto).toContain("Audiencia de instrucao");
  });

  it("A MESMA MENSAGEM DUAS VEZES nao responde duas vezes", async () => {
    mandadas = [];
    const r = await tratarMensagem({ idNaMeta: id("sim"), de: TELEFONE, texto: "1" });
    expect(r.desfecho).toBe("REPETIDA");
    expect(mandadas).toHaveLength(0);
  });

  it("quem confirmou e depois recusou perde a confirmacao", async () => {
    // Os dois campos sao mexidos juntos: a tela nao pode mostrar as duas
    // coisas ao mesmo tempo.
    mandadas = [];
    const r = await tratarMensagem({
      idNaMeta: id("nao"),
      de: TELEFONE,
      texto: "nao vou poder ir",
    });
    expect(r.intencao).toBe("DESMARCA");
    const p = await comEscritorio(alfa, (db) =>
      db.participanteDeCompromisso.findFirst({ where: { id: participanteDeAlfa } }),
    );
    expect(p?.recusadoEm).not.toBeNull();
    expect(p?.confirmadoEm).toBeNull();
    // E a resposta nao promete o que o sistema nao faz.
    expect(mandadas[0].texto).toContain("NAO foi desmarcado");
  });

  it("DOIS ESCRITORIOS no mesmo telefone: nao age e nao responde", async () => {
    mandadas = [];
    const comp = await comEscritorio(beta, (db) =>
      db.compromisso.create({
        data: semEscritorio({
          titulo: "Pericia",
          tipo: "PERICIA",
          inicio: new Date("2026-11-11T17:00:00Z"),
        }),
      }),
    );
    await lembreteEnviado(beta, `zap:participante:${comp.id}:outro`);

    const r = await tratarMensagem({ idNaMeta: id("dois"), de: TELEFONE, texto: "sim" });
    expect(r.desfecho).toBe("DOIS_ESCRITORIOS");
    expect(r.escritorioId).toBeNull();
    expect(mandadas).toHaveLength(0);

    // A linha fica guardada, e invisivel para os dois.
    const deAlfa = await comEscritorio(alfa, (db) =>
      db.respostaDeWhatsapp.findMany({ where: { telefone: TELEFONE } }),
    );
    expect(deAlfa.some((x) => x.idNaMeta === id("dois"))).toBe(false);
    const deBeta = await comEscritorio(beta, (db) =>
      db.respostaDeWhatsapp.findMany({ where: { telefone: TELEFONE } }),
    );
    expect(deBeta).toHaveLength(0);
  });

  it("'parar' bloqueia o telefone, e o bloqueio impede o proximo lembrete", async () => {
    mandadas = [];
    // Volta a haver um unico candidato: o de beta sai da janela.
    await comEscritorio(beta, (db) =>
      db.aviso.updateMany({
        where: { destino: TELEFONE },
        data: { enviadoEm: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10) },
      }),
    );

    const r = await tratarMensagem({ idNaMeta: id("parar"), de: TELEFONE, texto: "PARAR" });
    expect(r.intencao).toBe("PARAR");
    expect(r.escritorioId).toBe(alfa);

    const bloqueios = await comEscritorio(alfa, (db) => db.bloqueioDeWhatsapp.findMany());
    expect(bloqueios.map((b) => b.telefone)).toEqual([TELEFONE]);

    // Beta nao foi bloqueada: o pedido foi para a banca que mandou a mensagem.
    const deBeta = await comEscritorio(beta, (db) => db.bloqueioDeWhatsapp.findMany());
    expect(deBeta).toHaveLength(0);
  });

  it("mexer na lista de participantes NAO joga fora a confirmacao", async () => {
    // A lista e salva apagando e regravando. Sem cuidado, bastava o escritorio
    // acrescentar uma testemunha para a presenca ja confirmada pelo cliente
    // voltar a "aguardando" — e ninguem saberia por que.
    const { salvarParticipantes, participantesDoCompromisso } = await import(
      "../src/lib/participantes-do-escritorio"
    );
    await comEscritorio(alfa, (db) =>
      db.participanteDeCompromisso.updateMany({
        where: { id: participanteDeAlfa },
        data: { confirmadoEm: new Date(), recusadoEm: null },
      }),
    );

    await salvarParticipantes(alfa, compromissoDeAlfa, [
      { nome: "Maria Helena", telefone: TELEFONE, avisar: true },
      { nome: "Testemunha Nova", telefone: "5577977770000", avisar: true },
    ]);

    const lista = await participantesDoCompromisso(alfa, compromissoDeAlfa);
    const maria = lista.find((p) => p.telefone === TELEFONE);
    expect(maria?.confirmadoEm).not.toBeNull();
    // Quem entrou agora nasce sem resposta nenhuma.
    const nova = lista.find((p) => p.telefone === "5577977770000");
    expect(nova?.confirmadoEm).toBeNull();
    expect(nova?.recusadoEm).toBeNull();
  });

  it("o que o sistema nao entende fica na caixa de entrada do escritorio", async () => {
    mandadas = [];
    const r = await tratarMensagem({
      idNaMeta: id("audio"),
      de: TELEFONE,
      texto: "[audio]",
    });
    expect(r.intencao).toBe("NAO_ENTENDI");
    const { respostasParaLer } = await import("../src/lib/entrada-whatsapp");
    const naCaixa = await respostasParaLer(alfa);
    expect(naCaixa.some((x) => x.texto === "[audio]")).toBe(true);
    // E o cliente nao fica sem resposta.
    expect(mandadas[0].texto).toContain("responda 1");
  });
});
