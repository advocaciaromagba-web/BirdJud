// Painel do dia e busca unica.
//
// O que se prova: o painel mostra o que pede acao e cala sobre modulo nao
// contratado; a busca acha pelo numero com e sem mascara, cobre os quatro
// tipos e nao atravessa escritorio.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { salvarIntegracao } from "../src/lib/integracao";
import { montarPainel, pendenciasVisiveis } from "../src/lib/painel";
import { buscar, MINIMO_DE_LETRAS, termoUtil } from "../src/lib/busca";
import { fichaDoProcesso } from "../src/lib/processo";
import { numeroParaGravar } from "../src/lib/leitura-publicacao";
import { dataBR, diaEmBrasilia, ehMesmoDiaEmBrasilia, horaBR } from "../src/lib/datas";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

describe("termo de busca", () => {
  it("termo curto demais nao vira consulta", () => {
    expect(termoUtil("ab")).toBeNull();
    expect(termoUtil("   ")).toBeNull();
    expect(termoUtil(" souza ")).toBe("souza");
    expect(MINIMO_DE_LETRAS).toBe(3);
  });
});

describe("pendencia por papel", () => {
  it("o que so admin resolve nao aparece para os outros", () => {
    const pendencias = [
      { tipo: "SEM_OAB" as const, texto: "x", destino: "/publicacoes", soAdmin: true },
      { tipo: "AVISOS_FALHADOS" as const, texto: "y", destino: "/integracoes", soAdmin: false },
    ];
    expect(pendenciasVisiveis(pendencias, "ADMIN")).toHaveLength(2);
    expect(pendenciasVisiveis(pendencias, "USUARIO")).toHaveLength(1);
  });
});

// Relogio preso no meio da tarde de Brasilia.
//
// O teste do painel afirma que uma audiencia daqui a tres horas e "hoje".
// Com o relogio real isso deixava de ser verdade entre 21h e meia-noite de
// Brasilia: tres horas depois ja e o dia seguinte, e a suite quebrava so por
// causa da hora em que rodou. So a Date e falsa; os temporizadores continuam
// reais, senao o cliente do banco trava.
const AGORA = new Date("2026-09-24T17:00:00Z"); // 14h em Brasilia

const marca = Date.now();
let alfa = "";
let beta = "";

d("painel e busca por escritorio", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(AGORA);

    process.env.SEGREDO_CHAVE ??= Buffer.alloc(32, 6).toString("base64");

    const a = await prismaPlataforma().escritorio.create({
      data: { slug: `pnl-a-${marca}`, nome: "Alfa Painel" },
    });
    const b = await prismaPlataforma().escritorio.create({
      data: { slug: `pnl-b-${marca}`, nome: "Beta Painel" },
    });
    alfa = a.id;
    beta = b.id;

    await comEscritorio(alfa, async (db) => {
      for (const modulo of ["PUBLICACOES_DJEN", "EMAIL", "COBRANCAS", "NUVEM"]) {
        await db.moduloContratado.create({ data: semEscritorio({ modulo, ativo: true }) });
      }
      const cliente = await db.cliente.create({
        data: semEscritorio({ nome: "Souza e Filhos Ltda", documento: "11222333000181" }),
      });
      const processo = await db.processo.create({
        data: semEscritorio({
          numero: numeroParaGravar("0001234-56.2026.8.26.0100"),
          vara: "1a Vara Civel",
          area: "Civel",
          clienteId: cliente.id,
        }),
      });
      await db.compromisso.create({
        data: semEscritorio({
          titulo: "Audiencia de instrucao",
          tipo: "AUDIENCIA",
          inicio: new Date(Date.now() + 3 * HORA),
          local: "Forum central",
          processoId: processo.id,
        }),
      });
      await db.compromisso.create({
        data: semEscritorio({
          titulo: "Daqui a uma semana",
          tipo: "REUNIAO",
          inicio: new Date(Date.now() + 7 * DIA),
        }),
      });
      await db.publicacao.create({
        data: semEscritorio({
          idExterno: `pnl-${marca}`,
          texto: "Fica intimado para, no prazo de 5 dias, manifestar-se sobre a pericia.",
          dataDisponibilizacao: new Date(),
          numeroProcesso: numeroParaGravar("0001234-56.2026.8.26.0100"),
          urgente: true,
          prazoDias: 5,
        }),
      });
      await db.oabMonitorada.create({ data: semEscritorio({ numero: "123456", uf: "BA" }) });
      await db.cobranca.create({
        data: semEscritorio({
          clienteId: cliente.id,
          descricao: "Honorarios de agosto",
          valorCentavos: 250_000,
          vencimento: new Date(Date.now() - 10 * DIA),
          forma: "BOLETO",
          status: "VENCIDA",
          idNoAsaas: `pay-pnl-${marca}`,
        }),
      });
      await db.arquivo.create({
        data: semEscritorio({
          nome: "procuracao-souza.pdf",
          tipo: "application/pdf",
          tamanhoBytes: 1024,
          descricao: "Procuracao assinada",
        }),
      });
    });

    // O Beta nao contratou nada alem do nucleo.
    await comEscritorio(beta, (db) =>
      db.cliente.create({ data: semEscritorio({ nome: "Cliente do Beta" }) })
    );
  });

  afterAll(async () => {
    vi.useRealTimers();
    for (const id of [alfa, beta]) {
      if (id) await prismaPlataforma().escritorio.delete({ where: { id } }).catch(() => {});
    }
    await prismaPlataforma().$disconnect();
  });

  it("mostra o que acontece nas proximas 48 horas, e nao o que e daqui a uma semana", async () => {
    const painel = await montarPainel(alfa);
    expect(painel.compromissos).toHaveLength(1);
    expect(painel.compromissos[0].titulo).toBe("Audiencia de instrucao");
    expect(painel.compromissos[0].hoje).toBe(true);
  });

  it("traz a publicacao urgente e a cobranca vencida com o total", async () => {
    const painel = await montarPainel(alfa);
    expect(painel.naoLidas).toBe(1);
    expect(painel.publicacoes[0].urgente).toBe(true);
    expect(painel.publicacoes[0].prazoDias).toBe(5);
    expect(painel.cobrancasVencidas).toEqual({ quantidade: 1, totalCentavos: 250_000 });
  });

  it("aponta a integracao que falta e a que esta com erro", async () => {
    const semEmail = await montarPainel(alfa);
    // O modulo de e-mail esta contratado e o SMTP nao foi conectado.
    expect(semEmail.pendencias.map((p) => p.tipo)).toContain("SEM_INTEGRACAO_EMAIL");

    await salvarIntegracao(alfa, "SMTP", { host: "x", porta: "587" }, "ERRO", "recusado");
    const comErro = await montarPainel(alfa);
    expect(comErro.pendencias.map((p) => p.tipo)).not.toContain("SEM_INTEGRACAO_EMAIL");
    expect(comErro.pendencias.map((p) => p.tipo)).toContain("INTEGRACAO_COM_ERRO");
  });

  it("escritorio sem os modulos nao ve bloco nenhum deles, nem vazio", async () => {
    const painel = await montarPainel(beta);
    expect(painel.publicacoes).toHaveLength(0);
    expect(painel.naoLidas).toBe(0);
    expect(painel.cobrancasVencidas.quantidade).toBe(0);
    // E nao pede OAB nem e-mail de quem nao contratou esses modulos.
    expect(painel.pendencias.map((p) => p.tipo)).not.toContain("SEM_OAB");
    expect(painel.pendencias.map((p) => p.tipo)).not.toContain("SEM_INTEGRACAO_EMAIL");
  });

  it("acha o processo com e sem mascara", async () => {
    const comMascara = await buscar(alfa, "0001234-56.2026.8.26.0100");
    const semMascara = await buscar(alfa, "00012345620268260100");

    for (const achados of [comMascara, semMascara]) {
      expect(achados.some((a) => a.tipo === "PROCESSO")).toBe(true);
      // A publicacao daquele processo vem junto: e o que a pessoa quer ver.
      expect(achados.some((a) => a.tipo === "PUBLICACAO")).toBe(true);
    }
  });

  it("acha cliente, arquivo e o texto da publicacao", async () => {
    const porNome = await buscar(alfa, "souza");
    expect(porNome.map((a) => a.tipo)).toContain("CLIENTE");
    expect(porNome.map((a) => a.tipo)).toContain("ARQUIVO");

    const porTexto = await buscar(alfa, "pericia");
    expect(porTexto.some((a) => a.tipo === "PUBLICACAO")).toBe(true);

    // Maiuscula e minuscula nao mudam o resultado.
    expect((await buscar(alfa, "SOUZA")).length).toBe(porNome.length);
  });

  it("nao acha o que e de outro escritorio", async () => {
    expect(await buscar(beta, "souza")).toHaveLength(0);
    expect(await buscar(beta, "0001234-56.2026.8.26.0100")).toHaveLength(0);
    // E o do Beta aparece para o Beta.
    expect((await buscar(beta, "Cliente do Beta")).length).toBeGreaterThan(0);
  });

  it("termo curto nao devolve o escritorio inteiro", async () => {
    expect(await buscar(alfa, "so")).toHaveLength(0);
  });

  it("busca nao vaza modulo nao contratado", async () => {
    // O Beta nao tem publicacoes nem nuvem: mesmo com termo que casaria,
    // nao ha de onde vir resultado.
    const achados = await buscar(beta, "pericia");
    expect(achados).toHaveLength(0);
  });

    it("junta publicacao, agenda, documento e cobranca do mesmo caso", async () => {
      const processo = await comEscritorio(alfa, (db) =>
        db.processo.findFirstOrThrow({
          where: { numero: numeroParaGravar("0001234-56.2026.8.26.0100") },
        })
      );
      // Amarra ao processo o que o escritorio do teste ja tem: a publicacao, o
      // arquivo e a cobranca. E o caso completo que a tela precisa mostrar.
      await comEscritorio(alfa, async (db) => {
        await db.publicacao.updateMany({ where: {}, data: { processoId: processo.id } });
        await db.arquivo.updateMany({ where: {}, data: { processoId: processo.id } });
        await db.cobranca.updateMany({ where: {}, data: { processoId: processo.id } });
      });

      const ficha = await fichaDoProcesso(alfa, processo.id);
      expect(ficha).not.toBeNull();
      expect(ficha!.processo.cliente?.nome).toBe("Souza e Filhos Ltda");
      expect(ficha!.publicacoes.length).toBeGreaterThan(0);
      expect(ficha!.compromissos.length).toBeGreaterThan(0);
      expect(ficha!.arquivos.length).toBeGreaterThan(0);
      expect(ficha!.cobrancas.length).toBeGreaterThan(0);
    });

    it("processo de outro escritorio nao abre, nem com o id na mao", async () => {
      const processo = await comEscritorio(alfa, (db) => db.processo.findFirstOrThrow());
      expect(await fichaDoProcesso(beta, processo.id)).toBeNull();
    });

    it("sem o modulo, o bloco daquele modulo nem vem vazio", async () => {
      const doBeta = await comEscritorio(beta, (db) =>
        db.processo.create({
          data: semEscritorio({ numero: numeroParaGravar("0009999-11.2026.8.05.0001") }),
        })
      );
      const ficha = await fichaDoProcesso(beta, doBeta.id);
      expect(ficha!.publicacoes).toHaveLength(0);
      expect(ficha!.arquivos).toHaveLength(0);
      expect(ficha!.cobrancas).toHaveLength(0);
    });
});

describe("fuso de Brasilia", () => {
  it("o dia e o de Brasilia, nao o do servidor", () => {
    // Servidor em UTC: 2026-09-21T01:15Z ainda e dia 20 em Brasilia.
    const audiencia = new Date("2026-09-21T01:15:00Z");
    const tarde = new Date("2026-09-20T20:15:00Z");

    expect(diaEmBrasilia(audiencia)).toBe("2026-09-20");
    expect(audiencia.toISOString().slice(0, 10)).toBe("2026-09-21"); // o do servidor
    expect(ehMesmoDiaEmBrasilia(audiencia, tarde)).toBe(true);
  });

  it("a virada do dia em Brasilia e as 3h UTC", () => {
    expect(diaEmBrasilia(new Date("2026-09-21T02:59:00Z"))).toBe("2026-09-20");
    expect(diaEmBrasilia(new Date("2026-09-21T03:01:00Z"))).toBe("2026-09-21");
  });

  it("a hora mostrada e a de Brasilia", () => {
    expect(horaBR.format(new Date("2026-09-21T01:15:00Z"))).toBe("22:15");
    expect(dataBR.format(new Date("2026-09-21T01:15:00Z"))).toBe("20/09/2026");
  });
});
