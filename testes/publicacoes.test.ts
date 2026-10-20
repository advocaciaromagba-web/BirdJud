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

describe("leitura do texto da publicação", () => {
  it("acha o prazo em número", () => {
    expect(
      detectarPrazo("Fica intimado para, no prazo de 15 dias, manifestar-se."),
    ).toBe(15);
    expect(
      detectarPrazo("apresentar contestação em 5 (cinco) dias úteis"),
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

  it("ignora número que não e prazo", () => {
    expect(
      detectarPrazo("processo 0001234-56.2026.8.26.0100 distribuido"),
    ).toBeNull();
    expect(detectarPrazo("valor de R$ 1.500,00")).toBeNull();
  });

  it("marca urgência por ato, mesmo sem prazo", () => {
    expect(ehUrgente("Designada audiência de instrução para 10/10", null)).toBe(
      true,
    );
    expect(ehUrgente("Deferida a liminar", null)).toBe(true);
    expect(ehUrgente("Determinada a penhora de bens", null)).toBe(true);
    expect(ehUrgente("Juntada de petição", null)).toBe(false);
  });

  it("marca urgência por prazo curto", () => {
    expect(ehUrgente("Manifeste-se em 5 dias", 5)).toBe(true);
    expect(ehUrgente("Manifeste-se em 15 dias", 15)).toBe(false);
  });

  it("le com e sem acento", () => {
    expect(ehUrgente("AUDIÊNCIA designada", null)).toBe(true);
    expect(ehUrgente("audiência designada", null)).toBe(true);
  });

  it("triagem junta as duas leituras", () => {
    expect(triar("Audiência designada. Prazo de 10 dias.")).toEqual({
      prazoDias: 10,
      urgente: true,
    });
  });

  it("número de processo: aceita só o formato CNJ", () => {
    expect(normalizarNumeroProcesso("0001234-56.2026.8.26.0100")).toBe(
      "00012345620268260100",
    );
    expect(normalizarNumeroProcesso("123")).toBeNull();
    expect(normalizarNumeroProcesso(null)).toBeNull();
  });

  it("formata o número de volta para leitura humana", () => {
    expect(formatarNumeroProcesso("00012345620268260100")).toBe(
      "0001234-56.2026.8.26.0100",
    );
  });

  it("grava sempre a mesma grafia, digitado com ou sem máscara", () => {
    // Sem isto, processo cadastrado com mascara nunca casa com a publicacao
    // do DJEN — e o vinculo automatico, que e o valor do modulo, nao acontece.
    expect(numeroParaGravar("0001234-56.2026.8.26.0100")).toBe(
      "00012345620268260100",
    );
    expect(numeroParaGravar(" 00012345620268260100 ")).toBe(
      "00012345620268260100",
    );
  });

  it("número que não e CNJ fica como foi digitado", () => {
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

  it("descarta item sem id, sem texto ou com data inválida", () => {
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

describe("período da consulta", () => {
  it("OAB nova busca a janela inicial", () => {
    const agora = new Date("2026-09-18T03:00:00Z");
    const { de, ate } = periodoDaConsulta(null, agora);
    expect(ate).toEqual(agora);
    expect(Math.round((agora.getTime() - de.getTime()) / DIA)).toBe(7);
  });

  it("OAB já capturada volta um pouco para trás", () => {
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

// As OABs usadas nos testes. A comunicacao real traz os advogados intimados,
// e o cliente do DJEN reconfere numero E UF (licao do sistema da Roma): sem
// eles na lista, a comunicacao e de outro advogado e fica de fora.
// Sem a pausa entre paginas (limite de taxa do CNJ) nos testes.
process.env.DJEN_PAUSA_MS = "0";
const ADVOGADOS = [
  ["123456", "SP"], ["123456", "BA"], ["1", "SP"], ["111111", "SP"], ["222222", "MG"], ["333333", "SP"],
].map(([numero_oab, uf_oab]) => ({ advogado: { numero_oab, uf_oab, nome: "Advogado de teste" } }));

function comunicacao(id: number, texto: string, numero?: string) {
  return {
    destinatarioadvogados: ADVOGADOS,
    destinatarios: [{ nome: "MARIA APARECIDA SOUZA", polo: "A" }],
    id,
    data_disponibilizacao: "2026-09-17",
    numero_processo: numero ?? "0001234-56.2026.8.26.0100",
    siglaTribunal: "TJSP",
    nomeOrgao: "1a Vara Cível",
    tipoComunicacao: "Intimacao",
    texto,
    link: `https://dje.exemplo/${id}`,
  };
}

describe("cliente do DJEN", () => {
  it("manda OAB, UF e período na consulta", async () => {
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

  // A abrangencia e nacional: ufOab e o estado de inscricao da OAB, nao um
  // filtro de tribunal. Conferido contra o CNJ — ufOab=BA devolveu TJBA, TJSP
  // e TRF1 juntos. Este teste existe para que ninguem acrescente um filtro
  // achando que falta, e estreite o que o escritorio recebe.
  it("não manda filtro de tribunal, e guarda o que vem de qualquer um", async () => {
    let vistos: Record<string, string> = {};
    responder = (url) => {
      vistos = Object.fromEntries(url.searchParams);
      return {
        status: 200,
        json: {
          count: 3,
          items: [
            { ...comunicacao(1, "Intimacao"), siglaTribunal: "TJBA" },
            { ...comunicacao(2, "Intimacao"), siglaTribunal: "TJSP" },
            { ...comunicacao(3, "Intimacao"), siglaTribunal: "TRF1" },
          ],
        },
      };
    };

    const achadas = await buscarPeriodo({
      numeroOab: "123456",
      ufOab: "BA",
      de: new Date("2026-09-10T00:00:00Z"),
      ate: new Date("2026-09-17T00:00:00Z"),
    });

    for (const proibido of ["siglaTribunal", "tribunal", "orgao", "nomeOrgao"]) {
      expect(vistos[proibido]).toBeUndefined();
    }
    expect(achadas.map((c) => c.tribunal)).toEqual(["TJBA", "TJSP", "TRF1"]);
  });

  it("comunicação de outro advogado (mesmo número, outra UF) fica de fora", async () => {
    responder = () => ({
      status: 200,
      json: {
        count: 2,
        items: [
          comunicacao(1, "Desta OAB"),
          {
            ...comunicacao(2, "De outra UF"),
            destinatarioadvogados: [{ advogado: { numero_oab: "123456", uf_oab: "MG", nome: "Outro" } }],
          },
        ],
      },
    });
    const achadas = await buscarPeriodo({ numeroOab: "123456", ufOab: "SP", de: new Date(), ate: new Date() });
    expect(achadas.map((c) => c.texto)).toEqual(["Desta OAB"]);
  });

  it("le data brasileira, limpa HTML e traz as partes", async () => {
    responder = () => ({
      status: 200,
      json: {
        count: 1,
        items: [
          {
            ...comunicacao(1, "<p>Fica intimada a parte&nbsp;autora.</p>"),
            data_disponibilizacao: undefined,
            datadisponibilizacao: "14/09/2026",
          },
        ],
      },
    });
    const [c] = await buscarPeriodo({ numeroOab: "123456", ufOab: "SP", de: new Date(), ate: new Date() });
    expect(c.dataDisponibilizacao.toISOString().slice(0, 10)).toBe("2026-09-14");
    expect(c.texto).toBe("Fica intimada a parte autora.");
    expect(c.partes).toEqual([{ nome: "MARIA APARECIDA SOUZA", polo: "A" }]);
  });

  it("nunca pede mais que 50 por página (acima disso a API devolve vazio)", async () => {
    let pedido = "";
    responder = (url) => {
      pedido = url.searchParams.get("itensPorPagina") ?? "";
      return { status: 200, json: { items: [], count: 0 } };
    };
    await buscarPeriodo({ numeroOab: "1", ufOab: "SP", de: new Date(), ate: new Date(), itensPorPagina: 100 });
    expect(pedido).toBe("50");
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

  it("recusa resposta sem a lista de comunicações", async () => {
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

  it("percorre as páginas até completar o total", async () => {
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

d("captura por escritório", () => {
  beforeAll(async () => {
    const a = await prismaPlataforma().escritorio.create({
      data: { slug: `pub-a-${marca}`, nome: "Alfa Publicações" },
    });
    const b = await prismaPlataforma().escritorio.create({
      data: { slug: `pub-b-${marca}`, nome: "Beta Publicações" },
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

  it("grava, tria e vincula ao processo já cadastrado", async () => {
    responder = () => ({
      status: 200,
      json: {
        count: 2,
        items: [
          comunicacao(
            1001,
            "Designada audiência de instrução. Prazo de 5 dias.",
          ),
          comunicacao(1002, "Juntada de petição.", "9999999-99.2026.8.26.0100"),
        ],
      },
    });

    const resultado = await capturarPublicacoes(alfa);
    expect(resultado).toMatchObject({
      oabsConsultadas: 1,
      novas: 2,
      vinculadas: 1,
      processosNovos: 1,
    });

    const publicacoes = await comEscritorio(alfa, (db) =>
      db.publicacao.findMany({ orderBy: { idExterno: "asc" } }),
    );
    expect(publicacoes).toHaveLength(2);
    expect(publicacoes[0]).toMatchObject({ urgente: true, prazoDias: 5 });
    expect(publicacoes[0]?.processoId).not.toBeNull();
    // Processo que o escritorio nao tinha: cadastrado na hora, a partir do
    // DJEN (processos-do-djen.ts), e a publicacao ja entra ligada a ele.
    expect(publicacoes[1]?.processoId).not.toBeNull();
  });

  it("capturar de novo não duplica", async () => {
    const resultado = await capturarPublicacoes(alfa);
    expect(resultado.novas).toBe(0);
    await expect(
      comEscritorio(alfa, (db) => db.publicacao.count()),
    ).resolves.toBe(2);
  });

  it("a mesma comunicação por duas OABs entra uma vez só", async () => {
    await comEscritorio(alfa, (db) =>
      db.oabMonitorada.create({
        data: semEscritorio({ numero: "333333", uf: "SP" }),
      }),
    );
    responder = () => ({
      status: 200,
      json: {
        count: 1,
        items: [comunicacao(2001, "Intimação compartilhada.")],
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

  it("publicação de um escritório não aparece no outro", async () => {
    await expect(
      comEscritorio(beta, (db) => db.publicacao.count()),
    ).resolves.toBe(0);
  });

  it("falha de uma OAB não impede as outras, e não avanca a marca dela", async () => {
    const antes = await comEscritorio(alfa, (db) =>
      db.oabMonitorada.findFirstOrThrow({ where: { numero: "111111" } }),
    );

    responder = (url) => {
      if (url.searchParams.get("numeroOab") === "111111")
        return { status: 500, json: {} };
      return {
        status: 200,
        json: { count: 1, items: [comunicacao(3001, "Outra intimação.")] },
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

  it("OAB desativada não e consultada", async () => {
    await comEscritorio(alfa, (db) =>
      db.oabMonitorada.updateMany({ data: { ativo: false } }),
    );
    responder = () => ({ status: 200, json: { count: 0, items: [] } });

    const resultado = await capturarPublicacoes(alfa);
    expect(resultado.oabsConsultadas).toBe(0);
  });
});
