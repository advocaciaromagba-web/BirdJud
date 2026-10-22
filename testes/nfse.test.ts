// Modulo NFSE — o metodo do sistema da Advocacia Roma: a equipe PREPARA, o
// titular do e-CNPJ ASSINA com a senha digitada na hora.
//
// Provado aqui: o leiaute da DPS nas regras do Anexo I (Simples, nao optante,
// ISS fixo, IBS/CBS), a assinatura (assina e confere de verdade, com
// certificado gerado na hora), o fluxo preparar -> assinar -> recusar ->
// assinar de novo, o reenvio sem inscricao municipal (E0120), a recuperacao
// quando a conexao cai, o cancelamento, so o titular usando o certificado e o
// isolamento entre escritorios. A Sefin e servida localmente.
//
// Contra a Sefin de verdade: `NFSE_SENHA=... npm run conferir-nfse`.
import { createServer, type Server } from "node:http";
import { gzipSync } from "node:zlib";
import forge from "node-forge";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { salvarIntegracao } from "../src/lib/integracao";
import { carregarDeBase64 } from "../src/lib/nfse/certificado";
import { assinarXml, conferirAssinatura } from "../src/lib/nfse/assinar";
import { montarDps, montarIdDps, montarPedidoCancelamento, type EmissorDps, type DadosDps } from "../src/lib/nfse/dps";
import { compactar, descompactar } from "../src/lib/nfse/api";
import { regimeVigente, pendenciasDoRegime, ibsCbsVigente } from "../src/lib/nfse/regime";
import { gerarDanfse } from "../src/lib/nfse/danfse";
import {
  NotaInvalida,
  SoOTitular,
  assinarNotas,
  cancelarNota,
  abrirCertificadoDoEscritorio,
  descartarNota,
  pendenciasDoEmissor,
  prepararNota,
  verificarSituacao,
} from "../src/lib/nfse";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Certificado de mentira, gerado na hora (e-CNPJ, cifra antiga 3DES como as AC entregam)
// ---------------------------------------------------------------------------

const SENHA = "senha-do-teste";
const CNPJ = "12345678000199";

function certificadoDeTeste(cn = `ESCRITORIO TESTE:${CNPJ}`): string {
  const par = forge.pki.rsa.generateKeyPair(2048);
  const certificado = forge.pki.createCertificate();
  certificado.publicKey = par.publicKey;
  certificado.serialNumber = "01";
  certificado.validity.notBefore = new Date(Date.now() - 86400000);
  certificado.validity.notAfter = new Date(Date.now() + 365 * 86400000);
  const nome = [{ name: "commonName", value: cn }];
  certificado.setSubject(nome);
  certificado.setIssuer(nome);
  certificado.sign(par.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(par.privateKey, [certificado], SENHA, { algorithm: "3des" });
  return forge.util.encode64(forge.asn1.toDer(p12).getBytes());
}

const PFX = certificadoDeTeste();

const EMISSOR: EmissorDps = {
  cnpj: "12.345.678/0001-99",
  inscricaoMunicipal: "123456",
  codigoMunicipio: "3518602",
  telefone: "(16) 3251-0000",
  email: "contato@banca.adv.br",
  opSimpNac: 3,
  regApTribSN: 1,
  regEspTrib: 0,
  pTotTribSN: 6,
  codigoTributacaoNacional: "171401",
  codigoNbs: "113012000",
};

const DADOS: DadosDps = {
  ambiente: "HOMOLOGACAO",
  serie: "1",
  numero: 42,
  dataEmissao: new Date("2026-09-19T14:30:00Z"),
  dataCompetencia: "2026-09-19",
  tomador: { documento: "529.982.247-25", nome: "Cliente & Cia", email: "c@teste.br", telefone: null, endereco: null },
  descricao: "Honorarios\nadvocaticios",
  valorCentavos: 150_000,
  informacoesComplementares: null,
};

describe("leiaute da DPS (Anexo I)", () => {
  it("Simples ME/EPP: regApTribSN e pTotTribSN, sem alíquota", () => {
    const { xml, idDps } = montarDps(EMISSOR, DADOS);
    expect(idDps).toBe(`DPS35186022${CNPJ}00001${"42".padStart(15, "0")}`);
    expect(idDps).toHaveLength(45);
    expect(xml).toContain('versao="1.01"');
    expect(xml).toContain("<opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib>");
    expect(xml).toContain("<totTrib><pTotTribSN>6.00</pTotTribSN></totTrib>");
    expect(xml).not.toContain("pAliq");
    expect(xml).toContain("<vServ>1500.00</vServ>");
    expect(xml).toContain("<serie>00001</serie>");
    expect(xml).toContain("<dhEmi>2026-09-19T11:30:00-03:00</dhEmi>");
    expect(xml).toContain("<cTribNac>171401</cTribNac>");
    // Quebra de linha solta nao passa; & e escapado.
    expect(xml).toContain("<xDescServ>Honorarios advocaticios</xDescServ>");
    // Esquema novo da Sefin: a finalidade fica em infDPS, entre tpEmit e cLocEmi.
    expect(xml).toContain("<tpEmit>1</tpEmit><finNFSe>0</finNFSe><cLocEmi>");
  });

  it("texto fora do Latin-1 (travessão, aspas curvas) vira o equivalente simples: o XSD recusa com E1235", () => {
    const { xml } = montarDps(EMISSOR, { ...DADOS, descricao: "Licença de uso — assinatura 10/2026 “anual” …" });
    expect(xml).toContain("<xDescServ>Licença de uso - assinatura 10/2026 &quot;anual&quot; ...</xDescServ>");
    expect(xml).not.toMatch(/[\u2014\u201C\u201D\u2026]/);
    expect(xml).toContain("<xNome>Cliente &amp; Cia</xNome>");
    expect(xml).toContain("<CPF>52998224725</CPF>");
    expect(xml).not.toContain("<IBSCBS>");
  });

  it("não optante informa tributos por esfera, nunca pTotTribSN nem regApTribSN", () => {
    const { xml } = montarDps(
      { ...EMISSOR, opSimpNac: 1, regApTribSN: null, pTotTribSN: null, pTotTribFed: 14.53, pTotTribEst: 0, pTotTribMun: 2 },
      DADOS,
    );
    expect(xml).not.toContain("regApTribSN");
    expect(xml).not.toContain("pTotTribSN");
    expect(xml).toContain("<pTotTrib><pTotTribFed>14.53</pTotTribFed><pTotTribEst>0.00</pTotTribEst><pTotTribMun>2.00</pTotTribMun></pTotTrib>");
  });

  it("ISS fixo de sociedade de profissionais sai com regime especial 6", () => {
    const { xml } = montarDps({ ...EMISSOR, regApTribSN: 2, regEspTrib: 6 }, DADOS);
    expect(xml).toContain("<regApTribSN>2</regApTribSN><regEspTrib>6</regEspTrib>");
  });

  it("sem inscrição municipal, a tag IM não vai", () => {
    expect(montarDps({ ...EMISSOR, inscricaoMunicipal: null }, DADOS).xml).not.toContain("<IM>");
  });

  it("tomador empresa com endereço vai com município e CEP", () => {
    const { xml } = montarDps(EMISSOR, {
      ...DADOS,
      tomador: {
        documento: "11.222.333/0001-81",
        nome: "Empresa",
        email: null,
        telefone: null,
        endereco: { codigoMunicipio: "3550308", cep: "01310-100", logradouro: "Av. Paulista", numero: "1000", complemento: null, bairro: "Bela Vista" },
      },
    });
    expect(xml).toContain("<CNPJ>11222333000181</CNPJ>");
    expect(xml).toContain("<end><endNac><cMun>3550308</cMun><CEP>01310100</CEP></endNac><xLgr>Av. Paulista</xLgr><nro>1000</nro><xBairro>Bela Vista</xBairro></end>");
  });

  it("IBS/CBS só entra quando vigente na competência", () => {
    const fiscal = {
      opSimpNac: 3, regApTribSN: 1, regEspTrib: 0, pTotTribSN: null, pTotTribFed: null, pTotTribEst: null, pTotTribMun: null,
      regApIBSCBSSN: null, cAtvSN: null, regimeFuturo: null, regimeFuturoDesde: null,
      ibsCbsDesde: new Date("2027-01-01T00:00:00-03:00"), cIndOp: "100301", cstIbsCbs: "000", cClassTribIbsCbs: "000001",
    };
    expect(ibsCbsVigente(fiscal, new Date("2026-12-31T12:00:00-03:00"))).toBeNull();
    const ibs = ibsCbsVigente(fiscal, new Date("2027-01-05T12:00:00-03:00"));
    expect(ibs).toEqual({ cIndOp: "100301", cst: "000", cClassTrib: "000001" });
    const { xml } = montarDps({ ...EMISSOR, ibsCbs: ibs }, DADOS);
    expect(xml).toContain("<IBSCBS><cIndOp>100301</cIndOp><indDest>0</indDest>");
  });

  it("o regime vale pela COMPETENCIA: mudança marcada vira sozinha", () => {
    const fiscal = {
      opSimpNac: 1, regApTribSN: null, regEspTrib: 6, pTotTribSN: null, pTotTribFed: 14, pTotTribEst: 0, pTotTribMun: 2,
      regApIBSCBSSN: null, cAtvSN: null, ibsCbsDesde: null, cIndOp: null, cstIbsCbs: null, cClassTribIbsCbs: null,
      regimeFuturoDesde: new Date("2027-01-01T00:00:00-03:00"),
      regimeFuturo: { opSimpNac: 3, regApTribSN: 1, regEspTrib: 0, pTotTribSN: "6" },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = fiscal as any;
    expect(regimeVigente(f, new Date("2026-12-20T12:00:00-03:00")).opSimpNac).toBe(1);
    const depois = regimeVigente(f, new Date("2027-01-10T12:00:00-03:00"));
    expect(depois).toMatchObject({ opSimpNac: 3, regEspTrib: 0, pTotTribSN: 6 });
    expect(pendenciasDoRegime({ ...depois, pTotTribSN: null }, "")).toHaveLength(1);
  });

  it("o pedido de cancelamento leva a chave, o motivo e a justificativa", () => {
    const chave = "3".repeat(50);
    const xml = montarPedidoCancelamento({
      ambiente: "HOMOLOGACAO", cnpjAutor: CNPJ, chave, motivo: 1, descricaoMotivo: "Valor digitado errado", dataEvento: new Date(),
    });
    expect(xml).toContain(`<infPedReg Id="PRE${chave}101101">`);
    expect(xml).toContain("<cMotivo>1</cMotivo><xMotivo>Valor digitado errado</xMotivo>");
  });

  it("o XML viaja comprimido e volta igual", () => {
    const { xml } = montarDps(EMISSOR, DADOS);
    expect(descompactar(compactar(xml))).toBe(xml);
  });

  it("o Id tem o formato documentado", () => {
    expect(montarIdDps({ cnpj: CNPJ, codigoMunicipio: "3518602" }, "1", 7)).toMatch(/^DPS3518602212345678000199000010{14}7$/);
  });
});

describe("certificado e assinatura (provado de verdade)", () => {
  it("abre o e-CNPJ, le o CNPJ e reempacota em AES para o TLS", () => {
    const cert = carregarDeBase64(PFX, SENHA);
    expect(cert.cnpj).toBe(CNPJ);
    expect(cert.cpf).toBeNull();
    expect(cert.titular).toBe("ESCRITORIO TESTE");
    expect(cert.pfxTls.length).toBeGreaterThan(100);
  });

  it("senha errada tem mensagem própria", () => {
    expect(() => carregarDeBase64(PFX, "errada")).toThrow(/[Ss]enha/);
  });

  it("assina depois do infDPS, sem prefixo, e a assinatura confere", () => {
    const cert = carregarDeBase64(PFX, SENHA);
    const { xml } = montarDps(EMISSOR, DADOS);
    const assinado = assinarXml(xml, "infDPS", cert);
    expect(assinado).toMatch(/<\/infDPS><Signature xmlns="http:\/\/www.w3.org\/2000\/09\/xmldsig#">/);
    expect(assinado).toContain("rsa-sha1");
    expect(conferirAssinatura(assinado, cert.certPem)).toBe(true);
    expect(conferirAssinatura(assinado.replace("1500.00", "15.00"), cert.certPem)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Sefin servida localmente
// ---------------------------------------------------------------------------

let servidor: Server;
let recebidas: { metodo: string; caminho: string; corpo: Record<string, string> }[] = [];
let responder: (metodo: string, caminho: string, corpo: Record<string, string>) => { status: number; json?: unknown; derrubar?: boolean };

function nfseXml(numero: string): string {
  return `<?xml version="1.0"?><NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS${"3".repeat(50)}"><nNFSe>${numero}</nNFSe><DPS><infDPS><tpAmb>2</tpAmb></infDPS></DPS></infNFSe></NFSe>`;
}

const aceita = (numero = "7") => ({
  status: 201,
  json: {
    chaveAcesso: `${Date.now()}`.padStart(50, "3"),
    idDps: "x",
    nfseXmlGZipB64: gzipSync(Buffer.from(nfseXml(numero))).toString("base64"),
  },
});

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let cru = "";
    req.on("data", (p) => (cru += p));
    req.on("end", () => {
      const caminho = new URL(req.url ?? "/", "http://local").pathname;
      const corpo = cru ? JSON.parse(cru) : {};
      recebidas.push({ metodo: req.method ?? "", caminho, corpo });
      const r = responder(req.method ?? "", caminho, corpo);
      if (r.derrubar) return req.socket.destroy();
      res.writeHead(r.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(r.json ?? {}));
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  process.env.NFSE_BASE_URL = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise<void>((ok) => servidor.close(() => ok()));
  delete process.env.NFSE_BASE_URL;
});

const marca = Date.now();
let alfa = "";
let beta = "";
let titular = "";
let outraPessoa = "";
let clienteCpf = "";
let clienteEmpresaSemEndereco = "";

d("preparar e assinar", () => {
  const TITULAR = () => ({ usuarioId: titular, papel: "ADMIN" });

  beforeAll(async () => {
    process.env.SEGREDO_CHAVE ??= Buffer.alloc(32, 4).toString("base64");
    alfa = (await prismaPlataforma().escritorio.create({ data: { slug: `nf-a-${marca}`, nome: "Alfa Notas" } })).id;
    beta = (await prismaPlataforma().escritorio.create({ data: { slug: `nf-b-${marca}`, nome: "Beta Notas" } })).id;
    for (const id of [alfa, beta]) {
      await comEscritorio(id, (db) => db.moduloContratado.create({ data: semEscritorio({ modulo: "NFSE", ativo: true }) }));
    }
    await comEscritorio(alfa, async (db) => {
      await db.fiscal.create({
        data: semEscritorio({
          razaoSocial: "Alfa Advocacia",
          cnpj: CNPJ,
          inscricaoMunicipal: "123456",
          codigoMunicipio: "3518602",
          opSimpNac: 3,
          pTotTribSN: 6,
        }),
      });
      titular = (await db.usuario.create({ data: semEscritorio({ nome: "Dra. Titular", email: `t-${marca}@nf.test`, senhaHash: "x", papel: "ADMIN" }) })).id;
      outraPessoa = (await db.usuario.create({ data: semEscritorio({ nome: "Secretaria", email: `s-${marca}@nf.test`, senhaHash: "x", papel: "ADMIN" }) })).id;
      clienteCpf = (await db.cliente.create({ data: semEscritorio({ nome: "Cliente com CPF", documento: "529.982.247-25" }) })).id;
      clienteEmpresaSemEndereco = (await db.cliente.create({ data: semEscritorio({ nome: "Empresa", documento: "11.222.333/0001-81" }) })).id;
    });
    await salvarIntegracao(alfa, "NFSE_CERT", {
      arquivo: PFX,
      titular: "ESCRITORIO TESTE",
      cnpj: CNPJ,
      validoAte: new Date(Date.now() + 300 * 86400000).toISOString(),
      titularId: titular,
      titularNome: "Dra. Titular",
    }, "OK");
  });

  afterAll(async () => {
    for (const id of [alfa, beta]) {
      if (id) await prismaPlataforma().escritorio.delete({ where: { id } }).catch(() => {});
    }
    await prismaPlataforma().$disconnect();
  });

  beforeEach(() => {
    recebidas = [];
    responder = () => aceita();
  });

  const preparar = (extra: Partial<Parameters<typeof prepararNota>[1]> = {}) =>
    prepararNota(alfa, { clienteId: clienteCpf, valorCentavos: 150_000, descricao: "Honorários de setembro", criadoPorId: outraPessoa, ...extra });

  it("o emissor pronto não tem pendência", async () => {
    const fiscal = await comEscritorio(alfa, (db) => db.fiscal.findFirst());
    expect(pendenciasDoEmissor(fiscal, { arquivo: PFX, cnpj: CNPJ })).toEqual([]);
    expect(pendenciasDoEmissor(fiscal, { arquivo: PFX, cnpj: "99999999000199" })[0]).toMatch(/outro CNPJ/);
    expect(pendenciasDoEmissor(fiscal, null)[0]).toMatch(/certificado/);
  });

  it("preparar não gasta número nem fala com a Sefin", async () => {
    const r = await preparar();
    expect(r.nota.status).toBe("AGUARDANDO_ASSINATURA");
    expect(r.nota.numero).toBeNull();
    expect(r.titularId).toBe(titular);
    expect(recebidas).toHaveLength(0);
  });

  it("competência futura e empresa sem endereço são recusadas já no preparo", async () => {
    await expect(preparar({ dataCompetencia: "2099-01-01" })).rejects.toThrow(/futura/);
    await expect(preparar({ clienteId: clienteEmpresaSemEndereco })).rejects.toThrow(/E0235/);
  });

  it("só o titular abre o certificado, e com a senha certa", async () => {
    await expect(abrirCertificadoDoEscritorio(alfa, { usuarioId: outraPessoa, papel: "ADMIN" }, SENHA)).rejects.toBeInstanceOf(SoOTitular);
    await expect(abrirCertificadoDoEscritorio(alfa, TITULAR(), "errada")).rejects.toThrow(/[Ss]enha/);
  });

  it("assinar numera, assina, transmite e registra a emitida", async () => {
    const { nota } = await preparar();
    const [r] = await assinarNotas(alfa, TITULAR(), [nota.id], SENHA);
    expect(r.status).toBe("EMITIDA");
    expect(r.numeroNfse).toBe("7");
    const enviada = recebidas.find((x) => x.caminho === "/nfse")!;
    const dps = descompactar(enviada.corpo.dpsXmlGZipB64);
    expect(dps).toContain("<Signature");
    expect(dps).toContain("<IM>123456</IM>");
    const gravada = await comEscritorio(alfa, (db) => db.notaFiscal.findFirstOrThrow({ where: { id: nota.id } }));
    expect(gravada.status).toBe("EMITIDA");
    expect(gravada.numero).not.toBeNull();
    expect(gravada.assinadaPorId).toBe(titular);
    expect(gravada.xmlRetorno).toContain("<nNFSe>7</nNFSe>");
  });

  it("E0120: reenvia sozinha sem a inscrição municipal, com número novo", async () => {
    let chamadas = 0;
    responder = () => {
      chamadas += 1;
      return chamadas === 1
        ? { status: 400, json: { erros: [{ codigo: "E0120", descricao: "IM não cadastrada no CNC" }] } }
        : aceita("8");
    };
    const { nota } = await preparar();
    const [r] = await assinarNotas(alfa, TITULAR(), [nota.id], SENHA);
    expect(r.status).toBe("EMITIDA");
    const dpss = recebidas.filter((x) => x.caminho === "/nfse").map((x) => descompactar(x.corpo.dpsXmlGZipB64));
    expect(dpss[0]).toContain("<IM>");
    expect(dpss[1]).not.toContain("<IM>");
    expect(dpss[0].match(/<nDPS>(\d+)/)![1]).not.toBe(dpss[1].match(/<nDPS>(\d+)/)![1]);
  });

  it("recusada fica com os erros e pode ser assinada de novo", async () => {
    responder = () => ({ status: 400, json: { erros: [{ codigo: "E0160", descricao: "Regime não confere" }] } });
    const { nota } = await preparar();
    const [r] = await assinarNotas(alfa, TITULAR(), [nota.id], SENHA);
    expect(r.status).toBe("REJEITADA");
    expect(r.erro).toContain("E0160");

    responder = () => aceita("9");
    const [denovo] = await assinarNotas(alfa, TITULAR(), [nota.id], SENHA);
    expect(denovo.status).toBe("EMITIDA");
  });

  it("conexão que cai fica PROCESSANDO, e Verificar recupera pela DPS", async () => {
    responder = (metodo, caminho) => (caminho === "/nfse" ? { status: 0, derrubar: true } : { status: 404 });
    const { nota } = await preparar();
    const [r] = await assinarNotas(alfa, TITULAR(), [nota.id], SENHA);
    expect(r.status).toBe("PROCESSANDO");

    const chave = "4".repeat(50);
    responder = (metodo, caminho) => {
      if (caminho.startsWith("/dps/")) return { status: 200, json: { chaveAcesso: chave } };
      if (caminho === `/nfse/${chave}`) return { status: 200, json: { nfseXmlGZipB64: gzipSync(Buffer.from(nfseXml("10"))).toString("base64") } };
      return { status: 404 };
    };
    const cert = await abrirCertificadoDoEscritorio(alfa, TITULAR(), SENHA);
    const verificada = await verificarSituacao(alfa, nota.id, cert);
    expect(verificada.status).toBe("EMITIDA");
    expect(verificada.chaveAcesso).toBe(chave);
  });

  it("cancelar exige justificativa e registra o evento", async () => {
    const { nota } = await preparar();
    await assinarNotas(alfa, TITULAR(), [nota.id], SENHA);
    const cert = await abrirCertificadoDoEscritorio(alfa, TITULAR(), SENHA);
    await expect(cancelarNota(alfa, nota.id, cert, 1, "curto")).rejects.toThrow(/15 caracteres/);

    responder = () => ({ status: 201, json: { eventoXmlGZipB64: compactar("<evento/>") } });
    const cancelada = await cancelarNota(alfa, nota.id, cert, 1, "Valor digitado errado na nota");
    expect(cancelada.status).toBe("CANCELADA");
    expect(cancelada.eventoXml).toBe("<evento/>");
  });

  it("descartar só vale para nota que não foi emitida", async () => {
    const { nota } = await preparar();
    await descartarNota(alfa, nota.id);
    const emitida = (await preparar()).nota;
    await assinarNotas(alfa, TITULAR(), [emitida.id], SENHA);
    await expect(descartarNota(alfa, emitida.id)).rejects.toBeInstanceOf(NotaInvalida);
  });

  it("o PDF da nota (DANFSe) sai do XML autorizado, com marca de cancelada", async () => {
    const pdf = await gerarDanfse(nfseXml("11"));
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const cancelada = await gerarDanfse(nfseXml("11"), { cancelada: true });
    expect(cancelada.length).toBeGreaterThan(pdf.length - 2000);
  });

  it("nota de um escritório não se ve do outro", async () => {
    const { nota } = await preparar();
    const doOutro = await comEscritorio(beta, (db) => db.notaFiscal.findFirst({ where: { id: nota.id } }));
    expect(doOutro).toBeNull();
    await expect(descartarNota(beta, nota.id)).rejects.toBeInstanceOf(NotaInvalida);
  });
});
