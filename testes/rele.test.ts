// Rele do DJEN: e ele que fica em solo brasileiro, entao e ele que precisa
// aguentar ser chamado de fora. O que se prova aqui e o contrario do caminho
// feliz: sem token nao passa, com token errado nao passa, parametro estranho
// nao chega ao CNJ, e o rele nunca vira proxy aberto.
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import handler, { conferirConsulta, tokenConfere } from "../rele/api/djen";
import { buscarPagina, destinoDaConsulta, FalhaNoDjen, releDjen } from "../src/lib/djen";

const TOKEN = "token-de-teste-do-rele";

type Chamada = { url: string; cabecalhos: Record<string, string | string[] | undefined> };

/** Sobe um servidor e devolve o endereco. */
async function subir(servidor: Server): Promise<string> {
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const endereco = servidor.address();
  if (typeof endereco === "string" || endereco === null) throw new Error("sem porta");
  return `http://127.0.0.1:${endereco.port}`;
}

function fechar(servidor: Server | null): Promise<void> {
  if (!servidor) return Promise.resolve();
  return new Promise((pronto) => servidor.close(() => pronto()));
}

describe("conferencia da consulta do rele", () => {
  const completa = new URLSearchParams({
    numeroOab: "12345",
    ufOab: "BA",
    dataDisponibilizacaoInicio: "2026-09-01",
    dataDisponibilizacaoFim: "2026-09-10",
  });

  it("aceita a consulta documentada", () => {
    const saida = conferirConsulta(new URLSearchParams(completa));
    expect("erro" in saida).toBe(false);
  });

  it("recusa parametro que nao esta na lista", () => {
    const entrada = new URLSearchParams(completa);
    entrada.set("callback", "http://mim.example");
    const saida = conferirConsulta(entrada);
    expect(saida).toMatchObject({ status: 400 });
  });

  it("recusa parametro com formato errado", () => {
    const entrada = new URLSearchParams(completa);
    entrada.set("numeroOab", "12345 OR 1=1");
    expect(conferirConsulta(entrada)).toMatchObject({ status: 400 });

    const outra = new URLSearchParams(completa);
    outra.set("dataDisponibilizacaoFim", "10/09/2026");
    expect(conferirConsulta(outra)).toMatchObject({ status: 400 });
  });

  it("recusa consulta sem os obrigatorios", () => {
    const entrada = new URLSearchParams(completa);
    entrada.delete("ufOab");
    expect(conferirConsulta(entrada)).toMatchObject({ status: 400 });
  });

  it("compara token sem aceitar vazio nem prefixo", () => {
    expect(tokenConfere(TOKEN, TOKEN)).toBe(true);
    expect(tokenConfere(undefined, TOKEN)).toBe(false);
    expect(tokenConfere("", TOKEN)).toBe(false);
    expect(tokenConfere(TOKEN.slice(0, -1), TOKEN)).toBe(false);
    expect(tokenConfere(`${TOKEN}x`, TOKEN)).toBe(false);
  });
});

describe("rele rodando", () => {
  let cnj: Server | null = null;
  let rele: Server | null = null;
  let chamadas: Chamada[] = [];
  const PAGINA_DO_CNJ = JSON.stringify({
    count: 1,
    items: [
      {
        id: "c-1",
        texto: "Fica intimado para, no prazo de 15 dias, manifestar-se.",
        data_disponibilizacao: "2026-09-10",
        numero_processo: "0001234-56.2026.8.26.0100",
        siglaTribunal: "TJSP",
      },
    ],
  });
  let respostaDoCnj = { status: 200, corpo: PAGINA_DO_CNJ };
  let enderecoDoRele = "";

  beforeEach(async () => {
    chamadas = [];
    respostaDoCnj = { status: 200, corpo: PAGINA_DO_CNJ };
    cnj = createServer((pedido, resposta) => {
      chamadas.push({ url: pedido.url ?? "", cabecalhos: pedido.headers });
      resposta.statusCode = respostaDoCnj.status;
      resposta.setHeader("content-type", "application/json");
      resposta.end(respostaDoCnj.corpo);
    });
    const baseCnj = await subir(cnj);
    process.env.DJEN_BASE_URL = `${baseCnj}/api/v1`;
    process.env.RELE_TOKEN = TOKEN;

    rele = createServer((pedido, resposta) => {
      void handler(pedido, resposta);
    });
    enderecoDoRele = `${await subir(rele)}/api/djen`;
  });

  afterEach(async () => {
    await fechar(cnj);
    await fechar(rele);
    delete process.env.DJEN_BASE_URL;
    delete process.env.RELE_TOKEN;
    delete process.env.DJEN_RELE_URL;
    delete process.env.DJEN_RELE_TOKEN;
  });

  const consulta = "numeroOab=12345&ufOab=BA&dataDisponibilizacaoInicio=2026-09-01&dataDisponibilizacaoFim=2026-09-10";

  it("sem Authorization responde 401 e nao chama o CNJ", async () => {
    const resposta = await fetch(`${enderecoDoRele}?${consulta}`);
    expect(resposta.status).toBe(401);
    expect(chamadas).toHaveLength(0);
  });

  it("com token errado responde 401 e nao chama o CNJ", async () => {
    const resposta = await fetch(`${enderecoDoRele}?${consulta}`, {
      headers: { Authorization: "Bearer outro-token" },
    });
    expect(resposta.status).toBe(401);
    expect(chamadas).toHaveLength(0);
  });

  it("sem RELE_TOKEN no ambiente falha fechado", async () => {
    delete process.env.RELE_TOKEN;
    const resposta = await fetch(`${enderecoDoRele}?${consulta}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(resposta.status).toBe(503);
    expect(chamadas).toHaveLength(0);
  });

  it("so responde a GET", async () => {
    const resposta = await fetch(`${enderecoDoRele}?${consulta}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(resposta.status).toBe(405);
    expect(chamadas).toHaveLength(0);
  });

  it("nao repassa parametro estranho, mesmo com token bom", async () => {
    const resposta = await fetch(`${enderecoDoRele}?${consulta}&url=http://interno`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(resposta.status).toBe(400);
    expect(chamadas).toHaveLength(0);
  });

  it("repassa a consulta ao CNJ e devolve o corpo", async () => {
    const resposta = await fetch(`${enderecoDoRele}?${consulta}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as { count: number };
    expect(corpo.count).toBe(1);

    expect(chamadas).toHaveLength(1);
    const pedida = new URL(chamadas[0].url, "http://cnj");
    expect(pedida.pathname).toBe("/api/v1/comunicacao");
    expect(pedida.searchParams.get("numeroOab")).toBe("12345");
    expect(pedida.searchParams.get("ufOab")).toBe("BA");
    // O token da plataforma para no rele: o CNJ nunca o ve.
    expect(chamadas[0].cabecalhos.authorization).toBeUndefined();
  });

  it("repassa o status de recusa do CNJ", async () => {
    respostaDoCnj = { status: 403, corpo: JSON.stringify({ erro: "bloqueado" }) };
    const resposta = await fetch(`${enderecoDoRele}?${consulta}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(resposta.status).toBe(403);
  });

  it("o cliente do DJEN busca pelo rele quando ele esta configurado", async () => {
    process.env.DJEN_RELE_URL = `${enderecoDoRele}/`;
    process.env.DJEN_RELE_TOKEN = TOKEN;

    const destino = destinoDaConsulta(new URLSearchParams({ numeroOab: "12345" }));
    expect(releDjen()).toBe(enderecoDoRele);
    expect(destino.url.startsWith(`${enderecoDoRele}?`)).toBe(true);
    expect(destino.cabecalhos.Authorization).toBe(`Bearer ${TOKEN}`);

    const pagina = await buscarPagina({
      numeroOab: "12345",
      ufOab: "BA",
      de: new Date("2026-09-01T00:00:00Z"),
      ate: new Date("2026-09-10T00:00:00Z"),
    });
    expect(pagina.comunicacoes).toHaveLength(1);
    expect(pagina.comunicacoes[0].tribunal).toBe("TJSP");
    expect(chamadas).toHaveLength(1);
  });

  it("token errado no cliente vira mensagem que diz onde arrumar", async () => {
    process.env.DJEN_RELE_URL = enderecoDoRele;
    process.env.DJEN_RELE_TOKEN = "token-que-nao-e-o-do-rele";

    await expect(
      buscarPagina({
        numeroOab: "12345",
        ufOab: "BA",
        de: new Date("2026-09-01T00:00:00Z"),
        ate: new Date("2026-09-10T00:00:00Z"),
      })
    ).rejects.toThrow(FalhaNoDjen);
    expect(chamadas).toHaveLength(0);
  });

  it("sem rele configurado, vai direto ao CNJ", () => {
    const destino = destinoDaConsulta(new URLSearchParams({ numeroOab: "12345" }));
    expect(releDjen()).toBeNull();
    expect(destino.url).toContain("/comunicacao?");
    expect(destino.cabecalhos.Authorization).toBeUndefined();
  });
});
