// O trabalhador pedindo os arquivos a aplicacao (um disco so, dois servicos).
//
// O que se prova: com ARQUIVOS_DA_APLICACAO, gravar/ler/existe/apagar e a
// purga da pasta passam pelo endereco interno e chegam ao MESMO disco; sem o
// segredo certo, ou vindo por outro host que nao o interno, o endereco nao
// existe (404) — o dominio publico nunca entrega arquivo de escritorio.
import { createServer, type Server } from "node:http";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as rota from "../src/app/api/interno/arquivos/route";
import {
  apagar,
  apagarTudoDoEscritorio,
  conferirViaAplicacao,
  existe,
  gravar,
  ler,
} from "../src/lib/armazenamento";

let servidor: Server;
let base = "";
const raiz = mkdtempSync(join(tmpdir(), "arquivos-remoto-"));
const antes = { ...process.env };

beforeAll(async () => {
  servidor = createServer(async (req, res) => {
    const pedacos: Buffer[] = [];
    for await (const p of req) pedacos.push(p as Buffer);
    const corpo = Buffer.concat(pedacos);
    const pedido = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: ["GET", "HEAD"].includes(req.method ?? "") ? undefined : corpo,
    });
    const metodo = req.method as "GET" | "PUT" | "DELETE" | "HEAD";
    const resposta: Response = await rota[metodo](pedido);
    res.writeHead(resposta.status, Object.fromEntries(resposta.headers));
    res.end(Buffer.from(await resposta.arrayBuffer()));
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
});

beforeEach(() => {
  process.env.RAIZ_ARQUIVOS = raiz;
  process.env.ARQUIVOS_SEGREDO = "segredo-de-teste-com-tamanho";
  process.env.ARQUIVOS_DA_APLICACAO = base;
  delete process.env.RAILWAY_PRIVATE_DOMAIN;
});

afterAll(async () => {
  process.env = antes;
  await new Promise<void>((ok) => servidor.close(() => ok()));
});

describe("arquivos pela aplicação", () => {
  it("grava, le, confere e apaga no disco da aplicação", async () => {
    const r = await gravar("escA", "arq1", Buffer.from("conteudo do pdf"));
    expect(r.tamanhoBytes).toBe(15);
    expect(existsSync(join(raiz, "escA", "arq1"))).toBe(true);
    expect((await ler("escA", "arq1")).toString()).toBe("conteudo do pdf");
    expect(await existe("escA", "arq1")).toBe(true);
    await apagar("escA", "arq1");
    expect(await existe("escA", "arq1")).toBe(false);
    await expect(ler("escA", "arq1")).rejects.toThrow(/ENOENT/);
  });

  it("a purga apaga a pasta inteira do escritório", async () => {
    await gravar("escB", "x1", Buffer.from("a"));
    await gravar("escB", "x2", Buffer.from("b"));
    await apagarTudoDoEscritorio("escB");
    expect(existsSync(join(raiz, "escB"))).toBe(false);
  });

  it("a partida do trabalhador confere o caminho", async () => {
    expect(await conferirViaAplicacao()).toMatch(/ok/);
  });

  it("segredo errado: o endereço não existe", async () => {
    await gravar("escC", "y1", Buffer.from("sigiloso"));
    const r = await fetch(`${base}/api/interno/arquivos?e=escC&a=y1`, {
      headers: { "x-segredo-arquivos": "outro-segredo-qualquer-mesmo" },
    });
    expect(r.status).toBe(404);
    expect(await r.text()).toBe("");
  });

  it("vindo por host que não e o interno (o domínio público): 404", async () => {
    await gravar("escD", "z1", Buffer.from("sigiloso"));
    process.env.RAILWAY_PRIVATE_DOMAIN = "aplicacao.railway.internal";
    await expect(ler("escD", "z1")).rejects.toThrow(/404/);
  });

  it("sem segredo configurado na aplicação, nada passa", async () => {
    const pedido = new Request(`${base}/api/interno/arquivos?e=escA&a=arq1`, { headers: { "x-segredo-arquivos": "" } });
    delete process.env.ARQUIVOS_SEGREDO;
    expect((await rota.GET(pedido)).status).toBe(404);
  });

  it("caminho com ../ não passa nem pelo cliente", async () => {
    await expect(ler("../etc", "passwd")).rejects.toThrow(/inválido/);
  });
});
