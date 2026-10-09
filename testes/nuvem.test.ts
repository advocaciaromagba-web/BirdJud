// Nuvem do escritorio: OneDrive e Google Drive.
//
// As duas nuvens sao servidores falsos, em memoria, que se comportam como as
// APIs de verdade naquilo que o sistema usa: token, pasta (com conflito de
// nome), item que some, envio simples e em pedacos. Os testes conferem a
// ARVORE que ficou la dentro, e nao so o que as funcoes devolveram.
import { createServer, type IncomingMessage, type Server } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import {
  assinarEstado,
  lerEstado,
  nomeSeguro,
  nonceConfere,
  VALIDADE_MS,
} from "../src/lib/nuvem";
import { aspasDoDrive, emailDoIdToken } from "../src/lib/nuvem/google";
import {
  baseDaPlataforma,
  baseDoEscritorio,
  enderecoDeRetorno,
} from "../src/lib/nuvem/enderecos";
import {
  arquivosParaEspelhar,
  conectarNuvem,
  desconectarNuvem,
  espelharArquivo,
  nomeDaPastaDoCliente,
  nomeNaNuvem,
  nuvemConectada,
  organizarPastas,
  OutraNuvemConectada,
  pastaDoCliente,
  resumoDaNuvem,
  testarNuvem,
} from "../src/lib/nuvem-do-escritorio";
import { obterIntegracao } from "../src/lib/integracao";
import { guardarArquivo } from "../src/lib/arquivos";

process.env.NEXTAUTH_SECRET ??= "segredo-de-teste-da-nuvem";

describe("bilhete do OAuth (state)", () => {
  const base = { e: "esc1", u: "usu1", s: "roma", p: "MICROSOFT" as const };

  it("volta igual quando ninguem mexeu", () => {
    const { estado, nonce } = assinarEstado(base);
    const lido = lerEstado(estado)!;
    expect(lido).toMatchObject({ ...base, n: nonce });
    expect(nonceConfere(nonce, lido.n)).toBe(true);
    expect(nonceConfere("outro", lido.n)).toBe(false);
    expect(nonceConfere(undefined, lido.n)).toBe(false);
  });

  it("recusa bilhete adulterado: trocar o escritorio invalida a assinatura", () => {
    const { estado } = assinarEstado(base);
    const [corpo, assinatura] = estado.split(".");
    const dados = JSON.parse(Buffer.from(corpo, "base64url").toString());
    const outro = Buffer.from(JSON.stringify({ ...dados, e: "escritorio-alheio" })).toString("base64url");
    expect(lerEstado(`${outro}.${assinatura}`)).toBeNull();
    expect(lerEstado(`${corpo}.x${assinatura.slice(1)}`)).toBeNull();
    expect(lerEstado("lixo")).toBeNull();
    expect(lerEstado(null)).toBeNull();
  });

  it("vence", () => {
    const agora = Date.now();
    const { estado } = assinarEstado(base, agora);
    expect(lerEstado(estado, agora + VALIDADE_MS - 1)).not.toBeNull();
    expect(lerEstado(estado, agora + VALIDADE_MS + 1)).toBeNull();
  });

  it("slug que nao e subdominio nao passa, nem assinado", () => {
    // O slug vira endereco de redirecionamento: "evil.com/x" seria open redirect.
    const { estado } = assinarEstado({ ...base, s: "evil.com/x" });
    expect(lerEstado(estado)).toBeNull();
  });
});

describe("nomes na nuvem", () => {
  it("pasta do cliente leva o documento, sem caractere proibido", () => {
    expect(nomeDaPastaDoCliente({ nome: "Maria Silva", documento: "123.456.789-00" })).toBe(
      "Maria Silva - 123.456.789-00",
    );
    expect(nomeDaPastaDoCliente({ nome: "Joao / Filho: \"ME\"", documento: null })).toBe("Joao - Filho- -ME-");
    expect(nomeSeguro("  ..  ")).toBe("sem nome");
    expect(nomeSeguro("arquivo. ")).toBe("arquivo");
  });

  it("arquivo leva a data de Brasilia na frente", () => {
    // 01h de 10/10 em UTC ainda e dia 09 em Brasilia.
    expect(nomeNaNuvem("procuracao.pdf", new Date("2026-10-10T01:00:00Z"))).toBe(
      "2026-10-09 - procuracao.pdf",
    );
  });

  it("busca do Drive escapa aspas, e o e-mail sai do id_token", () => {
    expect(aspasDoDrive("D'Avila \\ Cia")).toBe("D\\'Avila \\\\ Cia");
    const meio = Buffer.from(JSON.stringify({ email: "escritorio@gmail.com" })).toString("base64url");
    expect(emailDoIdToken(`x.${meio}.y`)).toBe("escritorio@gmail.com");
    expect(emailDoIdToken("sem-pontos")).toBeNull();
  });

  it("retorno e um so, na plataforma; a volta e para o subdominio", () => {
    const antes = process.env.NUVEM_URL_RETORNO;
    process.env.NUVEM_URL_RETORNO = "https://birdjud.com.br/";
    expect(baseDaPlataforma()).toBe("https://birdjud.com.br");
    expect(enderecoDeRetorno("MICROSOFT")).toBe("https://birdjud.com.br/api/nuvem/retorno/microsoft");
    expect(enderecoDeRetorno("GOOGLE")).toBe("https://birdjud.com.br/api/nuvem/retorno/google");
    expect(baseDoEscritorio("roma")).toBe("https://roma.birdjud.com.br");
    process.env.NUVEM_URL_RETORNO = "http://birdjud.test:3250";
    expect(baseDoEscritorio("roma")).toBe("http://roma.birdjud.test:3250");
    if (antes === undefined) delete process.env.NUVEM_URL_RETORNO;
    else process.env.NUVEM_URL_RETORNO = antes;
  });
});

// ---------------------------------------------------------------------------
// As nuvens falsas
// ---------------------------------------------------------------------------

type No = { id: string; nome: string; pasta: boolean; pai: string; bytes?: number; lixo?: boolean };

class Arvore {
  nos = new Map<string, No>();
  seq = 0;
  novo(nome: string, pai: string, pasta: boolean, bytes?: number): No {
    const no = { id: `i${++this.seq}`, nome, pai, pasta, bytes };
    this.nos.set(no.id, no);
    return no;
  }
  filhos(pai: string) {
    return [...this.nos.values()].filter((n) => n.pai === pai && !n.lixo);
  }
  caminho(id: string): string {
    const n = this.nos.get(id);
    if (!n) return "";
    return n.pai === "root" ? n.nome : `${this.caminho(n.pai)}/${n.nome}`;
  }
  /** Todos os caminhos vivos, para comparar a arvore inteira. */
  retrato(): string[] {
    return [...this.nos.values()]
      .filter((n) => !n.lixo && !this.morto(n))
      .map((n) => `${this.caminho(n.id)}${n.pasta ? "/" : ""}`)
      .sort();
  }
  morto(n: No): boolean {
    let p = n.pai;
    while (p !== "root") {
      const pai = this.nos.get(p);
      if (!pai || pai.lixo) return true;
      p = pai.pai;
    }
    return false;
  }
}

function corpo(req: IncomingMessage): Promise<Buffer> {
  return new Promise((ok) => {
    const partes: Buffer[] = [];
    req.on("data", (p) => partes.push(p));
    req.on("end", () => ok(Buffer.concat(partes)));
  });
}

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

let servidor: Server;
let base = "";
const ms = new Arvore();
const gg = new Arvore();
/** Token de renovacao que o provedor considera revogado. */
const revogados = new Set<string>();
const sessoesDeEnvio = new Map<string, { pasta: string; nome: string; recebidos: number; total: number }>();

async function responder(req: IncomingMessage, res: import("node:http").ServerResponse) {
  const url = new URL(req.url!, base);
  const json = (status: number, dados: unknown, extra: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...extra });
    res.end(JSON.stringify(dados));
  };
  const bruto = await corpo(req);

  // ---------------- Microsoft ----------------
  if (url.pathname === "/ms/login/token") {
    const p = new URLSearchParams(bruto.toString());
    if (p.get("grant_type") === "authorization_code") {
      if (p.get("code") !== "codigo-bom") return json(400, { error: "invalid_grant" });
      if (!p.get("redirect_uri")?.endsWith("/api/nuvem/retorno/microsoft")) return json(400, { error: "redirect_uri_mismatch" });
      return json(200, { access_token: "ms-acesso", refresh_token: "ms-renova-1" });
    }
    const rt = p.get("refresh_token")!;
    if (revogados.has(rt)) return json(400, { error: "invalid_grant" });
    // A Microsoft troca o token de renovacao de vez em quando: aqui, sempre.
    const n = Number(rt.split("-").pop()) + 1;
    return json(200, { access_token: "ms-acesso", refresh_token: `ms-renova-${n}` });
  }
  if (url.pathname.startsWith("/ms/graph")) {
    if (req.headers.authorization !== "Bearer ms-acesso") return json(401, {});
    const caminho = decodeURIComponent(url.pathname.slice("/ms/graph".length));
    if (caminho === "/me") return json(200, { mail: "escritorio@outlook.com" });

    const filhos = /^\/me\/drive\/(?:root|items\/([^/:]+))\/children$/.exec(caminho);
    if (filhos) {
      const pai = filhos[1] ?? "root";
      if (pai !== "root" && (!ms.nos.get(pai) || ms.nos.get(pai)!.lixo)) return json(404, {});
      if (req.method === "POST") {
        const d = JSON.parse(bruto.toString());
        if (ms.filhos(pai).some((n) => n.nome.toLowerCase() === d.name.toLowerCase())) return json(409, {});
        const no = ms.novo(d.name, pai, true);
        return json(201, { id: no.id, webUrl: `https://onedrive.test/${no.id}` });
      }
      return json(200, {
        value: ms.filhos(pai).map((n) => ({
          id: n.id,
          name: n.nome,
          folder: n.pasta ? {} : undefined,
          webUrl: `https://onedrive.test/${n.id}`,
        })),
      });
    }
    const envioSimples = /^\/me\/drive\/items\/([^/:]+):\/(.+):\/content$/.exec(caminho);
    if (envioSimples && req.method === "PUT") {
      const [, pasta, nome] = envioSimples;
      if (!ms.nos.get(pasta) || ms.nos.get(pasta)!.lixo) return json(404, {});
      const no = ms.novo(nome, pasta, false, bruto.byteLength);
      return json(201, { id: no.id });
    }
    const sessao = /^\/me\/drive\/items\/([^/:]+):\/(.+):\/createUploadSession$/.exec(caminho);
    if (sessao) {
      const [, pasta, nome] = sessao;
      if (!ms.nos.get(pasta)) return json(404, {});
      const chave = `s${sessoesDeEnvio.size + 1}`;
      sessoesDeEnvio.set(chave, { pasta, nome, recebidos: 0, total: 0 });
      return json(200, { uploadUrl: `${base}/ms/envio/${chave}` });
    }
    const item = /^\/me\/drive\/items\/([^/:]+)$/.exec(caminho);
    if (item) {
      const no = ms.nos.get(item[1]);
      if (!no || no.lixo || ms.morto(no)) return json(404, {});
      return json(200, { id: no.id, webUrl: `https://onedrive.test/${no.id}`, folder: no.pasta ? {} : undefined });
    }
    return json(404, { caminho });
  }
  if (url.pathname.startsWith("/ms/envio/")) {
    if (req.headers.authorization) return json(401, { erro: "uploadUrl nao leva Bearer" });
    const s = sessoesDeEnvio.get(url.pathname.split("/").pop()!)!;
    const faixa = /bytes (\d+)-(\d+)\/(\d+)/.exec(String(req.headers["content-range"]))!;
    s.recebidos += bruto.byteLength;
    s.total = Number(faixa[3]);
    if (s.recebidos < s.total) return json(202, {});
    const no = ms.novo(s.nome, s.pasta, false, s.recebidos);
    return json(201, { id: no.id });
  }

  // ---------------- Google ----------------
  if (url.pathname === "/gg/token") {
    const p = new URLSearchParams(bruto.toString());
    if (p.get("grant_type") === "authorization_code") {
      if (p.get("code") === "sem-drive") {
        return json(200, { access_token: "gg-acesso", refresh_token: "gg-renova", scope: "openid email" });
      }
      if (p.get("code") !== "codigo-bom") return json(400, { error: "invalid_grant" });
      const meio = Buffer.from(JSON.stringify({ email: "escritorio@gmail.com" })).toString("base64url");
      return json(200, {
        access_token: "gg-acesso",
        refresh_token: "gg-renova",
        id_token: `a.${meio}.b`,
        scope: "openid email https://www.googleapis.com/auth/drive.file",
      });
    }
    if (revogados.has(p.get("refresh_token")!)) return json(400, { error: "invalid_grant" });
    return json(200, { access_token: "gg-acesso" });
  }
  if (url.pathname.startsWith("/gg/")) {
    if (req.headers.authorization !== "Bearer gg-acesso") return json(401, {});
  }
  if (url.pathname === "/gg/drive/files" && req.method === "GET") {
    const q = url.searchParams.get("q")!;
    const pai = /'((?:[^'\\]|\\.)*)' in parents/.exec(q)![1];
    const nome = /name = '((?:[^'\\]|\\.)*)'/.exec(q)?.[1]?.replace(/\\(.)/g, "$1");
    const soPastas = q.includes("mimeType = 'application/vnd.google-apps.folder'");
    const achados = gg
      .filhos(pai)
      .filter((n) => (nome === undefined || n.nome === nome) && (!soPastas || n.pasta));
    return json(200, {
      files: achados.map((n) => ({
        id: n.id,
        name: n.nome,
        mimeType: n.pasta ? "application/vnd.google-apps.folder" : "application/pdf",
        webViewLink: `https://drive.test/${n.id}`,
      })),
    });
  }
  if (url.pathname === "/gg/drive/files" && req.method === "POST") {
    const d = JSON.parse(bruto.toString());
    const no = gg.novo(d.name, d.parents[0], true);
    return json(200, { id: no.id, webViewLink: `https://drive.test/${no.id}` });
  }
  const arquivoGg = /^\/gg\/drive\/files\/([^/]+)$/.exec(url.pathname);
  if (arquivoGg) {
    const no = gg.nos.get(arquivoGg[1]);
    if (!no) return json(404, {});
    return json(200, {
      id: no.id,
      webViewLink: `https://drive.test/${no.id}`,
      trashed: Boolean(no.lixo) || gg.morto(no),
      mimeType: no.pasta ? "application/vnd.google-apps.folder" : "application/pdf",
    });
  }
  if (url.pathname === "/gg/upload/files" && req.method === "POST") {
    const d = JSON.parse(bruto.toString());
    const chave = `g${sessoesDeEnvio.size + 1}`;
    sessoesDeEnvio.set(chave, { pasta: d.parents[0], nome: d.name, recebidos: 0, total: 0 });
    res.writeHead(200, { location: `${base}/gg/sessao/${chave}` });
    return res.end();
  }
  if (url.pathname.startsWith("/gg/sessao/")) {
    const s = sessoesDeEnvio.get(url.pathname.split("/").pop()!)!;
    if (!gg.nos.get(s.pasta)) return json(404, {});
    const no = gg.novo(s.nome, s.pasta, false, bruto.byteLength);
    return json(200, { id: no.id });
  }
  return json(404, { caminho: url.pathname });
}

let escritorio = "";
let usuarioId = "";
const retornoMs = "https://birdjud.com.br/api/nuvem/retorno/microsoft";
const retornoGg = "https://birdjud.com.br/api/nuvem/retorno/google";

async function cliente(nome: string, documento: string | null = null) {
  return comEscritorio(escritorio, (db) =>
    db.cliente.create({ data: semEscritorio({ nome, documento }) }),
  );
}

async function anexar(clienteId: string | null, nome: string, bytes: number) {
  return guardarArquivo(escritorio, {
    nome,
    tipo: "application/pdf",
    conteudo: Buffer.alloc(bytes, 7),
    usuarioId,
    clienteId,
  });
}

d("nuvem do escritorio", () => {
  beforeAll(async () => {
    process.env.SEGREDO_CHAVE ??= Buffer.alloc(32, 9).toString("base64");
    process.env.RAIZ_ARQUIVOS = await mkdtemp(join(tmpdir(), "birdjud-nuvem-"));
    servidor = createServer((req, res) => void responder(req, res));
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;

    process.env.MICROSOFT_CLIENT_ID = "app-ms";
    process.env.MICROSOFT_CLIENT_SECRET = "segredo-ms";
    process.env.MICROSOFT_LOGIN_URL = `${base}/ms/login`;
    process.env.MICROSOFT_GRAPH_URL = `${base}/ms/graph`;
    process.env.GOOGLE_CLIENT_ID = "app-gg";
    process.env.GOOGLE_CLIENT_SECRET = "segredo-gg";
    process.env.GOOGLE_TOKEN_URL = `${base}/gg/token`;
    process.env.GOOGLE_DRIVE_URL = `${base}/gg/drive`;
    process.env.GOOGLE_UPLOAD_URL = `${base}/gg/upload`;

    const e = await prismaPlataforma().escritorio.create({
      data: { slug: `nuvem-${Date.now()}`, nome: "Escritorio da Nuvem" },
    });
    escritorio = e.id;
    await prismaPlataforma().moduloContratado.create({
      data: { escritorioId: escritorio, modulo: "NUVEM", ativo: true },
    });
    const u = await comEscritorio(escritorio, (db) =>
      db.usuario.create({
        data: semEscritorio({
          nome: "Dra. Nuvem",
          email: `dra-${Date.now()}@nuvem.test`,
          senhaHash: "x",
          papel: "ADMIN",
        }),
      }),
    );
    usuarioId = u.id;
  });

  afterAll(async () => {
    await new Promise<void>((ok) => servidor.close(() => ok()));
    if (escritorio) {
      await prismaPlataforma().escritorio.delete({ where: { id: escritorio } }).catch(() => {});
    }
    for (const v of [
      "MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_LOGIN_URL", "MICROSOFT_GRAPH_URL",
      "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_TOKEN_URL", "GOOGLE_DRIVE_URL", "GOOGLE_UPLOAD_URL",
    ]) delete process.env[v];
    await prismaPlataforma().$disconnect();
  });

  beforeEach(() => revogados.clear());

  it("sem nuvem conectada, nada acontece e nada quebra", async () => {
    const c = await cliente("Antes da Nuvem");
    const a = await anexar(c.id, "antes.pdf", 10);
    expect(await nuvemConectada(escritorio)).toBeNull();
    expect(await organizarPastas(escritorio)).toEqual({ criadas: 0, restantes: 0, conectada: false });
    expect(await espelharArquivo(escritorio, a.id)).toBe("sem-nuvem");
    expect(await pastaDoCliente(escritorio, c.id)).toBeNull();
  });

  it("codigo invalido nao conecta nada", async () => {
    await expect(conectarNuvem(escritorio, "MICROSOFT", "codigo-ruim", retornoMs)).rejects.toThrow(/Conecte o OneDrive de novo/);
    expect(await nuvemConectada(escritorio)).toBeNull();
    expect(ms.retrato()).toEqual([]);
  });

  it("conectar o OneDrive monta BirdJud/Clientes sozinho e guarda a conta", async () => {
    const r = await conectarNuvem(escritorio, "MICROSOFT", "codigo-bom", retornoMs);
    expect(r.conta).toBe("escritorio@outlook.com");
    expect(ms.retrato()).toEqual(["BirdJud/", "BirdJud/Clientes/"]);

    const dados = await obterIntegracao<Record<string, string>>(escritorio, "MICROSOFT");
    // O token novo que a Microsoft mandou na renovacao foi o guardado.
    expect(dados.renovacao).toBe("ms-renova-2");
    expect(dados.conta).toBe("escritorio@outlook.com");
  });

  it("organizar cria uma pasta por cliente, e rodar de novo nao duplica", async () => {
    await cliente("Maria Silva", "123.456.789-00");
    await cliente("Maria Silva", "987.654.321-00");

    const primeira = await organizarPastas(escritorio);
    expect(primeira.criadas).toBe(3); // com o "Antes da Nuvem"
    const segunda = await organizarPastas(escritorio);
    expect(segunda.criadas).toBe(0);

    expect(ms.retrato()).toEqual([
      "BirdJud/",
      "BirdJud/Clientes/",
      "BirdJud/Clientes/Antes da Nuvem/",
      "BirdJud/Clientes/Maria Silva - 123.456.789-00/",
      "BirdJud/Clientes/Maria Silva - 987.654.321-00/",
    ]);
  });

  it("lote grande se divide e avisa quanto falta", async () => {
    for (let i = 0; i < 3; i++) await cliente(`Lote ${i}`);
    const r = await organizarPastas(escritorio, 2);
    expect(r).toMatchObject({ criadas: 2, restantes: 1 });
    expect((await organizarPastas(escritorio, 2)).criadas).toBe(1);
  });

  it("documento de cliente vai para a pasta dele, com a data na frente; pequeno e grande", async () => {
    const pendentes = await arquivosParaEspelhar(escritorio);
    expect(pendentes).toHaveLength(1); // o "antes.pdf", anexado antes de conectar

    const c = await comEscritorio(escritorio, (db) =>
      db.cliente.findFirstOrThrow({ where: { documento: "123.456.789-00" } }),
    );
    const pequeno = await anexar(c.id, "procuracao.pdf", 1000);
    const grande = await anexar(c.id, "laudo.pdf", 9 * 1024 * 1024); // passa dos 4 MB: em pedacos
    const solto = await anexar(null, "sem-cliente.pdf", 10);

    for (const id of await arquivosParaEspelhar(escritorio)) {
      expect(await espelharArquivo(escritorio, id)).toBe("copiado");
    }
    expect(await espelharArquivo(escritorio, pequeno.id)).toBe("ja-copiado");
    expect(await espelharArquivo(escritorio, solto.id)).toBe("sem-cliente");

    const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const arvore = ms.retrato();
    expect(arvore).toContain(`BirdJud/Clientes/Maria Silva - 123.456.789-00/${hoje} - procuracao.pdf`);
    expect(arvore).toContain(`BirdJud/Clientes/Maria Silva - 123.456.789-00/${hoje} - laudo.pdf`);
    expect(arvore).toContain(`BirdJud/Clientes/Antes da Nuvem/${hoje} - antes.pdf`);
    expect(arvore.some((c) => c.includes("sem-cliente"))).toBe(false);

    const laudo = [...ms.nos.values()].find((n) => n.nome.endsWith("laudo.pdf"))!;
    expect(laudo.bytes).toBe(grande.tamanhoBytes);
    expect(await arquivosParaEspelhar(escritorio)).toEqual([]);
  });

  it("pasta apagada na nuvem e recriada no proximo uso", async () => {
    const c = await cliente("Cliente Apagado");
    await organizarPastas(escritorio);
    const pasta = [...ms.nos.values()].find((n) => n.nome === "Cliente Apagado")!;
    pasta.lixo = true;

    const a = await anexar(c.id, "depois.pdf", 50);
    expect(await espelharArquivo(escritorio, a.id)).toBe("copiado");
    const vivas = ms.filhos(pasta.pai).filter((n) => n.nome === "Cliente Apagado");
    expect(vivas).toHaveLength(1);
    expect(vivas[0].id).not.toBe(pasta.id);

    const aberta = await pastaDoCliente(escritorio, c.id);
    expect(aberta).toEqual({ provedor: "MICROSOFT", endereco: `https://onedrive.test/${vivas[0].id}` });
  });

  it("a pasta Clientes apagada inteira volta, com as dos clientes", async () => {
    const clientes = [...ms.nos.values()].find((n) => n.nome === "Clientes")!;
    clientes.lixo = true;
    const r = await organizarPastas(escritorio);
    expect(r.criadas).toBeGreaterThan(5);
    const nova = ms.filhos([...ms.nos.values()].find((n) => n.nome === "BirdJud")!.id);
    expect(nova.filter((n) => n.nome === "Clientes")).toHaveLength(1);
  });

  it("nao deixa ligar o Google Drive com o OneDrive ligado", async () => {
    await expect(conectarNuvem(escritorio, "GOOGLE", "codigo-bom", retornoGg)).rejects.toBeInstanceOf(OutraNuvemConectada);
  });

  it("acesso revogado na Microsoft vira ERRO na tela, sem lancar na rotina", async () => {
    const dados = await obterIntegracao<Record<string, string>>(escritorio, "MICROSOFT");
    revogados.add(dados.renovacao);
    expect(await organizarPastas(escritorio)).toMatchObject({ conectada: false });
    const linha = await comEscritorio(escritorio, (db) => db.integracao.findFirstOrThrow({ where: { tipo: "MICROSOFT" } }));
    expect(linha.status).toBe("ERRO");
    expect(linha.erro).toMatch(/Conecte o OneDrive de novo/);
    expect((await testarNuvem(escritorio)).ok).toBe(false);
  });

  it("desconectar apaga token e mapa; os arquivos ficam na conta do escritorio", async () => {
    const antes = ms.retrato().length;
    await desconectarNuvem(escritorio, "MICROSOFT");
    expect(await nuvemConectada(escritorio)).toBeNull();
    const { pastas, marcados } = await comEscritorio(escritorio, async (db) => ({
      pastas: await db.pastaNaNuvem.count(),
      marcados: await db.arquivo.count({ where: { nuvemProvedor: { not: null } } }),
    }));
    expect(pastas).toBe(0);
    expect(marcados).toBe(0);
    expect(ms.retrato().length).toBe(antes);
  });

  it("Google Drive: sem a caixa do Drive marcada, recusa com explicacao", async () => {
    await expect(conectarNuvem(escritorio, "GOOGLE", "sem-drive", retornoGg)).rejects.toThrow(/caixa do Drive/);
    expect(await nuvemConectada(escritorio)).toBeNull();
  });

  it("Google Drive: mesma estrutura, mesmos nomes, mesma copia", async () => {
    const r = await conectarNuvem(escritorio, "GOOGLE", "codigo-bom", retornoGg);
    expect(r.conta).toBe("escritorio@gmail.com");
    // Reconectar acha a pasta pelo nome e nao duplica.
    await desconectarNuvem(escritorio, "GOOGLE");
    await conectarNuvem(escritorio, "GOOGLE", "codigo-bom", retornoGg);

    const c = await cliente("Joana D'Arc", "111.222.333-44");
    while ((await organizarPastas(escritorio)).restantes > 0);
    for (const id of await arquivosParaEspelhar(escritorio)) await espelharArquivo(escritorio, id);
    const a = await anexar(c.id, "rg.pdf", 300);
    expect(await espelharArquivo(escritorio, a.id)).toBe("copiado");

    const arvore = gg.retrato();
    expect(arvore.filter((p) => p === "BirdJud/")).toHaveLength(1);
    expect(arvore.filter((p) => p === "BirdJud/Clientes/")).toHaveLength(1);
    const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    expect(arvore).toContain(`BirdJud/Clientes/Joana D'Arc - 111.222.333-44/${hoje} - rg.pdf`);

    const resumo = (await resumoDaNuvem(escritorio))!;
    expect(resumo).toMatchObject({ provedor: "GOOGLE", rotulo: "Google Drive", conta: "escritorio@gmail.com" });
    expect(resumo.pastas).toBeGreaterThan(5);
    expect(resumo.copiados).toBeGreaterThan(3);
    expect((await testarNuvem(escritorio)).ok).toBe(true);
  });
});
