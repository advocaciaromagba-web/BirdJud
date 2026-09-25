// Modulo de publicacoes: leitura do texto, captura do DJEN e deduplicacao.
//
// A API do DJEN bloqueia acesso de fora do Brasil, entao aqui ela e servida
// por um HTTP local que responde no formato documentado. O que se prova e o
// comportamento do modulo — deduplicar, vincular, triar, nao vazar entre
// escritorios —, nao o formato da API, que tem um script proprio de
// conferencia (`npm run conferir-djen`).
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comEscritorio,
  prismaPlataforma,
  semEscritorio,
} from "../src/lib/prisma";
import { buscarPeriodo, converter, FalhaNoDjen } from "../src/lib/djen";
import {
  detectarPrazo,
  ehUrgente,
  formatarNumeroProcesso,
  normalizarNumeroProcesso,
  numeroParaGravar,
  triar,
} from "../src/lib/leitura-publicacao";
import { capturarPublicacoes, periodoDaConsulta } from "../src/lib/publicacoes";
import { consumoDoMes } from "../src/lib/consumo";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;
const DIA = 24 * 60 * 60 * 1000;

describe("leitura do texto da publicacao", () => {
  it("acha o prazo em numero", () => {
    expect(
      detectarPrazo("Fica intimado para, no prazo de 15 dias, manifestar-se."),
    ).toBe(15);
    expect(
      detectarPrazo("apresentar contestacao em 5 (cinco) dias uteis"),
    ).toBe(5);
  });

  it("acha o prazo por extenso", () => {
    expect(detectarPrazo("no prazo de quinze dias")).toBe(15);
    expect(detectarPrazo("em cinco dias")).toBe(5);
  });

  it("havendo mais de um prazo, fica com o menor", () => {
    // O que vence primeiro e o que importa para quem esta olhando a lista.
    expect(detectarPrazo("recurso em 15 dias; embargos em 5 dias")).toBe(5);
  });

  it("ignora numero que nao e prazo", () => {
    expect(
      detectarPrazo("processo 0001234-56.2026.8.26.0100 distribuido"),
    ).toBeNull();
    expect(detectarPrazo("valor de R$ 1.500,00")).toBeNull();
  });

  it("marca urgencia por ato, mesmo sem prazo", () => {
    expect(ehUrgente("Designada audiencia de instrucao para 10/10", null)).toBe(
      true,
    );
    expect(ehUrgente("Deferida a liminar", null)).toBe(true);
    expect(ehUrgente("Determinada a penhora de bens", null)).toBe(true);
    expect(ehUrgente("Juntada de peticao", null)).toBe(false);
  });

  it("marca urgencia por prazo curto", () => {
    expect(ehUrgente("Manifeste-se em 5 dias", 5)).toBe(true);
    expect(ehUrgente("Manifeste-se em 15 dias", 15)).toBe(false);
  });

  it("le com e sem acento", () => {
    expect(ehUrgente("AUDIÊNCIA designada", null)).toBe(true);
    expect(ehUrgente("audiencia designada", null)).toBe(true);
  });

  it("triagem junta as duas leituras", () => {
    expect(triar("Audiencia designada. Prazo de 10 dias.")).toEqual({
      prazoDias: 10,
      urgente: true,
    });
  });

  it("numero de processo: aceita so o formato CNJ", () => {
    expect(normalizarNumeroProcesso("0001234-56.2026.8.26.0100")).toBe(
      "00012345620268260100",
    );
    expect(normalizarNumeroProcesso("123")).toBeNull();
    expect(normalizarNumeroProcesso(null)).toBeNull();
  });

  it("formata o numero de volta para leitura humana", () => {
    expect(formatarNumeroProcesso("00012345620268260100")).toBe(
      "0001234-56.2026.8.26.0100",
    );
  });

  it("grava sempre a mesma grafia, digitado com ou sem mascara", () => {
    // Sem isto, processo cadastrado com mascara nunca casa com a publicacao
    // do DJEN — e o vinculo automatico, que e o valor do modulo, nao acontece.
    expect(numeroParaGravar("0001234-56.2026.8.26.0100")).toBe(
      "00012345620268260100",
    );
    expect(numeroParaGravar(" 00012345620268260100 ")).toBe(
      "00012345620268260100",
    );
  });

  it("numero que nao e CNJ fica como foi digitado", () => {
    // Processo antigo, de numeracao anterior ao CNJ, continua cadastravel.
    expect(numeroParaGravar("123/2001")).toBe("123/2001");
  });
});

describe("conversao do item do DJEN", () => {
  it("aceita as duas convencoes de nome que a API usa", () => {
    const comSnake = converter({
      id: 9,
      data_disponibilizacao: "2026-09-10",
      numero_processo: "0001234-56.2026.8.26.0100",
      siglaTribunal: "TJSP",
      texto: "Intimacao",
    });
    expect(comSnake?.idExterno).toBe("9");
    expect(comSnake?.tribunal).toBe("TJSP");

    const comCamel = converter({
      id: "10",
      dataDisponibilizacao: "2026-09-10",
      numeroProcesso: "0001234-56.2026.8.26.0100",
      texto: "Intimacao",
    });
    expect(comCamel?.numeroProcesso).toBe("0001234-56.2026.8.26.0100");
  });

  it("descarta item sem id, sem texto ou com data invalida", () => {
    expect(
      converter({ texto: "x", data_disponibilizacao: "2026-09-10" }),
    ).toBeNull();
    expect(
      converter({ id: 1, data_disponibilizacao: "2026-09-10" }),
    ).toBeNull();
    expect(
      converter({ id: 1, texto: "x", data_disponibilizacao: "nao-e-data" }),
    ).toBeNull();
  });
});

describe("periodo da consulta", () => {
  it("OAB nova busca a janela inicial", () => {
    const agora = new Date("2026-09-18T03:00:00Z");
    const { de, ate } = periodoDaConsulta(null, agora);
    expect(ate).toEqual(agora);
    expect(Math.round((agora.getTime() - de.getTime()) / DIA)).toBe(7);
  });

  it("OAB ja capturada volta um pouco para tras", () => {
    const agora = new Date("2026-09-18T03:00:00Z");
    const ontem = new Date("2026-09-17T03:00:00Z");
    const { de } = periodoDaConsulta(ontem, agora);
    // Sobreposicao: a deduplicacao descarta o repetido, e nada de borda se perde.
    expect(Math.round((ontem.getTime() - de.getTime()) / DIA)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// DJEN servido localmente
// ---------------------------------------------------------------------------

let servidor: Server;
let responder: (url: URL) => { status: number; json: unknown } = () => ({
  status: 200,
  json: { items: [], count: 0 },
});

beforeAll(async () => {
  servidor = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://local");
    const resposta = responder(url);
    res.writeHead(resposta.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(resposta.json));
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  const porta = (servidor.address() as { port: number }).port;
  process.env.DJEN_BASE_URL = `http://127.0.0.1:${porta}`;
});

afterAll(async () => {
  await new Promise<void>((ok) => servidor.close(() => ok()));
});

function comunicacao(id: number, texto: string, numero?: string) {
  return {
    id,
    data_disponibilizacao: "2026-09-17",
    numero_processo: numero ?? "0001234-56.2026.8.26.0100",
    siglaTribunal: "TJSP",
    nomeOrgao: "1a Vara Civel",
    tipoComunicacao: "Intimacao",
    texto,
    link: `https://dje.exemplo/${id}`,
  };
}

describe("cliente do DJEN", () => {
  it("manda OAB, UF e periodo na consulta", async () => {
    let vistos: Record<string, string> = {};
    responder = (url) => {
      vistos = Object.fromEntries(url.searchParams);
      return {
        status: 200,
        json: { items: [comunicacao(1, "Intimacao")], count: 1 },
      };
    };

    await buscarPeriodo({
      numeroOab: "123456",
      ufOab: "SP",
      de: new Date("2026-09-10T00:00:00Z"),
      ate: new Date("2026-09-17T00:00:00Z"),
    });

    expect(vistos.numeroOab).toBe("123456");
    expect(vistos.ufOab).toBe("SP");
    expect(vistos.dataDisponibilizacaoInicio).toBe("2026-09-10");
    expect(vistos.dataDisponibilizacaoFim).toBe("2026-09-17");
  });

  it("explica o 403 como bloqueio por pais", async () => {
    responder = () => ({ status: 403, json: {} });
    await expect(
      buscarPeriodo({
        numeroOab: "1",
        ufOab: "SP",
        de: new Date(),
        ate: new Date(),
      }),
    ).rejects.toThrow(/fora do Brasil/);
  });

  it("recusa resposta sem a lista de comunicacoes", async () => {
    responder = () => ({ status: 200, json: { mensagem: "ok" } });
    await expect(
      buscarPeriodo({
        numeroOab: "1",
        ufOab: "SP",
        de: new Date(),
        ate: new Date(),
      }),
    ).rejects.toBeInstanceOf(FalhaNoDjen);
  });

  it("percorre as paginas ate completar o total", async () => {
    responder = (url) => {
      const pagina = Number(url.searchParams.get("pagina"));
      const itens =
        pagina <= 2 ? [comunicacao(pagina * 10, `pagina ${pagina}`)] : [];
      return { status: 200, json: { items: itens, count: 2 } };
    };

    const todas = await buscarPeriodo({
      numeroOab: "1",
      ufOab: "SP",
      de: new Date(),
      ate: new Date(),
      itensPorPagina: 1,
    });
    expect(todas).toHaveLength(2);
  });
});

let alfa = "";
let beta = "";
const marca = Date.now();

d("captura por escritorio", () => {
  beforeAll(async () => {
    const a = await prismaPlataforma().escritorio.create({
      data: { slug: `pub-a-${marca}`, nome: "Alfa Publicacoes" },
    });
    const b = await prismaPlataforma().escritorio.create({
      data: { slug: `pub-b-${marca}`, nome: "Beta Publicacoes" },
    });
    alfa = a.id;
    beta = b.id;

    await comEscritorio(alfa, async (db) => {
      await db.oabMonitorada.create({
        data: semEscritorio({ numero: "111111", uf: "SP" }),
      });
      // Cadastrado pela mesma funcao que a rota usa, com mascara: e assim que
      // um usuario digita, e o vinculo tem de funcionar mesmo assim.
      await db.processo.create({
        data: semEscritorio({
          numero: numeroParaGravar("0001234-56.2026.8.26.0100"),
          tribunal: "TJSP",
        }),
      });
    });
    await comEscritorio(beta, (db) =>
      db.oabMonitorada.create({
        data: semEscritorio({ numero: "222222", uf: "MG" }),
      }),
    );
  });

  afterAll(async () => {
    for (const id of [alfa, beta]) {
      if (id)
        await prismaPlataforma()
          .escritorio.delete({ where: { id } })
          .catch(() => {});
    }
    await prismaPlataforma().$disconnect();
  });

  it("grava, tria e vincula ao processo ja cadastrado", async () => {
    responder = () => ({
      status: 200,
      json: {
        count: 2,
        items: [
          comunicacao(
            1001,
            "Designada audiencia de instrucao. Prazo de 5 dias.",
          ),
          comunicacao(1002, "Juntada de peticao.", "9999999-99.2026.8.26.0100"),
        ],
      },
    });

    const resultado = await capturarPublicacoes(alfa);
    expect(resultado).toMatchObject({
      oabsConsultadas: 1,
      novas: 2,
      vinculadas: 1,
    });

    const publicacoes = await comEscritorio(alfa, (db) =>
      db.publicacao.findMany({ orderBy: { idExterno: "asc" } }),
    );
    expect(publicacoes).toHaveLength(2);
    expect(publicacoes[0]).toMatchObject({ urgente: true, prazoDias: 5 });
    expect(publicacoes[0]?.processoId).not.toBeNull();
    // Processo que o escritorio nao tem cadastrado entra sem vinculo.
    expect(publicacoes[1]?.processoId).toBeNull();
  });

  it("capturar de novo nao duplica", async () => {
    const resultado = await capturarPublicacoes(alfa);
    expect(resultado.novas).toBe(0);
    await expect(
      comEscritorio(alfa, (db) => db.publicacao.count()),
    ).resolves.toBe(2);
  });

  it("a mesma comunicacao por duas OABs entra uma vez so", async () => {
    await comEscritorio(alfa, (db) =>
      db.oabMonitorada.create({
        data: semEscritorio({ numero: "333333", uf: "SP" }),
      }),
    );
    responder = () => ({
      status: 200,
      json: {
        count: 1,
        items: [comunicacao(2001, "Intimacao compartilhada.")],
      },
    });

    const resultado = await capturarPublicacoes(alfa);
    expect(resultado.oabsConsultadas).toBe(2);
    // Duas OABs trouxeram a mesma comunicacao; so uma linha foi criada.
    expect(resultado.recebidas).toBe(2);
    expect(resultado.novas).toBe(1);
  });

  it("mede o consumo por OAB consultada", async () => {
    const consumo = await consumoDoMes(alfa);
    const oabs = consumo.find((l) => l.metrica === "OAB_MONITORADA");
    expect(oabs?.quantidade).toBeGreaterThan(0);
  });

  it("publicacao de um escritorio nao aparece no outro", async () => {
    await expect(
      comEscritorio(beta, (db) => db.publicacao.count()),
    ).resolves.toBe(0);
  });

  it("falha de uma OAB nao impede as outras, e nao avanca a marca dela", async () => {
    const antes = await comEscritorio(alfa, (db) =>
      db.oabMonitorada.findFirstOrThrow({ where: { numero: "111111" } }),
    );

    responder = (url) => {
      if (url.searchParams.get("numeroOab") === "111111")
        return { status: 500, json: {} };
      return {
        status: 200,
        json: { count: 1, items: [comunicacao(3001, "Outra intimacao.")] },
      };
    };

    const resultado = await capturarPublicacoes(alfa);
    expect(resultado.falhas).toHaveLength(1);
    expect(resultado.falhas[0]?.oab).toBe("111111/SP");
    // A outra OAB seguiu e trouxe a publicacao nova.
    expect(resultado.novas).toBe(1);

    // A marca da OAB que falhou fica onde estava. Se avancasse, a proxima
    // consulta comecaria depois de um periodo que ninguem chegou a ler — e
    // essas publicacoes se perderiam em silencio.
    const depois = await comEscritorio(alfa, (db) =>
      db.oabMonitorada.findFirstOrThrow({ where: { numero: "111111" } }),
    );
    expect(depois.ultimaCaptura).toEqual(antes.ultimaCaptura);
  });

  it("OAB desativada nao e consultada", async () => {
    await comEscritorio(alfa, (db) =>
      db.oabMonitorada.updateMany({ data: { ativo: false } }),
    );
    responder = () => ({ status: 200, json: { count: 0, items: [] } });

    const resultado = await capturarPublicacoes(alfa);
    expect(resultado.oabsConsultadas).toBe(0);
  });
});
