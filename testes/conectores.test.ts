// Fase 3: cada conector conversa com um servico de verdade.
//
// Nao ha credencial de provedor real aqui: os testes sobem um SMTP e um HTTP
// locais, e geram um certificado de verdade com o openssl. O que se prova e a
// logica do conector — cabecalho certo, leitura da resposta, erro traduzido,
// tempo limite — contra servidores que se comportam como os de producao.
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SMTPServer } from "smtp-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conectorEmail } from "../src/lib/conectores/email";
import { conectorAsaas } from "../src/lib/conectores/asaas";
import { conectorAutentique } from "../src/lib/conectores/autentique";
import { conectorWhatsapp } from "../src/lib/conectores/whatsapp";
import {
  avaliarValidade,
  conectorCertificado,
  lerCertificado,
} from "../src/lib/conectores/certificado";
import { conectorMicrosoft } from "../src/lib/conectores/pendentes";
import {
  CONECTORES,
  ehTipoDeIntegracao,
  mascarar,
} from "../src/lib/conectores";
import { montarCSP } from "../src/lib/csp";

// ---------------------------------------------------------------------------
// SMTP de verdade, so que local
// ---------------------------------------------------------------------------

let smtp: SMTPServer;
let portaSmtp = 0;

beforeAll(async () => {
  smtp = new SMTPServer({
    authOptional: false,
    disabledCommands: ["STARTTLS"],
    onAuth(credenciais, _sessao, pronto) {
      if (
        credenciais.username === "advogado" &&
        credenciais.password === "segredo"
      ) {
        pronto(null, { user: credenciais.username });
        return;
      }
      pronto(new Error("Usuario ou senha invalidos"));
    },
  });
  await new Promise<void>((ok) => smtp.listen(0, "127.0.0.1", ok));
  portaSmtp = (smtp.server.address() as { port: number }).port;
});

afterAll(async () => {
  await new Promise<void>((ok) => smtp.close(() => ok()));
});

describe("conector de e-mail", () => {
  it("autentica no servidor com as credenciais certas", async () => {
    const resultado = await conectorEmail.testar({
      host: "127.0.0.1",
      porta: String(portaSmtp),
      usuario: "advogado",
      senha: "segredo",
      remetente: "contato@alfa.adv.br",
    });
    expect(resultado.ok).toBe(true);
  });

  it("recusa senha errada", async () => {
    const resultado = await conectorEmail.testar({
      host: "127.0.0.1",
      porta: String(portaSmtp),
      usuario: "advogado",
      senha: "errada",
      remetente: "contato@alfa.adv.br",
    });
    expect(resultado.ok).toBe(false);
  });

  it("recusa porta invalida antes de tentar conectar", async () => {
    const resultado = await conectorEmail.testar({
      host: "127.0.0.1",
      porta: "porta",
      usuario: "advogado",
      senha: "segredo",
      remetente: "contato@alfa.adv.br",
    });
    expect(resultado).toEqual({ ok: false, detalhe: "Porta invalida." });
  });

  it("o resumo mostra remetente e servidor, nunca a senha", () => {
    const resumo = conectorEmail.resumo({
      host: "smtp.alfa.adv.br",
      porta: "587",
      usuario: "advogado",
      senha: "segredo",
      remetente: "contato@alfa.adv.br",
    });
    expect(resumo).toContain("contato@alfa.adv.br");
    expect(resumo).not.toContain("segredo");
  });
});

// ---------------------------------------------------------------------------
// HTTP local no lugar de Asaas / Autentique / Meta
// ---------------------------------------------------------------------------

type Rota = (
  url: URL,
  cabecalhos: Record<string, unknown>,
  corpo: string,
) =>
  | { status: number; json: unknown }
  | Promise<{ status: number; json: unknown }>;

let servidor: Server;
let base = "";
let rota: Rota = () => ({ status: 404, json: {} });

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let corpo = "";
    req.on("data", (p) => (corpo += p));
    req.on("end", async () => {
      const url = new URL(req.url ?? "/", "http://local");
      const resposta = await rota(url, req.headers, corpo);
      res.writeHead(resposta.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(resposta.json));
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  const porta = (servidor.address() as { port: number }).port;
  base = `http://127.0.0.1:${porta}`;
  process.env.ASAAS_BASE_URL = base;
  process.env.AUTENTIQUE_BASE_URL = `${base}/graphql`;
  process.env.META_BASE_URL = base;
});

afterAll(async () => {
  await new Promise<void>((ok) => servidor.close(() => ok()));
});

describe("conector Asaas", () => {
  it("manda a chave no cabecalho access_token e le a conta", async () => {
    let chaveRecebida: unknown = null;
    rota = (url, cabecalhos) => {
      expect(url.pathname).toBe("/myAccount");
      chaveRecebida = cabecalhos["access_token"];
      return {
        status: 200,
        json: { name: "Escritorio Alfa", email: "fin@alfa.adv.br" },
      };
    };

    const resultado = await conectorAsaas.testar({ chave: "chave-de-teste" });
    expect(chaveRecebida).toBe("chave-de-teste");
    expect(resultado).toEqual({ ok: true, detalhe: "Conta Escritorio Alfa." });
  });

  it("traduz 401 em recusa da chave", async () => {
    rota = () => ({
      status: 401,
      json: { errors: [{ description: "invalid" }] },
    });
    const resultado = await conectorAsaas.testar({ chave: "errada" });
    expect(resultado).toEqual({
      ok: false,
      detalhe: "Chave recusada pelo Asaas.",
    });
  });

  it("reporta outros codigos sem inventar sucesso", async () => {
    rota = () => ({ status: 503, json: {} });
    const resultado = await conectorAsaas.testar({ chave: "x" });
    expect(resultado.ok).toBe(false);
    expect(resultado.detalhe).toContain("503");
  });
});

describe("conector Autentique", () => {
  it("consulta a conta por GraphQL com Bearer", async () => {
    let autorizacao: unknown = null;
    rota = (url, cabecalhos, corpo) => {
      expect(url.pathname).toBe("/graphql");
      autorizacao = cabecalhos["authorization"];
      expect(corpo).toContain("me");
      return {
        status: 200,
        json: { data: { me: { id: "1", email: "adv@alfa.adv.br" } } },
      };
    };

    const resultado = await conectorAutentique.testar({ token: "tok-123" });
    expect(autorizacao).toBe("Bearer tok-123");
    expect(resultado).toEqual({ ok: true, detalhe: "Conta adv@alfa.adv.br." });
  });

  it("GraphQL com erro responde 200: o corpo e que decide", async () => {
    rota = () => ({
      status: 200,
      json: { errors: [{ message: "Unauthenticated." }] },
    });
    const resultado = await conectorAutentique.testar({ token: "ruim" });
    expect(resultado).toEqual({ ok: false, detalhe: "Unauthenticated." });
  });
});

describe("conector WhatsApp", () => {
  it("consulta o numero e mostra nome e qualidade", async () => {
    rota = (url, cabecalhos) => {
      expect(url.pathname).toBe("/1234567890");
      expect(cabecalhos["authorization"]).toBe("Bearer tok-meta");
      return {
        status: 200,
        json: { verified_name: "Alfa Advogados", quality_rating: "GREEN" },
      };
    };

    const resultado = await conectorWhatsapp.testar({
      numeroId: "1234567890",
      token: "tok-meta",
    });
    expect(resultado).toEqual({
      ok: true,
      detalhe: "Alfa Advogados · qualidade GREEN.",
    });
  });

  it("repassa a mensagem de erro da Meta", async () => {
    rota = () => ({
      status: 400,
      json: { error: { message: "Unsupported get request." } },
    });
    const resultado = await conectorWhatsapp.testar({
      numeroId: "9",
      token: "ruim",
    });
    expect(resultado).toEqual({
      ok: false,
      detalhe: "Unsupported get request.",
    });
  });
});

// ---------------------------------------------------------------------------
// Certificado de verdade, gerado na hora
// ---------------------------------------------------------------------------

function gerarPfx(dias: number, senha: string, nome: string): string {
  const pasta = mkdtempSync(join(tmpdir(), "cert-"));
  const chave = join(pasta, "chave.pem");
  const cert = join(pasta, "cert.pem");
  const pfx = join(pasta, "cert.pfx");

  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      chave,
      "-out",
      cert,
      "-days",
      String(Math.abs(dias)),
      "-subj",
      `/CN=${nome}`,
    ],
    { stdio: "ignore" },
  );

  execFileSync(
    "openssl",
    [
      "pkcs12",
      "-export",
      "-out",
      pfx,
      "-inkey",
      chave,
      "-in",
      cert,
      "-passout",
      `pass:${senha}`,
    ],
    { stdio: "ignore" },
  );

  return readFileSync(pfx).toString("base64");
}

describe("conector de certificado", () => {
  it("abre o certificado, le o titular e aceita o que esta valido", async () => {
    const pfx = gerarPfx(365, "senha-do-cert", "ESCRITORIO ALFA LTDA");
    const resultado = await conectorCertificado.testar({
      arquivo: pfx,
      senha: "senha-do-cert",
    });
    expect(resultado.ok).toBe(true);
    expect(resultado.detalhe).toContain("ESCRITORIO ALFA LTDA");
  });

  it("recusa senha errada com mensagem propria", async () => {
    const pfx = gerarPfx(365, "senha-do-cert", "ALFA");
    const resultado = await conectorCertificado.testar({
      arquivo: pfx,
      senha: "errada",
    });
    expect(resultado).toEqual({
      ok: false,
      detalhe: "Senha do certificado incorreta.",
    });
  });

  it("recusa arquivo que nao e certificado", async () => {
    const resultado = await conectorCertificado.testar({
      arquivo: Buffer.from("isto nao e um pfx").toString("base64"),
      senha: "x",
    });
    expect(resultado.ok).toBe(false);
  });

  it("le as datas de validade do arquivo", () => {
    const pfx = gerarPfx(365, "s", "ALFA");
    const leitura = lerCertificado(pfx, "s");
    expect(leitura.ate.getTime()).toBeGreaterThan(Date.now());
    expect(leitura.de.getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
  });

  it("recusa certificado vencido", () => {
    const leitura = {
      titular: "ALFA",
      de: new Date("2024-01-01"),
      ate: new Date("2025-01-01"),
    };
    const resultado = avaliarValidade(leitura, new Date("2026-09-17"));
    expect(resultado.ok).toBe(false);
    expect(resultado.detalhe).toContain("vencido em");
  });

  it("recusa certificado que ainda nao comecou a valer", () => {
    const leitura = {
      titular: "ALFA",
      de: new Date("2027-01-01"),
      ate: new Date("2028-01-01"),
    };
    const resultado = avaliarValidade(leitura, new Date("2026-09-17"));
    expect(resultado).toEqual({
      ok: false,
      detalhe: "Certificado ainda nao esta valido.",
    });
  });

  it("avisa perto do vencimento e nao avisa longe dele", () => {
    const base = new Date("2026-09-17T12:00:00Z");
    const perto = avaliarValidade(
      {
        titular: "ALFA",
        de: new Date("2026-01-01"),
        ate: new Date("2026-10-01T12:00:00Z"),
      },
      base,
    );
    expect(perto.ok).toBe(true);
    expect(perto.detalhe).toContain("Atencao: vence em 14 dia(s)");

    const longe = avaliarValidade(
      {
        titular: "ALFA",
        de: new Date("2026-01-01"),
        ate: new Date("2027-09-01T12:00:00Z"),
      },
      base,
    );
    expect(longe.ok).toBe(true);
    expect(longe.detalhe).not.toContain("Atencao");
  });

  it("avisa quando esta perto de vencer", async () => {
    const pfx = gerarPfx(10, "s", "ALFA");
    const resultado = await conectorCertificado.testar({
      arquivo: pfx,
      senha: "s",
    });
    expect(resultado.ok).toBe(true);
    expect(resultado.detalhe).toContain("vence em");
  });
});

// ---------------------------------------------------------------------------
// Conectores ainda sem verificacao automatica
// ---------------------------------------------------------------------------

describe("conectores pendentes", () => {
  it("nuvem por OAuth nao pede credencial em formulario", async () => {
    expect(conectorMicrosoft.campos).toHaveLength(0);
    const resultado = await conectorMicrosoft.testar({});
    expect(resultado.ok).toBe(false);
    expect(resultado.detalhe).toContain("OAuth");
  });
});

describe("registro de conectores", () => {
  it("todo conector tem tipo coerente com a chave do registro", () => {
    for (const [chave, conector] of Object.entries(CONECTORES)) {
      expect(conector.tipo).toBe(chave);
      expect(conector.rotulo.length).toBeGreaterThan(0);
    }
  });

  it("reconhece so os tipos registrados", () => {
    expect(ehTipoDeIntegracao("ASAAS")).toBe(true);
    expect(ehTipoDeIntegracao("QUALQUER_COISA")).toBe(false);
  });

  it("mascarar mostra so o fim do segredo", () => {
    expect(mascarar("chave-super-secreta-a1b2")).toBe("•••a1b2");
    expect(mascarar("abc")).toBe("•••");
    expect(mascarar(undefined)).toBe("—");
  });
});

describe("politica de seguranca de conteudo", () => {
  it("em producao, script-src usa nonce e nao aceita inline", () => {
    const csp = montarCSP("abc123", true);
    expect(csp).toContain("'nonce-abc123'");
    expect(csp).toContain("'strict-dynamic'");
    // O que interessa: nada de inline nem eval em script.
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src"));
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
  });

  it("em desenvolvimento libera eval, que o Next usa no refresh", () => {
    const scriptSrc = montarCSP("abc123", false)
      .split("; ")
      .find((d) => d.startsWith("script-src"));
    expect(scriptSrc).toContain("unsafe-eval");
  });

  it("so forca HTTPS quando a requisicao ja veio por HTTPS", () => {
    // Emitido em ambiente HTTP, upgrade-insecure-requests faz o navegador
    // buscar os proprios scripts da pagina em HTTPS — e nada carrega.
    expect(montarCSP("n", true, true)).toContain("upgrade-insecure-requests");
    expect(montarCSP("n", true, false)).not.toContain(
      "upgrade-insecure-requests",
    );
  });

  it("fecha frame, objeto e base", () => {
    const csp = montarCSP("n", true);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });
});
