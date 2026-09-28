// Escolha do transporte do e-mail da plataforma.
//
// Isto tem teste porque a ordem nao e arbitraria: o Railway bloqueia saida
// SMTP, entao cair no SMTP direto quando havia um caminho por HTTPS significa
// e-mail que nunca sai — e o sintoma e um "connection timeout" que se confunde
// com senha errada.
import { afterEach, describe, expect, it } from "vitest";
import {
  PlataformaSemRemetente,
  enviarPelaPlataforma,
  temRemetenteDaPlataforma,
  transporteDaPlataforma,
} from "@/lib/email-plataforma";
import { createServer, type Server } from "node:http";

const CHAVES = [
  "EMAIL_RELE_URL",
  "EMAIL_RELE_TOKEN",
  "RESEND_API_KEY",
  "PLATAFORMA_REMETENTE",
  "PLATAFORMA_RESPONDER_PARA",
  "PLATAFORMA_SMTP_HOST",
  "PLATAFORMA_SMTP_USUARIO",
  "PLATAFORMA_SMTP_SENHA",
  "PLATAFORMA_SMTP_PORTA",
];

const guardado: Record<string, string | undefined> = {};
for (const c of CHAVES) guardado[c] = process.env[c];

let servidor: Server | null = null;

afterEach(async () => {
  for (const c of CHAVES) {
    if (guardado[c] === undefined) delete process.env[c];
    else process.env[c] = guardado[c];
  }
  if (servidor) await new Promise<void>((p) => servidor!.close(() => p()));
  servidor = null;
});

function limpar() {
  for (const c of CHAVES) delete process.env[c];
}

describe("escolha do transporte", () => {
  it("sem nada configurado, nao ha remetente", () => {
    limpar();
    expect(transporteDaPlataforma()).toBeNull();
    expect(temRemetenteDaPlataforma()).toBe(false);
  });

  it("o rele vem na frente de tudo", () => {
    limpar();
    process.env.EMAIL_RELE_URL = "https://rele.exemplo/api/email";
    process.env.EMAIL_RELE_TOKEN = "t";
    process.env.RESEND_API_KEY = "chave";
    process.env.PLATAFORMA_REMETENTE = "BirdJud <a@b.com>";
    process.env.PLATAFORMA_SMTP_HOST = "smtp.gmail.com";
    process.env.PLATAFORMA_SMTP_USUARIO = "u";
    process.env.PLATAFORMA_SMTP_SENHA = "s";
    expect(transporteDaPlataforma()?.tipo).toBe("rele");
  });

  // O rele fixa o remetente do lado dele, de proposito: quem chama nao escolhe
  // de quem o e-mail parece vir.
  it("o rele funciona sem PLATAFORMA_REMETENTE", () => {
    limpar();
    process.env.EMAIL_RELE_URL = "https://rele.exemplo/api/email";
    process.env.EMAIL_RELE_TOKEN = "t";
    expect(transporteDaPlataforma()?.tipo).toBe("rele");
  });

  it("rele pela metade nao conta", () => {
    limpar();
    process.env.EMAIL_RELE_URL = "https://rele.exemplo/api/email";
    expect(transporteDaPlataforma()).toBeNull();
    limpar();
    process.env.EMAIL_RELE_TOKEN = "t";
    expect(transporteDaPlataforma()).toBeNull();
  });

  it("variavel vazia nao vale como configurada", () => {
    limpar();
    process.env.EMAIL_RELE_URL = "   ";
    process.env.EMAIL_RELE_TOKEN = "t";
    expect(transporteDaPlataforma()).toBeNull();
  });

  it("sem rele, o servico de envio vem antes do SMTP direto", () => {
    limpar();
    process.env.RESEND_API_KEY = "chave";
    process.env.PLATAFORMA_REMETENTE = "BirdJud <a@b.com>";
    process.env.PLATAFORMA_SMTP_HOST = "smtp.gmail.com";
    process.env.PLATAFORMA_SMTP_USUARIO = "u";
    process.env.PLATAFORMA_SMTP_SENHA = "s";
    expect(transporteDaPlataforma()?.tipo).toBe("https");
  });

  it("so com SMTP completo sobra o SMTP direto", () => {
    limpar();
    process.env.PLATAFORMA_REMETENTE = "BirdJud <a@b.com>";
    process.env.PLATAFORMA_SMTP_HOST = "smtp.gmail.com";
    process.env.PLATAFORMA_SMTP_USUARIO = "u";
    process.env.PLATAFORMA_SMTP_SENHA = "s";
    expect(transporteDaPlataforma()?.tipo).toBe("smtp");
  });

  it("barra sobrando no fim do endereco do rele nao duplica", () => {
    limpar();
    process.env.EMAIL_RELE_URL = "https://rele.exemplo/api/email//";
    process.env.EMAIL_RELE_TOKEN = "t";
    const t = transporteDaPlataforma();
    expect(t?.tipo === "rele" && t.endereco).toBe("https://rele.exemplo/api/email");
  });
});

describe("envio pelo rele", () => {
  async function subirRele(
    responder: (corpo: string) => { status: number; corpo: string },
  ): Promise<{ base: string; recebido: () => { url: string; auth?: string; corpo: string } }> {
    let visto = { url: "", auth: undefined as string | undefined, corpo: "" };
    servidor = createServer((pedido, resposta) => {
      let corpo = "";
      pedido.on("data", (p) => (corpo += p));
      pedido.on("end", () => {
        visto = {
          url: pedido.url ?? "",
          auth: pedido.headers.authorization,
          corpo,
        };
        const r = responder(corpo);
        resposta.statusCode = r.status;
        resposta.end(r.corpo);
      });
    });
    await new Promise<void>((p) => servidor!.listen(0, "127.0.0.1", p));
    const e = servidor.address();
    if (typeof e === "string" || e === null) throw new Error("sem porta");
    return { base: `http://127.0.0.1:${e.port}`, recebido: () => visto };
  }

  it("manda a mensagem com o token no cabecalho", async () => {
    limpar();
    const { base, recebido } = await subirRele(() => ({
      status: 200,
      corpo: '{"ok":true}',
    }));
    process.env.EMAIL_RELE_URL = `${base}/api/email`;
    process.env.EMAIL_RELE_TOKEN = "token-secreto";

    await enviarPelaPlataforma({
      para: "alguem@exemplo.com",
      assunto: "Redefinir senha",
      texto: "link",
    });

    const v = recebido();
    expect(v.auth).toBe("Bearer token-secreto");
    expect(JSON.parse(v.corpo)).toEqual({
      para: "alguem@exemplo.com",
      assunto: "Redefinir senha",
      texto: "link",
    });
  });

  it("rele que recusa vira FalhaNoEnvio com o motivo, nao silencio", async () => {
    limpar();
    const { base } = await subirRele(() => ({
      status: 502,
      corpo: '{"erro":"O Gmail recusou o envio: senha invalida"}',
    }));
    process.env.EMAIL_RELE_URL = `${base}/api/email`;
    process.env.EMAIL_RELE_TOKEN = "t";

    await expect(
      enviarPelaPlataforma({ para: "a@b.com", assunto: "x", texto: "y" }),
    ).rejects.toThrow(/o rele recusou: HTTP 502.*senha invalida/);
  });

  it("rele fora do ar diz que foi o rele, nao o Gmail", async () => {
    limpar();
    process.env.EMAIL_RELE_URL = "http://127.0.0.1:1/api/email";
    process.env.EMAIL_RELE_TOKEN = "t";
    await expect(
      enviarPelaPlataforma({ para: "a@b.com", assunto: "x", texto: "y" }),
    ).rejects.toThrow(/o rele de e-mail nao respondeu/);
  });

  it("sem transporte nenhum, levanta PlataformaSemRemetente", async () => {
    limpar();
    await expect(
      enviarPelaPlataforma({ para: "a@b.com", assunto: "x", texto: "y" }),
    ).rejects.toThrow(PlataformaSemRemetente);
  });
});
