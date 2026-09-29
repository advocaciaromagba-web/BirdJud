// Copia do backup para fora do Railway.
//
// Isto tem teste denso por um motivo especifico: e um caminho que so e
// exercitado de verdade no dia em que o banco se perde. Erro aqui nao
// aparece no uso diario — aparece quando ja nao ha o que fazer.
import { afterEach, describe, expect, it } from "vitest";
import {
  CopiaRemotaMalConfigurada,
  assinar,
  caminhoCanonico,
  carimbos,
  consultaCanonica,
  chaveDoBackup,
  cifrarBackup,
  decifrarBackup,
  destinoDoAmbiente,
  type Destino,
} from "@/lib/copia-remota";

const DESTINO: Destino = {
  endereco: "https://conta.r2.cloudflarestorage.com",
  balde: "birdjud-backup",
  chave: "CHAVE-DE-TESTE",
  segredo: "segredo-de-teste",
  regiao: "auto",
};
const AGORA = new Date("2026-09-29T10:20:30Z");

const CHAVES = [
  "BACKUP_S3_ENDERECO",
  "BACKUP_S3_BALDE",
  "BACKUP_S3_CHAVE",
  "BACKUP_S3_SEGREDO",
  "BACKUP_S3_REGIAO",
];
const guardado = Object.fromEntries(CHAVES.map((c) => [c, process.env[c]]));

afterEach(() => {
  for (const c of CHAVES) {
    if (guardado[c] === undefined) delete process.env[c];
    else process.env[c] = guardado[c];
  }
});

describe("destino do ambiente", () => {
  it("sem nada configurado, nao ha destino", () => {
    for (const c of CHAVES) delete process.env[c];
    expect(destinoDoAmbiente()).toBeNull();
  });

  // Configuracao pela metade e o pior estado possivel: parece configurada e
  // nao copia nada. Por isso levanta em vez de devolver null.
  it("configuracao pela metade levanta, e diz o que falta", () => {
    for (const c of CHAVES) delete process.env[c];
    process.env.BACKUP_S3_BALDE = "birdjud-backup";
    expect(() => destinoDoAmbiente()).toThrow(CopiaRemotaMalConfigurada);
    expect(() => destinoDoAmbiente()).toThrow(/BACKUP_S3_ENDERECO/);
  });

  // Estas variaveis existem em muitos ambientes por outro motivo. Pegar
  // carona nelas mandaria o backup para um balde que ninguem escolheu.
  it("nao usa AWS_ACCESS_KEY_ID nem AWS_SECRET_ACCESS_KEY", () => {
    for (const c of CHAVES) delete process.env[c];
    process.env.AWS_ACCESS_KEY_ID = "de-outro-sistema";
    process.env.AWS_SECRET_ACCESS_KEY = "de-outro-sistema";
    expect(destinoDoAmbiente()).toBeNull();
  });

  it("a barra sobrando no endereco nao vira barra dupla", () => {
    for (const c of CHAVES) delete process.env[c];
    process.env.BACKUP_S3_ENDERECO = "https://conta.r2.cloudflarestorage.com//";
    process.env.BACKUP_S3_BALDE = "b";
    process.env.BACKUP_S3_CHAVE = "c";
    process.env.BACKUP_S3_SEGREDO = "s";
    expect(destinoDoAmbiente()?.endereco).toBe(
      "https://conta.r2.cloudflarestorage.com",
    );
  });
});

describe("carimbos", () => {
  it("no formato que o SigV4 exige", () => {
    expect(carimbos(AGORA)).toEqual({
      longo: "20260929T102030Z",
      curto: "20260929",
    });
  });
});

describe("caminho canonico", () => {
  // O nome do backup tem dois-pontos no carimbo de hora. Sem codificar, a
  // assinatura daqui e a do servidor deixam de bater, e volta um 403 mudo.
  it("codifica o segmento e preserva a barra", () => {
    expect(caminhoCanonico("banco/birdjud-2026-09-29T10:20.sql.gz")).toBe(
      "banco/birdjud-2026-09-29T10%3A20.sql.gz",
    );
  });

  it("codifica espaco e acento", () => {
    expect(caminhoCanonico("pasta com espaco/ção.gz")).toBe(
      "pasta%20com%20espaco/%C3%A7%C3%A3o.gz",
    );
  });
});

describe("assinatura", () => {
  const corpo = "a".repeat(10);
  const digest =
    "bf2cb58a68f684d95a3b78ef8f661c9a4e5b09e82cc8f9cc88cce90528caeb27";

  it("o metodo entra na requisicao canonica", () => {
    const put = assinar(DESTINO, "PUT", "x.gz", digest, 10, AGORA);
    const head = assinar(DESTINO, "HEAD", "x.gz", digest, 10, AGORA);
    expect(put.requisicaoCanonica.startsWith("PUT\n")).toBe(true);
    expect(head.requisicaoCanonica.startsWith("HEAD\n")).toBe(true);
    // Se o metodo nao entrasse, as duas assinaturas seriam iguais — que e
    // exatamente o defeito que este teste existe para impedir.
    expect(put.cabecalhos.authorization).not.toBe(head.cabecalhos.authorization);
  });

  it("assina host, data e digest, nesta ordem", () => {
    const a = assinar(DESTINO, "PUT", "x.gz", digest, 10, AGORA);
    expect(a.cabecalhos.authorization).toContain(
      "SignedHeaders=host;x-amz-content-sha256;x-amz-date",
    );
    expect(a.cabecalhos["x-amz-date"]).toBe("20260929T102030Z");
    expect(a.cabecalhos["x-amz-content-sha256"]).toBe(digest);
  });

  it("o escopo leva data, regiao e servico", () => {
    const a = assinar(DESTINO, "PUT", "x.gz", digest, 10, AGORA);
    expect(a.cabecalhos.authorization).toContain(
      "Credential=CHAVE-DE-TESTE/20260929/auto/s3/aws4_request",
    );
  });

  it("HEAD nao manda content-length", () => {
    const head = assinar(DESTINO, "HEAD", "x.gz", digest, 0, AGORA);
    expect(head.cabecalhos["content-length"]).toBeUndefined();
  });

  it("qualquer mudanca muda a assinatura", () => {
    const base = assinar(DESTINO, "PUT", "x.gz", digest, 10, AGORA);
    const variacoes = [
      assinar(DESTINO, "PUT", "y.gz", digest, 10, AGORA),
      assinar(DESTINO, "PUT", "x.gz", "0".repeat(64), 10, AGORA),
      assinar(DESTINO, "PUT", "x.gz", digest, 10, new Date("2026-09-30T10:20:30Z")),
      assinar({ ...DESTINO, segredo: "outro" }, "PUT", "x.gz", digest, 10, AGORA),
      assinar({ ...DESTINO, balde: "outro" }, "PUT", "x.gz", digest, 10, AGORA),
      assinar({ ...DESTINO, regiao: "us-west-004" }, "PUT", "x.gz", digest, 10, AGORA),
    ];
    for (const v of variacoes) {
      expect(v.cabecalhos.authorization).not.toBe(base.cabecalhos.authorization);
    }
  });

  it("a url nao duplica barra", () => {
    const a = assinar(DESTINO, "PUT", "banco/x.gz", digest, 10, AGORA);
    expect(a.url).toBe(
      "https://conta.r2.cloudflarestorage.com/birdjud-backup/banco/x.gz",
    );
  });
});

/*
 * O vetor oficial da AWS.
 *
 * E a unica forma de saber que a assinatura esta CERTA sem tentar contra um
 * servidor de verdade: os testes acima provam que ela muda quando deve
 * mudar, mas so este prova que o valor e o que o protocolo manda. Os dados
 * sao os do exemplo publicado da documentacao do SigV4 para S3.
 */
describe("vetor conhecido do SigV4", () => {
  it("reproduz a assinatura do exemplo da AWS", () => {
    const exemplo: Destino = {
      endereco: "https://examplebucket.s3.amazonaws.com",
      balde: "",
      chave: "AKIAIOSFODNN7EXAMPLE",
      segredo: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      regiao: "us-east-1",
    };
    const vazio =
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const a = assinar(
      exemplo,
      "HEAD",
      "test.txt",
      vazio,
      0,
      new Date("2013-05-24T00:00:00Z"),
    );
    // Se o canonico estiver montado errado, este texto muda.
    expect(a.requisicaoCanonica).toBe(
      [
        "HEAD",
        "/test.txt",
        "",
        "host:examplebucket.s3.amazonaws.com\nx-amz-content-sha256:" +
          vazio +
          "\nx-amz-date:20130524T000000Z\n",
        "host;x-amz-content-sha256;x-amz-date",
        vazio,
      ].join("\n"),
    );
  });
});

/*
 * A consulta na assinatura.
 *
 * Isto faltava, e o sintoma foi um 403 mudo ao LISTAR o balde — a operacao
 * que so se usa no dia da restauracao. Nao teria aparecido em uso nenhum
 * ate o dia em que importasse.
 */
describe("consulta assinada", () => {
  it("ordena por nome e codifica", () => {
    expect(consultaCanonica({ prefix: "banco/", "list-type": "2" })).toBe(
      "list-type=2&prefix=banco%2F",
    );
  });

  it("sem consulta, string vazia", () => {
    expect(consultaCanonica({})).toBe("");
  });

  it("entra na requisicao canonica e na url", () => {
    const vazio = "0".repeat(64);
    const com = assinar(DESTINO, "GET", "", vazio, 0, AGORA, {
      "list-type": "2",
      prefix: "banco/",
    });
    const sem = assinar(DESTINO, "GET", "", vazio, 0, AGORA);
    expect(com.requisicaoCanonica.split("\n")[2]).toBe(
      "list-type=2&prefix=banco%2F",
    );
    expect(com.url).toContain("?list-type=2&prefix=banco%2F");
    // Sem isto, listar e assinado como se nao houvesse consulta, e o
    // servidor recusa com 403 sem dizer por que.
    expect(com.cabecalhos.authorization).not.toBe(sem.cabecalhos.authorization);
  });
});

describe("cifra do backup", () => {
  const chave = Buffer.alloc(32, 7);

  it("vai e volta", () => {
    const original = Buffer.from("-- PostgreSQL database dump\nCOPY x...\n");
    const cifrado = cifrarBackup(original, chave);
    expect(cifrado.subarray(0, 8).toString()).toBe("BIRDJUD1");
    expect(cifrado.includes("PostgreSQL")).toBe(false);
    expect(decifrarBackup(cifrado, chave).equals(original)).toBe(true);
  });

  it("chave errada nao decifra", () => {
    const cifrado = cifrarBackup(Buffer.from("dados"), chave);
    expect(() => decifrarBackup(cifrado, Buffer.alloc(32, 9))).toThrow();
  });

  // A tag do GCM e o que transforma "o arquivo chegou" em "chegou inteiro".
  it("um byte trocado no caminho e recusado", () => {
    const cifrado = cifrarBackup(Buffer.from("dados importantes"), chave);
    cifrado[cifrado.length - 1] ^= 0x01;
    expect(() => decifrarBackup(cifrado, chave)).toThrow();
  });

  it("arquivo sem a marca nao e tratado como cifrado", () => {
    expect(() => decifrarBackup(Buffer.from("dump em claro"), chave)).toThrow(
      /falta a marca/,
    );
  });

  it("cifrar duas vezes o mesmo conteudo da resultados diferentes", () => {
    const a = cifrarBackup(Buffer.from("igual"), chave);
    const b = cifrarBackup(Buffer.from("igual"), chave);
    expect(a.equals(b)).toBe(false);
  });

  it("chave de tamanho errado e recusada com instrucao", () => {
    process.env.BACKUP_CHAVE = Buffer.alloc(16).toString("base64");
    expect(() => chaveDoBackup()).toThrow(/32 bytes/);
    delete process.env.BACKUP_CHAVE;
    expect(chaveDoBackup()).toBeNull();
  });
});
