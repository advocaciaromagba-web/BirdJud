/**
 * Transcricao de audio pela OpenAI, com um servidor de mentira no lugar dela.
 *
 * O QUE ESTES TESTES PROTEGEM:
 *
 * 1. arquivo ruim e recusado ANTES de virar chamada paga — a plataforma paga
 *    a conta, entao gasto a toa sai do bolso dela;
 * 2. erro do fornecedor vira frase que o advogado entende e consegue agir;
 * 3. a medicao acontece, porque e so por ela que a plataforma sabe o custo.
 */
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AudioRecusado,
  LIMITE_DE_BYTES,
  SemChaveDeTranscricao,
  TranscricaoFalhou,
  conferirAudio,
  explicarFalha,
  minutosDe,
  transcrever,
} from "../src/lib/transcricao-audio";

describe("conferencia do arquivo, antes de gastar", () => {
  it("recusa o que passa do limite, dizendo o tamanho", () => {
    expect(() =>
      conferirAudio({ tipo: "audio/mpeg", tamanho: LIMITE_DE_BYTES + 1 }),
    ).toThrow(AudioRecusado);
    try {
      conferirAudio({ tipo: "audio/mpeg", tamanho: 40 * 1024 * 1024 });
    } catch (erro) {
      expect((erro as Error).message).toContain("40 MB");
      expect((erro as Error).message).toContain("25 MB");
    }
  });

  it("recusa arquivo vazio", () => {
    expect(() => conferirAudio({ tipo: "audio/mpeg", tamanho: 10 })).toThrow(
      AudioRecusado,
    );
  });

  it("recusa formato que a API nao aceita", () => {
    expect(() =>
      conferirAudio({ tipo: "application/pdf", tamanho: 1024 * 1024 }),
    ).toThrow(AudioRecusado);
  });

  it("aceita o tipo com parametro, que e como o navegador manda", () => {
    expect(() =>
      conferirAudio({ tipo: "audio/webm;codecs=opus", tamanho: 1024 * 1024 }),
    ).not.toThrow();
  });

  it("aceita maiuscula no tipo", () => {
    expect(() =>
      conferirAudio({ tipo: "AUDIO/MPEG", tamanho: 1024 * 1024 }),
    ).not.toThrow();
  });
});

describe("erro do fornecedor virando frase util", () => {
  it("chave recusada nao culpa o escritorio, que nao tem chave nenhuma", () => {
    const frase = explicarFalha(401, "Unauthorized");
    expect(frase).toContain("plataforma");
    expect(frase).toContain("suporte");
    expect(frase).not.toContain("401");
  });

  it("limite de uso diz para tentar de novo, e oferece a saida local", () => {
    expect(explicarFalha(429, "")).toContain("transcricao ao vivo");
  });

  it("fora do ar nao vira texto cru de API", () => {
    expect(explicarFalha(503, "<html>bad gateway</html>")).toContain(
      "fora do ar",
    );
  });
});

describe("minutos medidos", () => {
  it("arredonda para cima, e nunca devolve zero", () => {
    expect(minutosDe(1)).toBe(1);
    expect(minutosDe(59)).toBe(1);
    expect(minutosDe(61)).toBe(2);
    expect(minutosDe(0)).toBe(1);
  });
});

describe("a chamada em si", () => {
  let servidor: Server;
  let endereco = "";
  let resposta: { status: number; corpo: unknown } = { status: 200, corpo: {} };
  let recebido: { autorizacao?: string; tamanho: number } = { tamanho: 0 };

  beforeAll(async () => {
    servidor = createServer((req, res) => {
      let total = 0;
      req.on("data", (p) => (total += p.length));
      req.on("end", () => {
        recebido = {
          autorizacao: req.headers.authorization,
          tamanho: total,
        };
        res.writeHead(resposta.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(resposta.corpo));
      });
    });
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    endereco = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
    process.env.OPENAI_BASE_URL = endereco;
  });

  afterAll(async () => {
    delete process.env.OPENAI_BASE_URL;
    await new Promise<void>((ok) => servidor.close(() => ok()));
  });

  beforeEach(() => {
    resposta = {
      status: 200,
      corpo: { text: "  Boa tarde, doutor.  ", duration: 95 },
    };
  });

  const audio = {
    nome: "reuniao.mp3",
    tipo: "audio/mpeg",
    dados: Buffer.alloc(200 * 1024, 7),
  };

  it("sem chave da plataforma, nao chama e oferece a saida local", async () => {
    await expect(transcrever(audio, undefined)).rejects.toBeInstanceOf(
      SemChaveDeTranscricao,
    );
    try {
      await transcrever(audio, undefined);
    } catch (erro) {
      expect((erro as Error).message).toContain("roda no proprio computador");
    }
  });

  it("transcreve, apara o texto e devolve a duracao", async () => {
    const r = await transcrever(audio, "chave-de-teste");
    expect(r.texto).toBe("Boa tarde, doutor.");
    expect(r.segundos).toBe(95);
    expect(recebido.autorizacao).toBe("Bearer chave-de-teste");
    expect(recebido.tamanho).toBeGreaterThan(200 * 1024);
  });

  it("arquivo ruim nem chega a sair da maquina", async () => {
    recebido = { tamanho: 0 };
    await expect(
      transcrever(
        { nome: "x.pdf", tipo: "application/pdf", dados: Buffer.alloc(5000) },
        "chave-de-teste",
      ),
    ).rejects.toBeInstanceOf(AudioRecusado);
    expect(recebido.tamanho).toBe(0);
  });

  it("texto vazio e falha, nao sucesso silencioso", async () => {
    resposta = { status: 200, corpo: { text: "   " } };
    await expect(transcrever(audio, "chave-de-teste")).rejects.toBeInstanceOf(
      TranscricaoFalhou,
    );
    try {
      await transcrever(audio, "chave-de-teste");
    } catch (erro) {
      expect((erro as Error).message).toContain("mudo ou baixo demais");
    }
  });

  it("sem duracao informada, nao inventa numero", async () => {
    resposta = { status: 200, corpo: { text: "ok" } };
    const r = await transcrever(audio, "chave-de-teste");
    expect(r.segundos).toBeNull();
  });

  it("erro do fornecedor chega traduzido", async () => {
    resposta = { status: 429, corpo: { error: { message: "rate limit" } } };
    try {
      await transcrever(audio, "chave-de-teste");
      throw new Error("deveria ter falhado");
    } catch (erro) {
      expect((erro as Error).message).toContain("Tente de novo");
      // O texto cru do fornecedor nao chega ao advogado.
      expect((erro as Error).message).not.toContain("rate limit");
    }
  });
});
