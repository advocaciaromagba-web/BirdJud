// Nota fiscal da mensalidade: a Blackbird emitindo para o escritorio.
//
// O que se prova: com a fatura paga sai a nota (DPS assinada com o e-CNPJ da
// Blackbird, tomador = o escritorio com CNPJ e endereco); emitir de novo nao
// gasta outro numero; recusa da Sefin pode ser corrigida e reemitida no mesmo
// registro; cancelar solta a fatura para outra nota; o link do e-mail so abre
// com a assinatura; e o pagamento poe a nota na fila quando a emissao
// automatica esta ligada.
import { createServer, type Server } from "node:http";
import { gzipSync } from "node:zlib";
import forge from "node-forge";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prismaPlataforma } from "../src/lib/prisma";
import { descompactar } from "../src/lib/nfse/api";

vi.mock("@/lib/cep", async (original) => ({
  ...(await original<typeof import("@/lib/cep")>()),
  buscarCep: async () => ({ ibge: "3550308", cep: "01310100", logradouro: "Av. Paulista", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP" }),
}));

const {
  CertificadoRecusado,
  NotaInvalida,
  cancelarNotaDaPlataforma,
  certificadoDaPlataforma,
  emitirNotaDaFatura,
  guardarCertificadoDaPlataforma,
  removerCertificadoDaPlataforma,
  tokenConfere,
  tokenDaNota,
} = await import("../src/lib/nota-da-plataforma");
const { registrarPagamento } = await import("../src/lib/cobranca");

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

const SENHA = "senha-da-blackbird";
const CNPJ_BLACKBIRD = "11222333000181";

function certificado(cn: string): string {
  const par = forge.pki.rsa.generateKeyPair(2048);
  const c = forge.pki.createCertificate();
  c.publicKey = par.publicKey;
  c.serialNumber = "01";
  c.validity.notBefore = new Date(Date.now() - 86400000);
  c.validity.notAfter = new Date(Date.now() + 365 * 86400000);
  c.setSubject([{ name: "commonName", value: cn }]);
  c.setIssuer([{ name: "commonName", value: cn }]);
  c.sign(par.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(par.privateKey, [c], SENHA, { algorithm: "3des" });
  return forge.util.encode64(forge.asn1.toDer(p12).getBytes());
}

type Pedido = { metodo: string; caminho: string; corpo: Record<string, string> };
const pedidos: Pedido[] = [];
let recusar = false;
let servidor: Server;
let n = 0;

const nfseXml = (numero: string) =>
  `<?xml version="1.0"?><NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS${"4".repeat(50)}"><nNFSe>${numero}</nNFSe><DPS><infDPS><tpAmb>2</tpAmb></infDPS></DPS></infNFSe></NFSe>`;

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let cru = "";
    req.on("data", (p) => (cru += p));
    req.on("end", () => {
      const caminho = new URL(req.url ?? "/", "http://local").pathname;
      pedidos.push({ metodo: req.method ?? "", caminho, corpo: cru ? JSON.parse(cru) : {} });
      const json = (status: number, corpo: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(corpo));
      };
      if (req.method === "POST" && caminho === "/nfse") {
        if (recusar) return json(400, { erros: [{ Codigo: "E0312", Descricao: "Código de tributação inválido" }] });
        n += 1;
        return json(201, {
          chaveAcesso: `${Date.now()}${n}`.padStart(50, "4"),
          idDps: "x",
          nfseXmlGZipB64: gzipSync(Buffer.from(nfseXml(String(100 + n)))).toString("base64"),
        });
      }
      if (req.method === "POST" && caminho.endsWith("/eventos")) {
        return json(201, { eventoXmlGZipB64: gzipSync(Buffer.from("<evento/>")).toString("base64") });
      }
      json(404, {});
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  process.env.NFSE_BASE_URL = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  process.env.NFSE_PLATAFORMA_PFX = certificado(`BLACKBIRD TECNOLOGIA LTDA:${CNPJ_BLACKBIRD}`);
  process.env.NFSE_PLATAFORMA_SENHA = SENHA;
  process.env.SEGREDO_CHAVE ??= Buffer.alloc(32, 7).toString("base64");
});

afterAll(async () => {
  await new Promise<void>((ok) => servidor.close(() => ok()));
  delete process.env.NFSE_BASE_URL;
  delete process.env.NFSE_PLATAFORMA_PFX;
  delete process.env.NFSE_PLATAFORMA_SENHA;
});

describe("link do e-mail", () => {
  it("só abre com a assinatura da própria nota", () => {
    process.env.SEGREDO_CHAVE ??= Buffer.alloc(32, 7).toString("base64");
    const t = tokenDaNota("nota-1");
    expect(tokenConfere("nota-1", t)).toBe(true);
    expect(tokenConfere("nota-2", t)).toBe(false);
    expect(tokenConfere("nota-1", null)).toBe(false);
    expect(tokenConfere("nota-1", "x".repeat(32))).toBe(false);
  });
});

d("nota da mensalidade", () => {
  const marca = Date.now();
  let esc = "";
  let fatura = "";

  beforeAll(async () => {
    await prismaPlataforma().fiscalDaPlataforma.upsert({
      where: { id: "PLATAFORMA" },
      create: {
        id: "PLATAFORMA",
        razaoSocial: "Blackbird Tecnologia Ltda",
        cnpj: CNPJ_BLACKBIRD,
        codigoMunicipio: "3518602",
        opSimpNac: 3,
        pTotTribSN: 6,
        automatica: false,
      },
      update: { automatica: false, cnpj: CNPJ_BLACKBIRD, pTotTribSN: 6 },
    });
    esc = (
      await prismaPlataforma().escritorio.create({
        data: {
          slug: `nota-plat-${marca}`,
          nome: "Banca Tomadora",
          razaoSocial: "Banca Tomadora Sociedade de Advogados",
          cnpj: "11.444.777/0001-61",
          enderecos: [{ cep: "01310100", logradouro: "Av. Paulista", numero: "1000", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP" }],
        },
      })
    ).id;
    fatura = (
      await prismaPlataforma().fatura.create({
        data: {
          escritorioId: esc,
          competencia: "2026-10",
          valorCentavos: 27_900,
          detalhe: [{ descricao: "Plano Completo", valorCentavos: 27_900 }],
          vencimento: new Date("2026-10-20T12:00:00Z"),
          status: "PAGA",
          pagoEm: new Date("2026-10-15T15:00:00Z"),
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prismaPlataforma().notaDaPlataforma.deleteMany({ where: { escritorioId: esc } });
    await prismaPlataforma().escritorio.delete({ where: { id: esc } }).catch(() => {});
    await prismaPlataforma().fiscalDaPlataforma.delete({ where: { id: "PLATAFORMA" } }).catch(() => {});
  });

  it("recusa da Sefin fica registrada, e reemitir usa o mesmo registro com número novo", async () => {
    recusar = true;
    const recusada = await emitirNotaDaFatura(fatura, "AUTOMATICA", new Date("2026-10-16T12:00:00Z"));
    expect(recusada.status).toBe("REJEITADA");
    expect(recusada.erro).toContain("E0312");
    recusar = false;

    const emitida = await emitirNotaDaFatura(fatura, "MANUAL", new Date("2026-10-16T12:00:00Z"));
    expect(emitida.id).toBe(recusada.id);
    expect(emitida.status).toBe("EMITIDA");
    expect(emitida.numero).toBe((recusada.numero ?? 0) + 1);
    expect(emitida.numeroNaPrefeitura).toMatch(/^1\d\d$/);
  });

  it("a DPS sai da Blackbird para o escritório, com o valor da fatura", async () => {
    const envio = pedidos.filter((p) => p.metodo === "POST" && p.caminho === "/nfse").at(-1)!;
    const dps = descompactar(envio.corpo.dpsXmlGZipB64);
    expect(dps).toContain(`<CNPJ>${CNPJ_BLACKBIRD}</CNPJ>`);
    expect(dps).toContain("<CNPJ>11444777000161</CNPJ>");
    expect(dps).toContain("<vServ>279.00</vServ>");
    expect(dps).toContain("<cTribNac>010501</cTribNac>");
    expect(dps).toContain("<dCompet>2026-10-15</dCompet>");
    expect(dps).toContain("<Signature");
  });

  it("emitir de novo não gasta outro número", async () => {
    const antes = pedidos.length;
    const outra = await emitirNotaDaFatura(fatura, "MANUAL");
    expect(outra.status).toBe("EMITIDA");
    expect(pedidos.length).toBe(antes);
  });

  it("cancelar pede justificativa, e solta a fatura para nova nota", async () => {
    const nota = await prismaPlataforma().notaDaPlataforma.findUniqueOrThrow({ where: { faturaId: fatura } });
    await expect(cancelarNotaDaPlataforma(nota.id, 1, "curta")).rejects.toThrow(NotaInvalida);
    const cancelada = await cancelarNotaDaPlataforma(nota.id, 1, "Valor emitido errado, será reemitida");
    expect(cancelada.status).toBe("CANCELADA");
    expect(cancelada.faturaId).toBeNull();
    expect(cancelada.faturaOriginalId).toBe(fatura);

    const nova = await emitirNotaDaFatura(fatura, "MANUAL");
    expect(nova.id).not.toBe(nota.id);
    expect(nova.status).toBe("EMITIDA");
  });

  it("sem certificado da Blackbird, recusa dizendo o que falta", async () => {
    const pfx = process.env.NFSE_PLATAFORMA_PFX;
    delete process.env.NFSE_PLATAFORMA_PFX;
    const outraFatura = await prismaPlataforma().fatura.create({
      data: { escritorioId: esc, competencia: "2026-11", valorCentavos: 27_900, vencimento: new Date("2026-11-20T12:00:00Z"), status: "PAGA" },
    });
    await expect(emitirNotaDaFatura(outraFatura.id, "MANUAL")).rejects.toThrow(/certificado e-CNPJ/);
    process.env.NFSE_PLATAFORMA_PFX = pfx;
  });

  it("certificado enviado pelo console vale antes das variáveis, e só entra se for o e-CNPJ certo", async () => {
    process.env.SEGREDO_CHAVE ??= Buffer.alloc(32, 6).toString("base64");
    const pfx = Buffer.from(certificado(`BLACKBIRD TECNOLOGIA LTDA:${CNPJ_BLACKBIRD}`), "base64");
    // Senha errada, e-CPF e outro CNPJ: recusados, nada guardado.
    await expect(guardarCertificadoDaPlataforma(pfx, "errada")).rejects.toBeInstanceOf(CertificadoRecusado);
    await expect(
      guardarCertificadoDaPlataforma(Buffer.from(certificado("FULANO:12345678901"), "base64"), SENHA),
    ).rejects.toThrow(/e-CPF/);
    await expect(
      guardarCertificadoDaPlataforma(Buffer.from(certificado("OUTRA LTDA:99888777000166"), "base64"), SENHA),
    ).rejects.toThrow(/E0718/);
    expect((await prismaPlataforma().fiscalDaPlataforma.findUniqueOrThrow({ where: { id: "PLATAFORMA" } })).certificado).toBeNull();

    const r = await guardarCertificadoDaPlataforma(pfx, SENHA);
    expect(r.titular).toBe("BLACKBIRD TECNOLOGIA LTDA");
    const f = await prismaPlataforma().fiscalDaPlataforma.findUniqueOrThrow({ where: { id: "PLATAFORMA" } });
    expect(f.certificadoTitular).toBe("BLACKBIRD TECNOLOGIA LTDA");
    // Cifrado: o base64 do arquivo nao aparece em claro no banco.
    expect(Buffer.from(f.certificado!).toString("latin1")).not.toContain(pfx.toString("base64").slice(0, 40));

    // Sem as variaveis, o certificado do banco emite.
    const pfxEnv = process.env.NFSE_PLATAFORMA_PFX;
    delete process.env.NFSE_PLATAFORMA_PFX;
    expect((await certificadoDaPlataforma())?.cnpj).toBe(CNPJ_BLACKBIRD);
    await removerCertificadoDaPlataforma();
    expect(await certificadoDaPlataforma()).toBeNull();
    process.env.NFSE_PLATAFORMA_PFX = pfxEnv;
  });

  it("pagamento poe a nota na fila só com a emissão automática ligada", async () => {
    const nova = async (competencia: string) =>
      (await prismaPlataforma().fatura.create({
        data: { escritorioId: esc, competencia, valorCentavos: 27_900, vencimento: new Date("2027-01-20T12:00:00Z") },
      })).id;
    const fila = (faturaId: string) =>
      prismaPlataforma().trabalho.count({
        where: { tipo: "EMITIR_NOTA_DA_PLATAFORMA", escritorioId: esc, dados: { path: ["faturaId"], equals: faturaId } },
      });

    const desligada = await nova("2027-01");
    await registrarPagamento(desligada, null, { agora: new Date("2027-01-10T12:00:00Z") });
    expect(await fila(desligada)).toBe(0);

    await prismaPlataforma().fiscalDaPlataforma.update({ where: { id: "PLATAFORMA" }, data: { automatica: true } });
    const ligada = await nova("2027-02");
    await registrarPagamento(ligada, null, { agora: new Date("2027-02-10T12:00:00Z") });
    expect(await fila(ligada)).toBe(1);
    await prismaPlataforma().trabalho.deleteMany({ where: { escritorioId: esc } });
  });
});
