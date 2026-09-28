// Rele de e-mail: o que se prova aqui e que ele nao vira remetente de graca.
// Sem token nao passa, token errado nao passa, e o que chega ao Gmail passou
// por conferencia — inclusive contra injecao de cabecalho pelo assunto, que e
// o jeito classico de transformar um formulario de contato em spam alheio.
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import handler, {
  conferirMensagem,
  enderecoValido,
  tokenConfere,
} from "../rele/api/email";

const TOKEN = "token-de-teste-do-email";

let servidor: Server | null = null;

async function subir(): Promise<string> {
  servidor = createServer((pedido, resposta) => {
    void handler(pedido, resposta);
  });
  await new Promise<void>((pronto) => servidor!.listen(0, "127.0.0.1", pronto));
  const endereco = servidor.address();
  if (typeof endereco === "string" || endereco === null) throw new Error("sem porta");
  return `http://127.0.0.1:${endereco.port}`;
}

afterEach(async () => {
  if (servidor) await new Promise<void>((p) => servidor!.close(() => p()));
  servidor = null;
  delete process.env.EMAIL_TOKEN;
  delete process.env.GMAIL_USUARIO;
  delete process.env.GMAIL_SENHA;
});

describe("token do rele de e-mail", () => {
  it("confere o certo e recusa o errado, o vazio e o ausente", () => {
    expect(tokenConfere(TOKEN, TOKEN)).toBe(true);
    expect(tokenConfere("outro", TOKEN)).toBe(false);
    expect(tokenConfere("", TOKEN)).toBe(false);
    expect(tokenConfere(undefined, TOKEN)).toBe(false);
  });

  // Tamanhos diferentes nao podem estourar o timingSafeEqual: e por isso que
  // os dois lados passam por sha256 antes da comparacao.
  it("aguenta tamanhos diferentes sem estourar", () => {
    expect(tokenConfere("a", "token-muito-mais-longo")).toBe(false);
  });
});

describe("endereco do destinatario", () => {
  it("aceita um endereco comum", () => {
    expect(enderecoValido("alguem@exemplo.com.br")).toBe(true);
  });

  it("recusa lista, cabecalho embutido e coisa que nao e endereco", () => {
    expect(enderecoValido("a@b.com, c@d.com")).toBe(false);
    expect(enderecoValido("a@b.com;c@d.com")).toBe(false);
    expect(enderecoValido("Nome <a@b.com>")).toBe(false);
    expect(enderecoValido("a@b.com\nBcc: x@y.com")).toBe(false);
    expect(enderecoValido("semarroba")).toBe(false);
    expect(enderecoValido(123)).toBe(false);
  });
});

describe("conferencia da mensagem", () => {
  const boa = { para: "a@b.com.br", assunto: "Redefinir senha", texto: "link" };

  it("aprova a mensagem completa", () => {
    expect(conferirMensagem(boa)).toEqual(boa);
  });

  it("recusa corpo que nao e objeto", () => {
    for (const ruim of [null, "texto", 7, undefined]) {
      const r = conferirMensagem(ruim);
      expect("erro" in r).toBe(true);
    }
  });

  // Quebra de linha no assunto e injecao de cabecalho: com ela se acrescenta
  // um Bcc e o rele passa a mandar e-mail para quem o atacante quiser.
  it("recusa quebra de linha no assunto", () => {
    const r = conferirMensagem({ ...boa, assunto: "Oi\nBcc: x@y.com" });
    expect("erro" in r && r.status).toBe(400);
  });

  it("recusa assunto e texto vazios ou longos demais", () => {
    expect("erro" in conferirMensagem({ ...boa, assunto: "   " })).toBe(true);
    expect("erro" in conferirMensagem({ ...boa, texto: "" })).toBe(true);
    expect("erro" in conferirMensagem({ ...boa, assunto: "a".repeat(301) })).toBe(true);
    expect("erro" in conferirMensagem({ ...boa, texto: "a".repeat(100_001) })).toBe(true);
  });
});

describe("o rele pelo HTTP", () => {
  it("sem EMAIL_TOKEN no ambiente, falha fechada com 503", async () => {
    const base = await subir();
    const r = await fetch(`${base}/api/email`, { method: "POST", body: "{}" });
    expect(r.status).toBe(503);
  });

  it("com token configurado, recusa quem nao manda token", async () => {
    process.env.EMAIL_TOKEN = TOKEN;
    const base = await subir();
    const r = await fetch(`${base}/api/email`, { method: "POST", body: "{}" });
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ erro: "Token do rele invalido." });
  });

  it("recusa token errado", async () => {
    process.env.EMAIL_TOKEN = TOKEN;
    const base = await subir();
    const r = await fetch(`${base}/api/email`, {
      method: "POST",
      headers: { Authorization: "Bearer errado" },
      body: "{}",
    });
    expect(r.status).toBe(401);
  });

  // Sem credencial do Gmail ele diz que nao da, em vez de aceitar o pedido e
  // deixar a pessoa esperando um e-mail que nunca sai.
  it("com token certo e sem credencial do Gmail, responde 503", async () => {
    process.env.EMAIL_TOKEN = TOKEN;
    const base = await subir();
    const r = await fetch(`${base}/api/email`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ para: "a@b.com", assunto: "x", texto: "y" }),
    });
    expect(r.status).toBe(503);
  });

  it("recusa GET quando nao e diagnostico", async () => {
    process.env.EMAIL_TOKEN = TOKEN;
    process.env.GMAIL_USUARIO = "u@gmail.com";
    process.env.GMAIL_SENHA = "senha";
    const base = await subir();
    const r = await fetch(`${base}/api/email`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(r.status).toBe(405);
  });

  it("recusa corpo que nao e JSON", async () => {
    process.env.EMAIL_TOKEN = TOKEN;
    process.env.GMAIL_USUARIO = "u@gmail.com";
    process.env.GMAIL_SENHA = "senha";
    const base = await subir();
    const r = await fetch(`${base}/api/email`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: "nao e json",
    });
    expect(r.status).toBe(400);
  });
});
