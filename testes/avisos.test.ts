// Modulo de e-mail: geracao de avisos, idempotencia e envio de verdade.
//
// O SMTP e um servidor local que GUARDA o que recebe, entao os testes
// conferem a mensagem que sairia — nao apenas que a funcao devolveu ok.
import { SMTPServer } from "smtp-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comEscritorio,
  prismaPlataforma,
  semEscritorio,
} from "../src/lib/prisma";
import { salvarIntegracao } from "../src/lib/integracao";
import { gerarHash } from "../src/lib/senhas";
import {
  ANTECEDENCIA_HORAS,
  avisarAgendamento,
  avisarDesignacao,
  diaDaChave,
  enviarAvisosPendentes,
  gerarAvisos,
  MAX_TENTATIVAS,
} from "../src/lib/avisos";
import { SemRemetente } from "../src/lib/email";
import { consumoDoMes } from "../src/lib/consumo";
import {
  assuntoDoLembrete,
  assuntoDoResumo,
  corpoDoLembrete,
  corpoDoResumo,
} from "../src/lib/textos-aviso";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;
const HORA = 60 * 60 * 1000;

describe("textos do aviso", () => {
  it("o assunto avisa da urgencia logo no comeco", () => {
    // A pessoa decide se abre agora pelo assunto, nao pelo corpo.
    expect(assuntoDoResumo(3, 1)).toBe("[URGENTE] 3 publicacoes novas");
    expect(assuntoDoResumo(3, 0)).toBe("3 publicacoes novas");
    expect(assuntoDoResumo(1, 0)).toBe("1 publicacao nova");
  });

  it("o resumo separa urgentes das demais e formata o numero", () => {
    const corpo = corpoDoResumo(
      "Escritorio Alfa",
      [
        {
          numeroProcesso: "00012345620268260100",
          tribunal: "TJSP",
          urgente: true,
          prazoDias: 5,
          texto: "Audiencia designada.",
        },
        {
          numeroProcesso: null,
          tribunal: null,
          urgente: false,
          prazoDias: null,
          texto: "Juntada de peticao.",
        },
      ],
      "https://alfa.birdjud.com.br",
    );

    expect(corpo).toContain("URGENTE (1)");
    expect(corpo).toContain("Demais (1)");
    expect(corpo).toContain("0001234-56.2026.8.26.0100");
    expect(corpo).toContain("prazo indicado: 5 dia(s)");
    expect(corpo).toContain("sem numero de processo");
    // O aviso nao se apresenta como conclusao juridica.
    expect(corpo).toContain("confira sempre nos autos");
  });

  it("o lembrete traz hora, local e processo", () => {
    const compromisso = {
      titulo: "Audiencia de instrucao",
      tipo: "AUDIENCIA",
      inicio: new Date("2026-09-19T14:00:00Z"),
      local: "Forum Central",
      numeroProcesso: "00012345620268260100",
    };
    expect(assuntoDoLembrete(compromisso)).toContain("Audiencia de instrucao");
    const corpo = corpoDoLembrete(
      "Escritorio Alfa",
      compromisso,
      "https://alfa.birdjud.com.br",
    );
    expect(corpo).toContain("Forum Central");
    expect(corpo).toContain("0001234-56.2026.8.26.0100");
  });
});

describe("chave do dia", () => {
  it("muda de um dia para o outro", () => {
    expect(diaDaChave(new Date("2026-09-18T23:00:00Z"))).toBe("2026-09-18");
    expect(diaDaChave(new Date("2026-09-19T01:00:00Z"))).toBe("2026-09-19");
  });
});

// ---------------------------------------------------------------------------
// SMTP local que guarda o que recebe
// ---------------------------------------------------------------------------

type Recebida = { de: string; para: string[]; corpo: string };

let smtp: SMTPServer;
let porta = 0;
let recebidas: Recebida[] = [];
let recusarTudo = false;

beforeAll(async () => {
  smtp = new SMTPServer({
    authOptional: false,
    disabledCommands: ["STARTTLS"],
    onAuth(credenciais, _s, pronto) {
      if (
        credenciais.username === "escritorio" &&
        credenciais.password === "segredo"
      ) {
        pronto(null, { user: credenciais.username });
        return;
      }
      pronto(new Error("Usuario ou senha invalidos"));
    },
    onData(fluxo, sessao, pronto) {
      if (recusarTudo) {
        fluxo.resume();
        fluxo.on("end", () => pronto(new Error("550 caixa recusada")));
        return;
      }
      let corpo = "";
      fluxo.on("data", (p) => (corpo += p));
      fluxo.on("end", () => {
        recebidas.push({
          de: sessao.envelope.mailFrom ? sessao.envelope.mailFrom.address : "",
          para: sessao.envelope.rcptTo.map((r) => r.address),
          corpo,
        });
        pronto();
      });
    },
  });
  await new Promise<void>((ok) => smtp.listen(0, "127.0.0.1", ok));
  porta = (smtp.server.address() as { port: number }).port;
});

afterAll(async () => {
  await new Promise<void>((ok) => smtp.close(() => ok()));
});

let escritorio = "";
let usuarioId = "";
const marca = Date.now();

d("avisos do escritorio", () => {
  beforeAll(async () => {
    process.env.SEGREDO_CHAVE ??= Buffer.alloc(32, 3).toString("base64");
    process.env.DOMINIO_PLATAFORMA = "birdjud.test";

    const e = await prismaPlataforma().escritorio.create({
      data: { slug: `avisos-${marca}`, nome: "Escritorio dos Avisos" },
    });
    escritorio = e.id;

    const usuario = await comEscritorio(escritorio, async (db) =>
      db.usuario.create({
        data: semEscritorio({
          nome: "Dra. Alfa",
          email: "dra@avisos.adv.br",
          senhaHash: await gerarHash("senha-de-teste-1234"),
          papel: "ADMIN",
          advogado: true,
        }),
      }),
    );
    usuarioId = usuario.id;
  });

  afterAll(async () => {
    if (escritorio) {
      await prismaPlataforma()
        .escritorio.delete({ where: { id: escritorio } })
        .catch(() => {});
    }
    await prismaPlataforma().$disconnect();
  });

  it("sem publicacao nao lida, nao gera resumo", async () => {
    // E-mail vazio todo dia treina a equipe a ignorar o remetente.
    const resultado = await gerarAvisos(escritorio);
    expect(resultado.resumos).toBe(0);
  });

  it("gera um resumo por pessoa que quer receber", async () => {
    await comEscritorio(escritorio, (db) =>
      db.publicacao.create({
        data: semEscritorio({
          idExterno: `pub-${marca}`,
          texto: "Audiencia designada. Prazo de 5 dias.",
          dataDisponibilizacao: new Date(),
          urgente: true,
          prazoDias: 5,
        }),
      }),
    );

    const resultado = await gerarAvisos(escritorio);
    expect(resultado.resumos).toBe(1);

    const aviso = await comEscritorio(escritorio, (db) =>
      db.aviso.findFirstOrThrow({ where: { tipo: "RESUMO_PUBLICACOES" } }),
    );
    expect(aviso.destino).toBe("dra@avisos.adv.br");
    expect(aviso.assunto).toContain("[URGENTE]");
    expect(aviso.estado).toBe("PENDENTE");
  });

  it("rodar de novo no mesmo dia nao duplica", async () => {
    const resultado = await gerarAvisos(escritorio);
    expect(resultado.resumos).toBe(0);
    await expect(
      comEscritorio(escritorio, (db) =>
        db.aviso.count({ where: { tipo: "RESUMO_PUBLICACOES" } }),
      ),
    ).resolves.toBe(1);
  });

  it("quem desligou o resumo nao recebe", async () => {
    await comEscritorio(escritorio, (db) =>
      db.usuario.update({
        where: { id: usuarioId },
        data: { recebeResumo: false },
      }),
    );
    const amanha = new Date(Date.now() + 24 * HORA);
    expect((await gerarAvisos(escritorio, amanha)).resumos).toBe(0);

    await comEscritorio(escritorio, (db) =>
      db.usuario.update({
        where: { id: usuarioId },
        data: { recebeResumo: true },
      }),
    );
  });

  it("gera lembrete do compromisso dentro da antecedencia", async () => {
    const agora = new Date();
    await comEscritorio(escritorio, async (db) => {
      await db.compromisso.create({
        data: semEscritorio({
          titulo: "Audiencia de instrucao",
          tipo: "AUDIENCIA",
          inicio: new Date(agora.getTime() + 3 * HORA),
          local: "Forum Central",
        }),
      });
      // Alem do marco mais distante (3 dias): nao deve gerar nada ainda.
      await db.compromisso.create({
        data: semEscritorio({
          titulo: "Reuniao distante",
          inicio: new Date(agora.getTime() + 200 * HORA),
        }),
      });
    });

    const resultado = await gerarAvisos(escritorio, agora);
    expect(resultado.lembretes).toBe(1);

    const aviso = await comEscritorio(escritorio, (db) =>
      db.aviso.findFirstOrThrow({ where: { tipo: "LEMBRETE_COMPROMISSO" } }),
    );
    expect(aviso.assunto).toContain("Audiencia de instrucao");
    // O assunto diz quanto falta, nao so quando e.
    expect(aviso.assunto).toContain("e amanha");
  });

  it("a regua manda tres vezes na audiencia, e uma so na tarefa", async () => {
    // Tres avisos de cada tarefa enchem o WhatsApp da equipe e ensinam todo
    // mundo a ignorar — o contrario do que se quer no dia do prazo.
    const agora = new Date();
    const daqui = (h: number) => new Date(agora.getTime() + h * HORA);

    // Tudo que existir depois deste ponto e deste caso, e sai junto no fim:
    // rodar a geracao em datas futuras cria tambem o resumo daqueles dias, e
    // os testes seguintes contam os pendentes do escritorio inteiro.
    const jaExistiam = new Set(
      (
        await comEscritorio(escritorio, (db) => db.aviso.findMany({ select: { id: true } }))
      ).map((a) => a.id),
    );

    const audiencia = await comEscritorio(escritorio, (db) =>
      db.compromisso.create({
        data: semEscritorio({
          titulo: "Audiencia da regua",
          tipo: "AUDIENCIA",
          inicio: daqui(70),
        }),
      }),
    );
    await comEscritorio(escritorio, (db) =>
      db.compromisso.create({
        data: semEscritorio({
          titulo: "Tarefa da regua",
          tipo: "TAREFA",
          inicio: daqui(70),
        }),
      }),
    );

    const chaves = async () =>
      (
        await comEscritorio(escritorio, (db) =>
          db.aviso.findMany({ where: { chave: { contains: audiencia.id } } }),
        )
      ).map((a) => a.chave);

    // A 70 horas: so o marco de 3 dias, e so para a audiencia.
    await gerarAvisos(escritorio, agora);
    expect((await chaves()).some((c) => c.includes("3d:"))).toBe(true);

    // Rodar de novo na mesma hora nao repete nada.
    const antes = (await chaves()).length;
    await gerarAvisos(escritorio, agora);
    expect((await chaves()).length).toBe(antes);

    // Vinte horas antes: entra o marco de 24 horas.
    await gerarAvisos(escritorio, new Date(daqui(70).getTime() - 20 * HORA));
    expect((await chaves()).some((c) => !c.includes("3d:") && !c.includes("1h:"))).toBe(
      true,
    );

    // Meia hora antes: entra o de 1 hora.
    await gerarAvisos(
      escritorio,
      new Date(daqui(70).getTime() - 0.5 * HORA),
    );
    expect((await chaves()).some((c) => c.includes("1h:"))).toBe(true);

    // A tarefa, no mesmo horario, teve um aviso so.
    const daTarefa = await comEscritorio(escritorio, (db) =>
      db.aviso.findMany({ where: { assunto: { contains: "Tarefa da regua" } } }),
    );
    const semCanal = new Set(daTarefa.map((a) => a.chave.replace(/^zap:/, "")));
    expect(semCanal.size).toBe(1);

    await comEscritorio(escritorio, async (db) => {
      const todos = await db.aviso.findMany({ select: { id: true } });
      await db.aviso.deleteMany({
        where: { id: { in: todos.map((a) => a.id).filter((id) => !jaExistiam.has(id)) } },
      });
      await db.compromisso.deleteMany({
        where: { titulo: { in: ["Audiencia da regua", "Tarefa da regua"] } },
      });
    });
  });

  it("sem e-mail conectado, os avisos ficam esperando", async () => {
    const resultado = await enviarAvisosPendentes(escritorio);
    expect(resultado).toMatchObject({ semRemetente: true, enviados: 0 });

    // Nada foi marcado como falha: falta configuracao, nao houve erro de envio.
    const pendentes = await comEscritorio(escritorio, (db) =>
      db.aviso.count({ where: { estado: "PENDENTE" } }),
    );
    expect(pendentes).toBe(2);
  });

  it("conectado o e-mail, as mensagens saem de verdade", async () => {
    recebidas = [];
    await salvarIntegracao(
      escritorio,
      "SMTP",
      {
        host: "127.0.0.1",
        porta: String(porta),
        usuario: "escritorio",
        senha: "segredo",
        remetente: "contato@avisos.adv.br",
      },
      "OK",
    );

    const resultado = await enviarAvisosPendentes(escritorio);
    expect(resultado).toMatchObject({ enviados: 2, falhas: 0 });

    expect(recebidas).toHaveLength(2);
    // Sai do dominio do escritorio, nao da plataforma.
    expect(recebidas[0]?.de).toBe("contato@avisos.adv.br");
    expect(recebidas[0]?.para).toEqual(["dra@avisos.adv.br"]);
    expect(recebidas.some((r) => r.corpo.includes("Audiencia"))).toBe(true);
  });

  it("aviso enviado nao sai de novo", async () => {
    recebidas = [];
    const resultado = await enviarAvisosPendentes(escritorio);
    expect(resultado.enviados).toBe(0);
    expect(recebidas).toHaveLength(0);
  });

  it("mede o consumo de e-mail enviado", async () => {
    const consumo = await consumoDoMes(escritorio);
    const emails = consumo.find((l) => l.metrica === "EMAIL_ENVIADO");
    expect(emails?.quantidade).toBe(2);
  });

  it("recusa do servidor conta tentativa e para em FALHOU no limite", async () => {
    recusarTudo = true;
    try {
      await comEscritorio(escritorio, (db) =>
        db.aviso.create({
          data: semEscritorio({
            canal: "EMAIL",
            tipo: "RESUMO_PUBLICACOES",
            chave: `teste-falha-${marca}`,
            destino: "recusa@avisos.adv.br",
            assunto: "Teste",
            corpo: "Teste",
          }),
        }),
      );

      for (let i = 0; i < MAX_TENTATIVAS; i += 1) {
        await enviarAvisosPendentes(escritorio);
      }

      const aviso = await comEscritorio(escritorio, (db) =>
        db.aviso.findFirstOrThrow({ where: { chave: `teste-falha-${marca}` } }),
      );
      expect(aviso.estado).toBe("FALHOU");
      expect(aviso.tentativas).toBe(MAX_TENTATIVAS);
      // A linha fica: o escritorio precisa poder ver que aquele aviso nao chegou.
      expect(aviso.erro).toBeTruthy();
    } finally {
      recusarTudo = false;
    }
  });

  it("escritorio sem e-mail conectado nao perde o aviso", async () => {
    const outro = await prismaPlataforma().escritorio.create({
      data: { slug: `avisos-b-${marca}`, nome: "Sem e-mail" },
    });
    try {
      await comEscritorio(outro.id, (db) =>
        db.aviso.create({
          data: semEscritorio({
            canal: "EMAIL",
            tipo: "RESUMO_PUBLICACOES",
            chave: `sem-remetente-${marca}`,
            destino: "alguem@exemplo.adv.br",
            assunto: "Teste",
            corpo: "Teste",
          }),
        }),
      );

      const resultado = await enviarAvisosPendentes(outro.id);
      expect(resultado).toMatchObject({
        semRemetente: true,
        enviados: 0,
        falhas: 0,
      });

      // O aviso continua pendente e sem tentativa gasta: quando o escritorio
      // conectar o e-mail, ele sai. Marcar como falha aqui o perderia.
      const aviso = await comEscritorio(outro.id, (db) =>
        db.aviso.findFirstOrThrow({
          where: { chave: `sem-remetente-${marca}` },
        }),
      );
      expect(aviso.estado).toBe("PENDENTE");
      expect(aviso.tentativas).toBe(0);
    } finally {
      await prismaPlataforma()
        .escritorio.delete({ where: { id: outro.id } })
        .catch(() => {});
    }
  });
});

describe("erro de remetente", () => {
  it("SemRemetente diz o que fazer", () => {
    expect(new SemRemetente().message).toContain("Integracoes");
  });
});

d("avisos que saem na hora", () => {
  // A regua avisa do que VAI acontecer. Estes avisam do que ACABOU de
  // acontecer, e por isso nao podem esperar a proxima rodada da fila.
  let escritorio = "";

  beforeAll(async () => {
    const e = await prismaPlataforma().escritorio.create({
      data: { slug: `nahora-${Date.now()}`, nome: "Banca do Agora" },
    });
    escritorio = e.id;
  });

  afterAll(async () => {
    if (escritorio) {
      await prismaPlataforma()
        .escritorio.delete({ where: { id: escritorio } })
        .catch(() => {});
    }
  });

  it("a tarefa designada avisa so quem ficou com ela", async () => {
    const dono = await comEscritorio(escritorio, (db) =>
      db.usuario.create({
        data: semEscritorio({
          nome: "Estagiario Novo",
          email: `estagiario-${Date.now()}@teste.br`,
          senhaHash: "x",
          papel: "USUARIO",
        }),
      }),
    );
    const tarefa = await comEscritorio(escritorio, (db) =>
      db.compromisso.create({
        data: semEscritorio({
          titulo: "Protocolar a peticao",
          tipo: "TAREFA",
          inicio: new Date(Date.now() + 5 * HORA),
          responsavelId: dono.id,
        }),
      }),
    );

    expect(await avisarDesignacao(escritorio, tarefa.id)).toBeGreaterThan(0);

    const avisos = await comEscritorio(escritorio, (db) =>
      db.aviso.findMany({ where: { tipo: "TAREFA_DESIGNADA" } }),
    );
    // So o designado. Mandar para o escritorio inteiro faria cada um achar
    // que e do outro — que e o problema que ter responsavel resolve.
    expect(new Set(avisos.map((a) => a.usuarioId))).toEqual(new Set([dono.id]));
    expect(avisos[0].assunto).toContain("Protocolar a peticao");

    // De novo nao repete.
    expect(await avisarDesignacao(escritorio, tarefa.id)).toBe(0);

    // Quem designa para si mesmo acabou de digitar: nao recebe aviso.
    const outra = await comEscritorio(escritorio, (db) =>
      db.compromisso.create({
        data: semEscritorio({
          titulo: "Minha propria tarefa",
          tipo: "TAREFA",
          inicio: new Date(Date.now() + 5 * HORA),
          responsavelId: dono.id,
        }),
      }),
    );
    expect(await avisarDesignacao(escritorio, outra.id, dono.id)).toBe(0);

    await comEscritorio(escritorio, async (db) => {
      await db.aviso.deleteMany({ where: { tipo: "TAREFA_DESIGNADA" } });
      await db.compromisso.deleteMany({ where: { id: { in: [tarefa.id, outra.id] } } });
      await db.usuario.delete({ where: { id: dono.id } });
    });
  });

  it("o agendamento avisa quem vai comparecer — e tarefa nao avisa ninguem", async () => {
    const audiencia = await comEscritorio(escritorio, (db) =>
      db.compromisso.create({
        data: semEscritorio({
          titulo: "Audiencia marcada agora",
          tipo: "AUDIENCIA",
          inicio: new Date(Date.now() + 40 * 24 * HORA),
        }),
      }),
    );
    const tarefa = await comEscritorio(escritorio, (db) =>
      db.compromisso.create({
        data: semEscritorio({
          titulo: "Tarefa com gente junto",
          tipo: "TAREFA",
          inicio: new Date(Date.now() + 40 * 24 * HORA),
        }),
      }),
    );
    for (const c of [audiencia, tarefa]) {
      await comEscritorio(escritorio, (db) =>
        db.participanteDeCompromisso.create({
          data: semEscritorio({
            compromissoId: c.id,
            nome: "Testemunha",
            email: "testemunha@exemplo.test",
          }),
        }),
      );
    }

    // A audiencia e daqui a 40 dias: nenhum marco da regua alcanca. O aviso
    // de "marcado" sai assim mesmo, porque e a PRIMEIRA noticia.
    expect(await avisarAgendamento(escritorio, audiencia.id)).toBeGreaterThan(0);
    // Tarefa e trabalho do escritorio: quem esta de fora nao tem o que fazer
    // com esse aviso.
    expect(await avisarAgendamento(escritorio, tarefa.id)).toBe(0);

    const avisos = await comEscritorio(escritorio, (db) =>
      db.aviso.findMany({ where: { tipo: "COMPROMISSO_MARCADO" } }),
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0].corpo).toContain("3 dias antes");

    await comEscritorio(escritorio, async (db) => {
      await db.aviso.deleteMany({ where: { tipo: "COMPROMISSO_MARCADO" } });
      await db.compromisso.deleteMany({
        where: { id: { in: [audiencia.id, tarefa.id] } },
      });
    });
  });
});
