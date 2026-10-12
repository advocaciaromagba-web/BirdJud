// Processos cadastrados a partir do DJEN.
//
// O que se prova: processo novo que aparece numa publicacao ja entra
// cadastrado e ligado ao cliente pelas partes; segredo de justica NAO e
// cadastrado sozinho; a OAB nova busca o ano inteiro sem duplicar; o cliente
// cadastrado depois puxa os processos com o nome dele; e comunicacao de outro
// advogado (o filtro furado da API) nao vira processo do escritorio.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import {
  clienteDasPartes,
  importarProcessosDaOab,
  pareceSegredo,
  vincularProcessosAoCliente,
} from "../src/lib/processos-do-djen";
import { capturarPublicacoes } from "../src/lib/publicacoes";

process.env.DJEN_PAUSA_MS = "0";

describe("regras", () => {
  it("segredo de justica: pelo texto ou pelas partes em iniciais", () => {
    expect(pareceSegredo({ texto: "Processo em segredo de justica.", partes: [] })).toBe(true);
    expect(pareceSegredo({ texto: "Intimacao.", partes: [{ nome: "J. S. S.", polo: "A" }] })).toBe(true);
    expect(pareceSegredo({ texto: "Intimacao.", partes: [{ nome: "M.A.S", polo: "A" }] })).toBe(true);
    expect(pareceSegredo({ texto: "Intimacao.", partes: [{ nome: "***", polo: "P" }] })).toBe(true);
    expect(pareceSegredo({ texto: "Intimacao.", partes: [{ nome: "MARIA APARECIDA SOUZA", polo: "A" }] })).toBe(false);
  });

  it("cliente pelas partes: so quando bate com um so, e sem confundir homonimo parcial", () => {
    const clientes = [
      { id: "maria", nome: "Maria Aparecida Souza" },
      { id: "jose", nome: "Jose da Silva" },
    ];
    expect(clienteDasPartes([{ nome: "MARIA APARECIDA SOUZA", polo: "A" }, { nome: "BANCO X S.A.", polo: "P" }], clientes)).toBe("maria");
    // Sobrenome de casada: mesmo nome com 3+ palavras contido.
    expect(clienteDasPartes([{ nome: "MARIA APARECIDA SOUZA LIMA", polo: "A" }], clientes)).toBe("maria");
    // "JOSE DA SILVA SANTOS" e outra pessoa.
    expect(clienteDasPartes([{ nome: "JOSE DA SILVA SANTOS", polo: "A" }], clientes)).toBeNull();
    // Dois clientes nas partes: nao escolhe.
    expect(clienteDasPartes([{ nome: "MARIA APARECIDA SOUZA", polo: "A" }, { nome: "JOSE DA SILVA", polo: "P" }], clientes)).toBeNull();
  });
});

let servidor: Server;
let itens: unknown[] = [];
let chamadas = 0;

const OAB = { numero: "445566", uf: "SP" };
const ADV = [{ advogado: { numero_oab: OAB.numero, uf_oab: OAB.uf, nome: "Dra. Teste" } }];

function comunicacao(id: number, numero: string, partes: string[], extra: Record<string, unknown> = {}) {
  return {
    id,
    data_disponibilizacao: "2026-09-17",
    numero_processo: numero,
    siglaTribunal: "TJSP",
    nomeOrgao: "1a Vara Civel de Guariba",
    nomeClasse: "PROCEDIMENTO COMUM CIVEL",
    tipoComunicacao: "Intimacao",
    texto: "Fica intimada a parte.",
    destinatarios: partes.map((nome) => ({ nome, polo: "A" })),
    destinatarioadvogados: ADV,
    ...extra,
  };
}

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

d("cadastro de processos pelo DJEN", () => {
  let escritorio = "";
  let oabId = "";
  let maria = "";

  beforeAll(async () => {
    servidor = createServer((req, res) => {
      chamadas += 1;
      const url = new URL(req.url ?? "/", "http://local");
      const pagina = Number(url.searchParams.get("pagina") ?? "1");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(pagina === 1 ? { items: itens, count: itens.length } : { items: [], count: 0 }));
    });
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    process.env.DJEN_BASE_URL = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;

    escritorio = (await prismaPlataforma().escritorio.create({ data: { slug: `djenproc-${Date.now()}`, nome: "Banca do DJEN" } })).id;
    await comEscritorio(escritorio, async (db) => {
      await db.moduloContratado.create({ data: semEscritorio({ modulo: "PUBLICACOES_DJEN", ativo: true }) });
      maria = (await db.cliente.create({ data: semEscritorio({ nome: "Maria Aparecida Souza" }) })).id;
      oabId = (await db.oabMonitorada.create({ data: semEscritorio({ numero: OAB.numero, uf: OAB.uf }) })).id;
    });
  });

  afterAll(async () => {
    await new Promise<void>((ok) => servidor.close(() => ok()));
    if (escritorio) await prismaPlataforma().escritorio.delete({ where: { id: escritorio } }).catch(() => {});
    await prismaPlataforma().$disconnect();
  });

  it("publicacao de processo novo: cadastra e liga ao cliente pelas partes", async () => {
    itens = [comunicacao(1, "1000001-11.2026.8.26.0222", ["MARIA APARECIDA SOUZA", "BANCO X S.A."])];
    const r = await capturarPublicacoes(escritorio);
    expect(r.processosNovos).toBe(1);
    const p = await comEscritorio(escritorio, (db) => db.processo.findFirstOrThrow({ where: { numero: "10000011120268260222" } }));
    expect(p.clienteId).toBe(maria);
    expect(p.origem).toBe("DJEN");
    expect(p.classe).toBe("PROCEDIMENTO COMUM CIVEL");
    const pub = await comEscritorio(escritorio, (db) => db.publicacao.findFirstOrThrow({ where: { idExterno: "1" } }));
    expect(pub.processoId).toBe(p.id);
  });

  it("segredo de justica nao e cadastrado: a publicacao fica marcada para a mao", async () => {
    itens = [comunicacao(2, "1000002-22.2026.8.26.0222", ["J. S. S."])];
    await capturarPublicacoes(escritorio);
    const pub = await comEscritorio(escritorio, (db) => db.publicacao.findFirstOrThrow({ where: { idExterno: "2" } }));
    expect(pub.segredo).toBe(true);
    expect(pub.processoId).toBeNull();
    expect(await comEscritorio(escritorio, (db) => db.processo.count({ where: { numero: "10000022220268260222" } }))).toBe(0);
  });

  it("comunicacao de outro advogado nao vira processo do escritorio", async () => {
    itens = [
      comunicacao(3, "1000003-33.2026.8.26.0222", ["FULANO DE TAL"], {
        destinatarioadvogados: [{ advogado: { numero_oab: OAB.numero, uf_oab: "MG", nome: "Outro" } }],
      }),
    ];
    await capturarPublicacoes(escritorio);
    expect(await comEscritorio(escritorio, (db) => db.processo.count({ where: { numero: "10000033320268260222" } }))).toBe(0);
  });

  it("OAB nova busca 12 meses, em janelas, sem duplicar, e marca a busca", async () => {
    itens = [
      comunicacao(10, "1000010-10.2025.8.26.0222", ["PEDRO HENRIQUE ALVES"]),
      comunicacao(11, "1000010-10.2025.8.26.0222", ["PEDRO HENRIQUE ALVES"]),
      comunicacao(12, "1000012-12.2025.8.26.0222", ["MARIA APARECIDA SOUZA"]),
    ];
    chamadas = 0;
    const r = await importarProcessosDaOab(escritorio, oabId, new Date("2026-10-12T12:00:00Z"));
    // 12 meses de 30 em 30 dias: 13 janelas, uma pagina cada.
    expect(chamadas).toBeGreaterThanOrEqual(12);
    expect(r.criados).toBe(2);
    expect(r.comCliente).toBe(1);
    const oab = await comEscritorio(escritorio, (db) => db.oabMonitorada.findFirstOrThrow({ where: { id: oabId } }));
    expect(oab.processosImportadosEm).not.toBeNull();
    // Nao enche a lista de publicacoes com o historico.
    expect(await comEscritorio(escritorio, (db) => db.publicacao.count({ where: { idExterno: { in: ["10", "11", "12"] } } }))).toBe(0);
  });

  it("guarda o ultimo andamento, e comunicacao mais antiga nao o sobrescreve", async () => {
    itens = [
      comunicacao(20, "1000020-20.2026.8.26.0222", ["ANA BEATRIZ COSTA"], {
        data_disponibilizacao: "2026-10-01",
        tipoComunicacao: "Sentenca",
        texto: "Julgo procedente o pedido.",
      }),
    ];
    await capturarPublicacoes(escritorio);
    itens = [
      comunicacao(21, "1000020-20.2026.8.26.0222", ["ANA BEATRIZ COSTA"], {
        data_disponibilizacao: "2026-08-01",
        tipoComunicacao: "Despacho",
        texto: "Cite-se.",
      }),
    ];
    await capturarPublicacoes(escritorio);
    const p = await comEscritorio(escritorio, (db) => db.processo.findFirstOrThrow({ where: { numero: "10000202020268260222" } }));
    expect(p.ultimoAndamentoTipo).toBe("Sentenca");
    expect(p.ultimoAndamentoTexto).toBe("Julgo procedente o pedido.");
    expect(p.ultimoAndamentoEm?.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(p.partes).toEqual([{ nome: "ANA BEATRIZ COSTA", polo: "A" }]);
  });

  it("na busca do ano, o processo em segredo aparece em Publicacoes, uma vez", async () => {
    await comEscritorio(escritorio, (db) => db.oabMonitorada.update({ where: { id: oabId }, data: { processosImportadosEm: null } }));
    itens = [
      comunicacao(30, "1000030-30.2025.8.26.0222", ["J. S. S."]),
      comunicacao(31, "1000030-30.2025.8.26.0222", ["J. S. S."]),
    ];
    const r = await importarProcessosDaOab(escritorio, oabId, new Date("2026-10-12T12:00:00Z"));
    expect(r.segredos).toBe(1);
    const pubs = await comEscritorio(escritorio, (db) => db.publicacao.findMany({ where: { numeroProcesso: "10000303020258260222" } }));
    expect(pubs).toHaveLength(1);
    expect(pubs[0].segredo).toBe(true);
    // Rodar de novo nao duplica.
    await importarProcessosDaOab(escritorio, oabId, new Date("2026-10-12T12:00:00Z"));
    expect(await comEscritorio(escritorio, (db) => db.publicacao.count({ where: { numeroProcesso: "10000303020258260222" } }))).toBe(1);
  });

  it("cliente cadastrado depois puxa os processos com o nome dele", async () => {
    const pedro = await comEscritorio(escritorio, (db) =>
      db.cliente.create({ data: semEscritorio({ nome: "Pedro Henrique Alves" }) }),
    );
    expect(await vincularProcessosAoCliente(escritorio, pedro.id)).toBe(1);
    const p = await comEscritorio(escritorio, (db) => db.processo.findFirstOrThrow({ where: { numero: "10000101020258260222" } }));
    expect(p.clienteId).toBe(pedro.id);
  });
});
