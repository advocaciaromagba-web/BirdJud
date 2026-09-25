// Modulo NFSE.
//
// Uma separacao importante nos testes deste modulo: o que da para PROVAR aqui
// e o que so a homologacao prova.
//
//   Provado aqui: a assinatura digital (assina e confere de verdade, com
//   certificado gerado na hora), a numeracao sem buraco nem repeticao, o que
//   acontece quando a prefeitura recusa, e o isolamento entre escritorios.
//
//   NAO provado aqui: se o layout do XML e o endereco do ambiente nacional
//   estao certos. Isso e `npm run conferir-nfse`, contra a homologacao, com o
//   certificado do escritorio. Os testes de layout conferem FORMATO (tamanho,
//   preenchimento, escape), nunca "esta certo segundo o manual".
import { createServer, type Server } from "node:http";
import forge from "node-forge";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  comEscritorio,
  prismaPlataforma,
  semEscritorio,
} from "../src/lib/prisma";
import { salvarIntegracao } from "../src/lib/integracao";
import { consumoDoMes } from "../src/lib/consumo";
import {
  abrirCertificado,
  assinarDps,
  CertificadoInvalido,
  certificadoEmBase64,
  conferirAssinatura,
} from "../src/lib/nfse/assinatura";
import {
  aliquotaEmMilesimos,
  aliquotaXml,
  dataHoraXml,
  emReaisXml,
  escapar,
  idDaDps,
  montarDps,
  montarPedidoDeCancelamento,
  OP_SIMPLES,
  soDigitos,
  type DadosDaDps,
} from "../src/lib/nfse/layout";
import { desempacotar, empacotar } from "../src/lib/nfse/nacional";
import {
  cancelarNota,
  CancelamentoInvalido,
  emitirNota,
  FalhaNaNfse,
  NotaInvalida,
  SemCadastroFiscal,
  SemCertificado,
} from "../src/lib/nfse";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Certificado de mentira, gerado na hora
// ---------------------------------------------------------------------------

function certificadoDeTeste(senha = "senha-do-teste"): string {
  const par = forge.pki.rsa.generateKeyPair(2048);
  const certificado = forge.pki.createCertificate();
  certificado.publicKey = par.publicKey;
  certificado.serialNumber = "01";
  certificado.validity.notBefore = new Date();
  certificado.validity.notAfter = new Date(Date.now() + 365 * 86400000);
  const nome = [
    { name: "commonName", value: "ESCRITORIO TESTE:12345678000199" },
  ];
  certificado.setSubject(nome);
  certificado.setIssuer(nome);
  certificado.sign(par.privateKey, forge.md.sha256.create());

  const p12 = forge.pkcs12.toPkcs12Asn1(par.privateKey, [certificado], senha, {
    algorithm: "3des",
  });
  return forge.util.encode64(forge.asn1.toDer(p12).getBytes());
}

const DADOS: DadosDaDps = {
  serie: "1",
  numero: 42,
  emitidaEm: new Date("2026-09-19T14:30:00Z"),
  prestador: {
    cnpj: "12.345.678/0001-99",
    inscricaoMunicipal: "123456",
    codigoMunicipio: "2927408",
    regime: "SIMPLES",
  },
  tomador: {
    documento: "529.982.247-25",
    nome: "Cliente & Cia",
    email: "c@teste.br",
  },
  servico: {
    codigoTributacao: "17.14",
    descricao: "Honorarios advocaticios",
    valorCentavos: 150_000,
    aliquotaMilesimos: 2000,
    issRetido: false,
    codigoMunicipioPrestacao: "2927408",
  },
};

describe("formato do XML (formato, nao verdade fiscal)", () => {
  it("dinheiro e aliquota saem com as casas do padrao fiscal", () => {
    expect(emReaisXml(150_000)).toBe("1500.00");
    expect(emReaisXml(1)).toBe("0.01");
    expect(aliquotaXml(2000)).toBe("2.0000");
    expect(aliquotaXml(2500)).toBe("2.5000");
  });

  it("aliquota digitada vira milesimos, e o que nao e percentual e recusado", () => {
    expect(aliquotaEmMilesimos("2")).toBe(2000);
    expect(aliquotaEmMilesimos("2,5")).toBe(2500);
    expect(aliquotaEmMilesimos("0")).toBe(0);
    expect(aliquotaEmMilesimos("abc")).toBeNull();
    expect(aliquotaEmMilesimos("-1")).toBeNull();
    expect(aliquotaEmMilesimos("101")).toBeNull();
  });

  it("a hora sai no fuso de Brasilia, nao no do servidor", () => {
    // Servidor em UTC ou na Europa nao pode mudar a data de competencia.
    expect(dataHoraXml(new Date("2026-09-19T14:30:00Z"))).toBe(
      "2026-09-19T11:30:00-03:00",
    );
    expect(dataHoraXml(new Date("2026-09-19T02:00:00Z"))).toBe(
      "2026-09-18T23:00:00-03:00",
    );
  });

  it("caractere que quebra XML e escapado", () => {
    expect(escapar('Advocacia "A & B" <matriz>')).toBe(
      "Advocacia &quot;A &amp; B&quot; &lt;matriz&gt;",
    );
    expect(montarDps(DADOS)).toContain("Cliente &amp; Cia");
  });

  it("o Id do DPS tem o tamanho e o preenchimento documentados", () => {
    const id = idDaDps(DADOS);
    expect(id).toMatch(/^DPS\d{42}$/);
    expect(id).toContain("2927408"); // municipio
    expect(id).toContain("12345678000199"); // CNPJ sem mascara
    expect(id.endsWith("000000000000042")).toBe(true); // numero com zeros a esquerda
  });

  it("CPF e CNPJ do tomador entram na etiqueta certa, sem mascara", () => {
    const comCpf = montarDps(DADOS);
    expect(comCpf).toContain("<CPF>52998224725</CPF>");

    const comCnpj = montarDps({
      ...DADOS,
      tomador: { ...DADOS.tomador, documento: "11.222.333/0001-81" },
    });
    expect(comCnpj).toContain("<CNPJ>11222333000181</CNPJ>");
  });

  it("homologacao e producao saem marcadas diferente", () => {
    expect(montarDps(DADOS, "HOMOLOGACAO")).toContain("<tpAmb>2</tpAmb>");
    expect(montarDps(DADOS, "PRODUCAO")).toContain("<tpAmb>1</tpAmb>");
  });

  it("cada regime tem um codigo proprio", () => {
    // Trocar um pelo outro sai na tributacao da nota, e o escritorio so
    // descobre no fim do mes.
    expect(new Set(Object.values(OP_SIMPLES)).size).toBe(3);
    expect(montarDps(DADOS)).toContain(
      `<opSimpNac>${OP_SIMPLES.SIMPLES}</opSimpNac>`,
    );
  });

  it("so digitos limpa mascara", () => {
    expect(soDigitos("12.345.678/0001-99")).toBe("12345678000199");
  });

  it("o pedido de cancelamento carrega a chave e o motivo", () => {
    const pedido = montarPedidoDeCancelamento({
      chaveAcesso: "29260912345678000199000000000000000000000000001",
      cnpjAutor: "12.345.678/0001-99",
      motivo: "SERVICO_NAO_PRESTADO",
      emitidoEm: new Date("2026-09-19T14:30:00Z"),
    });
    expect(pedido.xml).toContain("<cMotivo>2</cMotivo>");
    expect(pedido.xml).toContain("<CNPJAutor>12345678000199</CNPJAutor>");
    expect(pedido.id.startsWith("EVT")).toBe(true);
  });

  it("o DPS viaja comprimido, e volta igual", () => {
    const xml = montarDps(DADOS);
    expect(desempacotar(empacotar(xml))).toBe(xml);
    // Comprimir vale a pena: o XML e repetitivo.
    expect(empacotar(xml).length).toBeLessThan(xml.length);
  });
});

describe("assinatura digital (isto e provado de verdade)", () => {
  const pfx = certificadoDeTeste();

  it("assina e a assinatura confere", () => {
    const certificado = abrirCertificado(pfx, "senha-do-teste");
    const assinado = assinarDps(montarDps(DADOS), certificado, idDaDps(DADOS));

    expect(assinado).toContain("<Signature");
    expect(assinado).toContain(
      certificadoEmBase64(certificado.certificadoPem).slice(0, 40),
    );
    expect(conferirAssinatura(assinado, certificado.certificadoPem)).toBe(true);
  });

  it("documento adulterado depois de assinado nao confere mais", () => {
    // E a razao de existir da assinatura: trocar o valor da nota tem de
    // derrubar a validade.
    const certificado = abrirCertificado(pfx, "senha-do-teste");
    const assinado = assinarDps(montarDps(DADOS), certificado, idDaDps(DADOS));
    const adulterado = assinado.replace(
      "<vServ>1500.00</vServ>",
      "<vServ>15.00</vServ>",
    );

    expect(adulterado).not.toBe(assinado);
    expect(conferirAssinatura(adulterado, certificado.certificadoPem)).toBe(
      false,
    );
  });

  it("senha errada e arquivo invalido dao mensagem propria", () => {
    expect(() => abrirCertificado(pfx, "senha-errada")).toThrow(
      CertificadoInvalido,
    );
    expect(() => abrirCertificado("nao-e-um-pfx", "x")).toThrow(
      CertificadoInvalido,
    );

    try {
      abrirCertificado(pfx, "senha-errada");
    } catch (erro) {
      expect((erro as Error).message).toMatch(/[Ss]enha/);
    }
  });
});

// ---------------------------------------------------------------------------
// Ambiente nacional servido localmente
// ---------------------------------------------------------------------------

let servidor: Server;
let recebidas: { caminho: string; corpo: any }[] = [];
let responder: (caminho: string) => { status: number; json: unknown } = () => ({
  status: 200,
  json: {
    chaveAcesso: "29260912345678000199",
    numeroNfse: "1",
    linkPdf: "https://p/1.pdf",
  },
});

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let cru = "";
    req.on("data", (p) => {
      cru += p;
    });
    req.on("end", () => {
      const caminho = new URL(req.url ?? "/", "http://local").pathname;
      recebidas.push({ caminho, corpo: cru ? JSON.parse(cru) : {} });
      const resposta = responder(caminho);
      res.writeHead(resposta.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(resposta.json));
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  const porta = (servidor.address() as { port: number }).port;
  process.env.NFSE_BASE_URL = `http://127.0.0.1:${porta}`;
});

afterAll(async () => {
  await new Promise<void>((ok) => servidor.close(() => ok()));
  delete process.env.NFSE_BASE_URL;
});

const marca = Date.now();
let alfa = "";
let beta = "";
let clienteAlfa = "";
let clienteSemDocumento = "";

d("emissao por escritorio", () => {
  beforeAll(async () => {
    process.env.SEGREDO_CHAVE ??= Buffer.alloc(32, 4).toString("base64");

    const a = await prismaPlataforma().escritorio.create({
      data: { slug: `nf-a-${marca}`, nome: "Alfa Notas" },
    });
    const b = await prismaPlataforma().escritorio.create({
      data: { slug: `nf-b-${marca}`, nome: "Beta Notas" },
    });
    alfa = a.id;
    beta = b.id;

    for (const id of [alfa, beta]) {
      await comEscritorio(id, (db) =>
        db.moduloContratado.create({
          data: semEscritorio({ modulo: "NFSE", ativo: true }),
        }),
      );
    }

    await comEscritorio(alfa, async (db) => {
      await db.fiscal.create({
        data: semEscritorio({
          razaoSocial: "Alfa Advocacia",
          cnpj: "12345678000199",
          inscricaoMunicipal: "123456",
          codigoMunicipio: "2927408",
          regime: "SIMPLES",
          codigoTributacao: "17.14",
          aliquotaMilesimos: 2000,
        }),
      });
      const cliente = await db.cliente.create({
        data: semEscritorio({
          nome: "Cliente com CPF",
          documento: "529.982.247-25",
        }),
      });
      const sem = await db.cliente.create({
        data: semEscritorio({ nome: "Cliente sem CPF" }),
      });
      clienteAlfa = cliente.id;
      clienteSemDocumento = sem.id;
    });

    await salvarIntegracao(
      alfa,
      "NFSE_CERT",
      { arquivo: certificadoDeTeste(), senha: "senha-do-teste" },
      "OK",
    );
  });

  afterAll(async () => {
    for (const id of [alfa, beta]) {
      if (id)
        await prismaPlataforma()
          .escritorio.delete({ where: { id } })
          .catch(() => {});
    }
    await prismaPlataforma().$disconnect();
  });

  beforeEach(() => {
    recebidas = [];
    responder = () => ({
      status: 200,
      json: {
        chaveAcesso: `2926${Date.now()}`,
        numeroNfse: "1",
        linkPdf: "https://prefeitura.exemplo/1.pdf",
      },
    });
  });

  const pedido = {
    clienteId: "",
    descricao: "Honorarios contratuais de setembro",
    valorCentavos: 150_000,
  };

  it("emite, guarda o XML assinado e mede o consumo", async () => {
    const antes = (await consumoDoMes(alfa)).find(
      (l) => l.metrica === "NFSE_EMITIDA",
    );
    const nota = await emitirNota(alfa, { ...pedido, clienteId: clienteAlfa });

    expect(nota.status).toBe("EMITIDA");
    expect(nota.chaveAcesso).toBeTruthy();

    const linha = await comEscritorio(alfa, (db) =>
      db.notaFiscal.findUnique({ where: { id: nota.id } }),
    );
    expect(linha?.xmlEnviado).toContain("<Signature");
    expect(linha?.linkPdf).toContain("prefeitura.exemplo");

    // O que chegou no ambiente nacional e o DPS comprimido, e descomprime.
    const enviado = desempacotar(recebidas[0].corpo.dpsXmlGZipB64);
    expect(enviado).toContain("<vServ>1500.00</vServ>");

    const depois = (await consumoDoMes(alfa)).find(
      (l) => l.metrica === "NFSE_EMITIDA",
    );
    expect(depois?.quantidade).toBe((antes?.quantidade ?? 0) + 1);
  });

  it("a numeracao anda de um em um, sem repetir", async () => {
    const primeira = await emitirNota(alfa, {
      ...pedido,
      clienteId: clienteAlfa,
    });
    const segunda = await emitirNota(alfa, {
      ...pedido,
      clienteId: clienteAlfa,
    });

    const linhas = await comEscritorio(alfa, (db) =>
      db.notaFiscal.findMany({
        where: { id: { in: [primeira.id, segunda.id] } },
        orderBy: { numero: "asc" },
      }),
    );
    expect(linhas[1].numero).toBe(linhas[0].numero + 1);
  });

  it("recusa da prefeitura fica gravada com o motivo, e o numero nao volta", async () => {
    responder = () => ({
      status: 400,
      json: {
        erros: [
          { codigo: "E0123", descricao: "Inscricao municipal invalida." },
        ],
      },
    });

    const fiscalAntes = await comEscritorio(alfa, (db) =>
      db.fiscal.findFirst(),
    );
    await expect(
      emitirNota(alfa, { ...pedido, clienteId: clienteAlfa }),
    ).rejects.toBeInstanceOf(FalhaNaNfse);
    const fiscalDepois = await comEscritorio(alfa, (db) =>
      db.fiscal.findFirst(),
    );

    const recusada = await comEscritorio(alfa, (db) =>
      db.notaFiscal.findFirst({
        where: { status: "RECUSADA" },
        orderBy: { criadoEm: "desc" },
      }),
    );
    expect(recusada?.erro).toContain("Inscricao municipal invalida");
    // Numero gasto e o que o contador espera; numero repetido, nao.
    expect(fiscalDepois!.proximoNumero).toBe(fiscalAntes!.proximoNumero + 1);
  });

  it("cliente sem CPF/CNPJ nao vira nota", async () => {
    await expect(
      emitirNota(alfa, { ...pedido, clienteId: clienteSemDocumento }),
    ).rejects.toBeInstanceOf(NotaInvalida);
    expect(recebidas).toHaveLength(0);
  });

  it("valor zerado e descricao vazia nem chegam ao cadastro fiscal", async () => {
    await expect(
      emitirNota(alfa, { ...pedido, clienteId: clienteAlfa, valorCentavos: 0 }),
    ).rejects.toBeInstanceOf(NotaInvalida);
    await expect(
      emitirNota(alfa, { ...pedido, clienteId: clienteAlfa, descricao: "   " }),
    ).rejects.toBeInstanceOf(NotaInvalida);
    expect(recebidas).toHaveLength(0);
  });

  it("sem cadastro fiscal e sem certificado, cada falta tem sua mensagem", async () => {
    const cliente = await comEscritorio(beta, (db) =>
      db.cliente.create({
        data: semEscritorio({
          nome: "Cliente do Beta",
          documento: "52998224725",
        }),
      }),
    );

    await expect(
      emitirNota(beta, { ...pedido, clienteId: cliente.id }),
    ).rejects.toBeInstanceOf(SemCadastroFiscal);

    await comEscritorio(beta, (db) =>
      db.fiscal.create({
        data: semEscritorio({
          razaoSocial: "Beta",
          cnpj: "11222333000181",
          inscricaoMunicipal: "9",
          codigoMunicipio: "2927408",
          regime: "NORMAL",
          codigoTributacao: "17.14",
          aliquotaMilesimos: 5000,
        }),
      }),
    );

    await expect(
      emitirNota(beta, { ...pedido, clienteId: cliente.id }),
    ).rejects.toBeInstanceOf(SemCertificado);
    expect(recebidas).toHaveLength(0);
  });

  it("cancelamento so depois que a prefeitura aceita", async () => {
    const nota = await emitirNota(alfa, { ...pedido, clienteId: clienteAlfa });

    responder = (caminho) =>
      caminho.includes("/eventos")
        ? {
            status: 400,
            json: { erros: [{ descricao: "Fora do prazo de cancelamento." }] },
          }
        : { status: 200, json: { chaveAcesso: "x" } };

    await expect(cancelarNota(alfa, nota.id)).rejects.toThrow(/Fora do prazo/);

    // A nota continua valendo: marcar antes de a prefeitura aceitar daria ao
    // escritorio a impressao de que cancelou.
    const depoisDaRecusa = await comEscritorio(alfa, (db) =>
      db.notaFiscal.findUnique({ where: { id: nota.id } }),
    );
    expect(depoisDaRecusa?.status).toBe("EMITIDA");

    responder = () => ({ status: 200, json: { ok: true } });
    await cancelarNota(alfa, nota.id);

    const cancelada = await comEscritorio(alfa, (db) =>
      db.notaFiscal.findUnique({ where: { id: nota.id } }),
    );
    expect(cancelada?.status).toBe("CANCELADA");
    expect(cancelada?.canceladaEm).not.toBeNull();

    // O evento que subiu tambem vai assinado.
    const evento = recebidas.find((r) => r.caminho.includes("/eventos"));
    expect(
      desempacotar(evento!.corpo.pedidoRegistroEventoXmlGZipB64),
    ).toContain("<Signature");
  });

  it("nota recusada nao se cancela", async () => {
    responder = () => ({
      status: 400,
      json: { erros: [{ descricao: "qualquer erro" }] },
    });
    await emitirNota(alfa, { ...pedido, clienteId: clienteAlfa }).catch(
      () => {},
    );

    const recusada = await comEscritorio(alfa, (db) =>
      db.notaFiscal.findFirst({
        where: { status: "RECUSADA" },
        orderBy: { criadoEm: "desc" },
      }),
    );
    await expect(cancelarNota(alfa, recusada!.id)).rejects.toBeInstanceOf(
      CancelamentoInvalido,
    );
  });

  it("nota de um escritorio nao se ve nem se cancela do outro", async () => {
    const nota = await emitirNota(alfa, { ...pedido, clienteId: clienteAlfa });

    const vistaPeloBeta = await comEscritorio(beta, (db) =>
      db.notaFiscal.findUnique({ where: { id: nota.id } }),
    );
    expect(vistaPeloBeta).toBeNull();
    await expect(cancelarNota(beta, nota.id)).rejects.toBeInstanceOf(
      NotaInvalida,
    );
  });
});
