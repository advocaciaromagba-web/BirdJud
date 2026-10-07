// Assinatura eletronica da peca, pelo Autentique.
//
// O QUE ESTES TESTES PROTEGEM: dinheiro do escritorio e a palavra dele com o
// cliente. Cada documento enviado e cobrado, o e-mail sai na hora e nao da
// para desfazer. Um signatario a mais, um e-mail repetido ou um reenvio por
// descuido nao dao erro nenhum — custam, e chegam na caixa de entrada de
// quem nao devia receber.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ASSINA_POR_PADRAO,
  AutentiqueRecusou,
  consultarDocumento,
  ehEmail,
  enviarDocumento,
  impedimentosDoEnvio,
  montarSignatarios,
  operacoesDoEnvio,
  situacaoDoDocumento,
  type Signatario,
} from "../src/lib/autentique";

const CLIENTE = { nome: "Maria Helena", email: "maria@exemplo.test" };
const ADVOGADOS = [
  { nome: "Jose Luciano", email: "luciano@banca.test" },
  { nome: "Ana Paula", email: "ana@banca.test" },
];

describe("quem assina cada peca", () => {
  it("a procuracao e ato do cliente: so ele assina", () => {
    // O advogado nao assina a propria procuracao. Mandar para ele assinar
    // custaria outro documento e confundiria quem recebe.
    expect(ASSINA_POR_PADRAO.PROCURACAO).toBe("CLIENTE");
    const s = montarSignatarios("PROCURACAO", CLIENTE, ADVOGADOS);
    expect(s.map((x) => x.email)).toEqual(["maria@exemplo.test"]);
  });

  it("a declaracao de hipossuficiencia tambem e so do cliente", () => {
    expect(montarSignatarios("DECLARACAO", CLIENTE, ADVOGADOS)).toHaveLength(1);
  });

  it("o recibo e do escritorio: quem da quitacao e quem recebeu", () => {
    const s = montarSignatarios("RECIBO", CLIENTE, ADVOGADOS);
    expect(s.map((x) => x.email)).toEqual(["luciano@banca.test", "ana@banca.test"]);
  });

  it("o contrato e bilateral", () => {
    const s = montarSignatarios("CONTRATO", CLIENTE, ADVOGADOS);
    expect(s).toHaveLength(3);
  });

  it("nao repete quem aparece dos dois lados", () => {
    // O advogado que tambem e o contato do cliente receberia dois e-mails e
    // teria de assinar o mesmo documento duas vezes. E o provedor cobra por
    // signatario.
    const s = montarSignatarios(
      "CONTRATO",
      { nome: "Banca Cliente", email: "LUCIANO@banca.test" },
      ADVOGADOS,
    );
    expect(s.map((x) => x.email.toLowerCase())).toEqual([
      "luciano@banca.test",
      "ana@banca.test",
    ]);
  });

  it("deixa escolher diferente do padrao", () => {
    expect(montarSignatarios("PROCURACAO", CLIENTE, ADVOGADOS, "AMBOS")).toHaveLength(3);
  });
});

describe("o que impede o envio", () => {
  it("diz TODOS os motivos de uma vez", () => {
    // Um motivo por tentativa faria quem esta na tela descobrir o proximo
    // problema so depois de arrumar o anterior.
    const motivos = impedimentosDoEnvio([
      { nome: "Sem Email", email: "", acao: "SIGN" },
      { nome: "Torto", email: "nao-e-email", acao: "SIGN" },
    ]);
    expect(motivos).toHaveLength(2);
    expect(motivos[0]).toContain("Sem Email");
    expect(motivos[1]).toContain("Torto");
  });

  it("peca sem signatario nenhum nao sai", () => {
    expect(impedimentosDoEnvio([])).toEqual(["Nenhum signatario: nao ha quem assine."]);
  });

  it("e-mail bom passa", () => {
    expect(impedimentosDoEnvio(montarSignatarios("CONTRATO", CLIENTE, ADVOGADOS))).toEqual(
      [],
    );
    expect(ehEmail("maria@exemplo.test")).toBe(true);
    expect(ehEmail("maria@exemplo")).toBe(false);
    expect(ehEmail(null)).toBe(false);
  });
});

describe("o corpo do envio", () => {
  it("manda o arquivo NULO na consulta e aponta por fora", () => {
    // A ARMADILHA: o arquivo nao vai dentro do JSON. Vai como parte propria do
    // multipart, e o `map` diz em qual variavel ele entra. Quem manda o
    // conteudo no JSON recebe um erro do servidor que nao explica nada.
    const { operations, map } = operacoesDoEnvio("Contrato - Maria", [
      { nome: "Maria", email: "maria@exemplo.test", acao: "SIGN" },
    ]);
    const o = JSON.parse(operations);
    expect(o.variables.arquivo).toBeNull();
    expect(JSON.parse(map)).toEqual({ arquivo: ["variables.arquivo"] });
    expect(o.variables.documento.name).toBe("Contrato - Maria");
    expect(o.variables.signatarios).toEqual([
      { email: "maria@exemplo.test", action: "SIGN", name: "Maria" },
    ]);
  });

  it("baixa o e-mail para minusculas", () => {
    const o = JSON.parse(
      operacoesDoEnvio("x", [{ nome: "M", email: " Maria@Exemplo.TEST ", acao: "SIGN" }])
        .operations,
    );
    expect(o.variables.signatarios[0].email).toBe("maria@exemplo.test");
  });
});

describe("em que pe esta o documento", () => {
  const s = (assinadoEm: string | null, recusadoEm: string | null = null): Signatario => ({
    nome: "x",
    email: "x@y.test",
    acao: "SIGN",
    assinadoEm,
    recusadoEm,
  });

  it("recusa de um derruba o documento inteiro", () => {
    // Um contrato em que o cliente recusou nao esta "assinado em parte": esta
    // recusado, e quem olha a tela precisa ver isso, nao um numero bonito.
    expect(situacaoDoDocumento([s("2026-10-07"), s(null, "2026-10-07")])).toBe("RECUSADO");
  });

  it("todos assinaram e assinado", () => {
    expect(situacaoDoDocumento([s("2026-10-07"), s("2026-10-07")])).toBe("ASSINADO");
  });

  it("um assinou e parcial", () => {
    expect(situacaoDoDocumento([s("2026-10-07"), s(null)])).toBe("PARCIAL");
  });

  it("ninguem assinou e enviado", () => {
    expect(situacaoDoDocumento([s(null), s(null)])).toBe("ENVIADO");
  });
});

// ---------------------------------------------------------------------------
// Contra um Autentique de mentira, para provar o que sai no fio.
// ---------------------------------------------------------------------------

describe("o envio no fio", () => {
  let servidor: Server;
  let recebido: {
    autorizacao?: string;
    operations?: string;
    map?: string;
    nomeDoArquivo?: string;
    conteudo?: string;
  } = {};
  let resposta: { corpo: unknown; status: number } = { corpo: null, status: 200 };

  beforeAll(async () => {
    servidor = createServer(async (req, res) => {
      const pedacos: Buffer[] = [];
      for await (const p of req) pedacos.push(p as Buffer);
      const bruto = Buffer.concat(pedacos);
      const tipo = req.headers["content-type"] ?? "";

      if (tipo.startsWith("multipart/")) {
        const forma = await new Response(bruto, {
          headers: { "content-type": tipo },
        }).formData();
        const arquivo = forma.get("arquivo") as File;
        recebido = {
          autorizacao: req.headers.authorization,
          operations: String(forma.get("operations")),
          map: String(forma.get("map")),
          nomeDoArquivo: arquivo?.name,
          conteudo: arquivo ? await arquivo.text() : undefined,
        };
      } else {
        recebido = { autorizacao: req.headers.authorization, operations: bruto.toString() };
      }

      res.writeHead(resposta.status, { "content-type": "application/json" });
      res.end(JSON.stringify(resposta.corpo));
    });
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    const porta = (servidor.address() as { port: number }).port;
    process.env.AUTENTIQUE_BASE_URL = `http://127.0.0.1:${porta}/graphql`;
  });

  afterAll(async () => {
    delete process.env.AUTENTIQUE_BASE_URL;
    await new Promise<void>((ok) => servidor.close(() => ok()));
  });

  const PECA = {
    nome: "Contrato de honorarios - Maria Helena",
    nomeDoArquivo: "contrato-maria.pdf",
    arquivo: Buffer.from("%PDF-1.7 fingindo ser um contrato"),
    signatarios: montarSignatarios("CONTRATO", CLIENTE, [ADVOGADOS[0]]),
  };

  it("sobe o PDF como arquivo, nao dentro do JSON", async () => {
    resposta = {
      status: 200,
      corpo: {
        data: {
          createDocument: {
            id: "doc-1",
            name: PECA.nome,
            signatures: [
              {
                public_id: "a",
                name: "Maria Helena",
                email: "maria@exemplo.test",
                link: { short_link: "https://assina.test/a" },
                signed: null,
                rejected: null,
              },
              {
                public_id: "b",
                name: "Jose Luciano",
                email: "luciano@banca.test",
                link: { short_link: "https://assina.test/b" },
                signed: null,
                rejected: null,
              },
            ],
          },
        },
      },
    };

    const doc = await enviarDocumento("token-de-teste", PECA);

    expect(recebido.autorizacao).toBe("Bearer token-de-teste");
    expect(recebido.nomeDoArquivo).toBe("contrato-maria.pdf");
    expect(recebido.conteudo).toBe("%PDF-1.7 fingindo ser um contrato");
    expect(JSON.parse(recebido.operations!).variables.arquivo).toBeNull();
    // O conteudo do PDF NAO pode estar no JSON da consulta.
    expect(recebido.operations).not.toContain("fingindo ser um contrato");

    expect(doc.id).toBe("doc-1");
    expect(doc.situacao).toBe("ENVIADO");
    expect(doc.signatarios[0].link).toBe("https://assina.test/a");
  });

  it("nao chega a mandar quando falta e-mail — nem gasta documento", async () => {
    recebido = {};
    await expect(
      enviarDocumento("token-de-teste", {
        ...PECA,
        signatarios: [{ nome: "Sem Email", email: "", acao: "SIGN" }],
      }),
    ).rejects.toBeInstanceOf(AutentiqueRecusou);
    // Nada saiu no fio: o provedor nem foi chamado.
    expect(recebido).toEqual({});
  });

  it("erro de GraphQL com status 200 e erro", async () => {
    // GraphQL responde 200 mesmo quando recusou. Ler so o status deixaria o
    // sistema gravar um envio que nunca existiu.
    resposta = { status: 200, corpo: { errors: [{ message: "Plano sem creditos." }] } };
    await expect(enviarDocumento("t", PECA)).rejects.toThrow("Plano sem creditos.");
  });

  it("token recusado diz onde reconectar", async () => {
    resposta = { status: 401, corpo: {} };
    await expect(enviarDocumento("t", PECA)).rejects.toThrow(/Integracoes/);
  });

  it("consulta devolve quem ja assinou", async () => {
    resposta = {
      status: 200,
      corpo: {
        data: {
          document: {
            id: "doc-1",
            name: "Contrato",
            signatures: [
              {
                name: "Maria",
                email: "maria@exemplo.test",
                link: { short_link: "https://assina.test/a" },
                signed: { created_at: "2026-10-07T12:00:00Z" },
                rejected: null,
              },
              {
                name: "Luciano",
                email: "luciano@banca.test",
                link: { short_link: "https://assina.test/b" },
                signed: null,
                rejected: null,
              },
            ],
          },
        },
      },
    };
    const doc = await consultarDocumento("t", "doc-1");
    expect(doc.situacao).toBe("PARCIAL");
    expect(doc.signatarios[0].assinadoEm).toBe("2026-10-07T12:00:00Z");
  });
});
