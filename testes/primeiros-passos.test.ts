// Primeiros passos: o roteiro de configuracao do escritorio novo.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import {
  CHAVES_DOS_PASSOS,
  montarRoteiro,
  podePular,
  type Fatos,
} from "../src/lib/primeiros-passos";
import {
  dispensarDoInicio,
  PassoNaoPulavel,
  pularPasso,
  retomarPasso,
  roteiroDoEscritorio,
} from "../src/lib/primeiros-passos-do-escritorio";
import { salvarIntegracao } from "../src/lib/integracao";
import type { Modulo } from "../src/lib/catalogo";

const TODOS: Modulo[] = [
  "NUCLEO", "PUBLICACOES_DJEN", "WHATSAPP", "EMAIL", "NFSE",
  "COBRANCAS", "FINANCEIRO", "ASSINATURA", "IA", "NUVEM",
];

function novo(extra: Partial<Fatos> = {}): Fatos {
  return {
    modulos: TODOS,
    temSenhaAdmin: false,
    cnpj: false,
    telefoneAtendimento: false,
    logo: false,
    advogados: 0,
    advogadosComOab: 0,
    oabsMonitoradas: 0,
    integracoes: {},
    nuvemDisponivel: true,
    temCadastroFiscal: false,
    pessoasComWhatsapp: 0,
    modelos: 0,
    clientes: 0,
    processos: 0,
    compromissos: 0,
    pulados: {},
    ...extra,
  };
}

const chaves = (f: Fatos) => montarRoteiro(f).passos.map((p) => p.chave);

describe("roteiro: o que aparece", () => {
  it("escritorio com tudo contratado ve os catorze passos, na ordem das fases", () => {
    const r = montarRoteiro(novo());
    expect(r.passos.map((p) => p.chave)).toEqual([
      "SENHA_ADMIN", "IDENTIDADE", "EQUIPE",
      "OAB_MONITORADA", "EMAIL", "WHATSAPP", "COBRANCA", "ASSINATURA", "NUVEM", "NOTA_FISCAL", "MODELOS",
      "PRIMEIRO_CLIENTE", "PRIMEIRO_PROCESSO", "PRIMEIRO_COMPROMISSO",
    ]);
    expect(r.passos.map((p) => p.fase)).toEqual([
      "ESCRITORIO", "ESCRITORIO", "ESCRITORIO",
      "CONEXOES", "CONEXOES", "CONEXOES", "CONEXOES", "CONEXOES", "CONEXOES", "CONEXOES", "CONEXOES",
      "USO", "USO", "USO",
    ]);
    expect(r.proximo?.chave).toBe("SENHA_ADMIN");
    expect(r.feitos).toBe(0);
    expect(r.porcento).toBe(0);
  });

  it("plano basico nao ve passo de modulo que nao comprou", () => {
    const basico = chaves(novo({ modulos: ["NUCLEO", "PUBLICACOES_DJEN", "NUVEM", "EMAIL"] }));
    expect(basico).not.toContain("COBRANCA");
    expect(basico).not.toContain("ASSINATURA");
    expect(basico).not.toContain("NOTA_FISCAL");
    expect(basico).not.toContain("WHATSAPP");
    expect(basico).toContain("OAB_MONITORADA");
    expect(basico).toContain("MODELOS"); // modelos e do nucleo
  });

  it("todo passo explica o porque e o como, e tem destino", () => {
    for (const p of montarRoteiro(novo()).passos) {
      expect(p.porque.length, p.chave).toBeGreaterThan(80);
      expect(p.como.length, p.chave).toBeGreaterThan(30);
      expect(p.destino.startsWith("/"), p.chave).toBe(true);
      expect(p.minutos, p.chave).toBeGreaterThan(0);
    }
  });
});

describe("roteiro: o que conta como feito", () => {
  it("o passo so se marca com o fato, nunca com metade dele", () => {
    const so = (f: Partial<Fatos>, chave: string) =>
      montarRoteiro(novo(f)).passos.find((p) => p.chave === chave)!.situacao;

    expect(so({ cnpj: true }, "IDENTIDADE")).toBe("PENDENTE");
    expect(so({ cnpj: true, telefoneAtendimento: true }, "IDENTIDADE")).toBe("FEITO");
    expect(so({ advogados: 2 }, "EQUIPE")).toBe("PENDENTE");
    expect(so({ advogados: 2, advogadosComOab: 1 }, "EQUIPE")).toBe("FEITO");
    // Integracao gravada mas com erro nao e configuracao feita.
    expect(so({ integracoes: { SMTP: "ERRO" } }, "EMAIL")).toBe("PENDENTE");
    expect(so({ integracoes: { SMTP: "OK" } }, "EMAIL")).toBe("FEITO");
    expect(so({ integracoes: { INFINITEPAY: "OK" } }, "COBRANCA")).toBe("FEITO");
    expect(so({ integracoes: { GOOGLE: "OK" } }, "NUVEM")).toBe("FEITO");
    expect(so({ integracoes: { NFSE_CERT: "OK" } }, "NOTA_FISCAL")).toBe("PENDENTE");
    expect(so({ integracoes: { NFSE_CERT: "OK" }, temCadastroFiscal: true }, "NOTA_FISCAL")).toBe("FEITO");
  });

  it("o detalhe diz o que falta, com numero", () => {
    const p = (f: Partial<Fatos>, chave: string) =>
      montarRoteiro(novo(f)).passos.find((x) => x.chave === chave)!.detalhe;
    expect(p({ cnpj: true }, "IDENTIDADE")).toBe("Falta: telefone de atendimento.");
    expect(p({}, "IDENTIDADE")).toBe("Falta: CNPJ e telefone de atendimento.");
    expect(p({ advogados: 3, advogadosComOab: 1 }, "EQUIPE")).toBe("1 de 3 advogado(s) com OAB.");
    expect(p({ integracoes: { SMTP: "ERRO" } }, "EMAIL")).toMatch(/ultimo teste falhou/);
    expect(p({ integracoes: { NFSE_CERT: "OK" } }, "NOTA_FISCAL")).toBe("Falta: cadastro fiscal.");
  });

  it("nuvem sem aplicativo da plataforma fica 'em breve' e nao conta", () => {
    const r = montarRoteiro(novo({ nuvemDisponivel: false }));
    const nuvem = r.passos.find((p) => p.chave === "NUVEM")!;
    expect(nuvem.situacao).toBe("INDISPONIVEL");
    expect(nuvem.detalhe).toMatch(/plataforma/);
    expect(r.total).toBe(13);
  });
});

describe("roteiro: pular, progresso e conclusao", () => {
  it("essencial nao se pula, nem forcando", () => {
    expect(podePular("SENHA_ADMIN")).toBe(false);
    expect(podePular("IDENTIDADE")).toBe(false);
    expect(podePular("EQUIPE")).toBe(false);
    expect(podePular("COBRANCA")).toBe(true);
    expect(podePular("NAO_EXISTE")).toBe(false);
    // Mesmo com a marca gravada por fora, essencial continua pendente.
    const r = montarRoteiro(novo({ pulados: { SENHA_ADMIN: "2026-10-09" } }));
    expect(r.passos[0].situacao).toBe("PENDENTE");
  });

  it("pulado sai da conta e o proximo avanca", () => {
    const base = { temSenhaAdmin: true, cnpj: true, telefoneAtendimento: true, advogados: 1, advogadosComOab: 1 };
    const antes = montarRoteiro(novo(base));
    expect(antes.essenciaisFeitos).toBe(true);
    expect(antes.proximo?.chave).toBe("OAB_MONITORADA");

    const depois = montarRoteiro(novo({ ...base, pulados: { OAB_MONITORADA: "x", EMAIL: "x" } }));
    expect(depois.proximo?.chave).toBe("WHATSAPP");
    expect(depois.total).toBe(antes.total - 2);
    expect(depois.porcento).toBeGreaterThan(antes.porcento);
  });

  it("completo quando nada esta pendente; o tempo restante soma so os pendentes", () => {
    const tudo = novo({
      temSenhaAdmin: true, cnpj: true, telefoneAtendimento: true, advogados: 1, advogadosComOab: 1,
      oabsMonitoradas: 1, pessoasComWhatsapp: 1, modelos: 2, clientes: 5, processos: 3, compromissos: 1,
      temCadastroFiscal: true,
      integracoes: { SMTP: "OK", ASAAS: "OK", AUTENTIQUE: "OK", MICROSOFT: "OK", NFSE_CERT: "OK" },
    });
    const r = montarRoteiro(tudo);
    expect(r.completo).toBe(true);
    expect(r.porcento).toBe(100);
    expect(r.proximo).toBeNull();
    expect(r.minutosRestantes).toBe(0);

    const quase = montarRoteiro({ ...tudo, compromissos: 0 });
    expect(quase.completo).toBe(false);
    expect(quase.minutosRestantes).toBe(2);
  });

  it("toda chave do roteiro e unica", () => {
    expect(new Set(CHAVES_DOS_PASSOS).size).toBe(CHAVES_DOS_PASSOS.length);
  });
});

// ---------------------------------------------------------------------------
// Com banco: os fatos vem do escritorio de verdade
// ---------------------------------------------------------------------------

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;
let escritorio = "";

d("roteiro do escritorio", () => {
  beforeAll(async () => {
    process.env.SEGREDO_CHAVE ??= Buffer.alloc(32, 5).toString("base64");
    const e = await prismaPlataforma().escritorio.create({
      data: { slug: `passos-${Date.now()}`, nome: "Escritorio Recem-Chegado" },
    });
    escritorio = e.id;
    for (const modulo of ["PUBLICACOES_DJEN", "EMAIL", "COBRANCAS"]) {
      await prismaPlataforma().moduloContratado.create({
        data: { escritorioId: escritorio, modulo, ativo: true },
      });
    }
  });

  afterAll(async () => {
    if (escritorio) {
      await prismaPlataforma().escritorio.delete({ where: { id: escritorio } }).catch(() => {});
    }
    await prismaPlataforma().$disconnect();
  });

  it("escritorio que acabou de nascer comeca do zero, so com o que contratou", async () => {
    const r = await roteiroDoEscritorio(escritorio);
    expect(r.feitos).toBe(0);
    expect(r.proximo?.chave).toBe("SENHA_ADMIN");
    expect(r.dispensado).toBe(false);
    const ch = r.passos.map((p) => p.chave);
    expect(ch).toContain("COBRANCA");
    expect(ch).not.toContain("ASSINATURA");
    expect(ch).not.toContain("NOTA_FISCAL");
  });

  it("o que se faz nas outras telas aparece feito aqui, sem marcar nada", async () => {
    await comEscritorio(escritorio, async (db) => {
      await db.escritorio.update({
        where: { id: escritorio },
        data: { senhaAdminHash: "x", cnpj: "61.683.460/0001-56", telefoneAtendimento: "(16) 3333-0000" },
      });
      await db.usuario.create({
        data: semEscritorio({
          nome: "Dr. Primeiro",
          email: `dr-${Date.now()}@passos.test`,
          senhaHash: "x",
          papel: "ADVOGADO",
          advogado: true,
          oab: "123456/SP",
        }),
      });
      await db.oabMonitorada.create({ data: semEscritorio({ numero: "123456", uf: "SP" }) });
      await db.cliente.create({ data: semEscritorio({ nome: "Primeiro Cliente" }) });
    });
    await salvarIntegracao(escritorio, "SMTP", { host: "x" }, "ERRO", "recusou");

    const r = await roteiroDoEscritorio(escritorio);
    const situacao = Object.fromEntries(r.passos.map((p) => [p.chave, p.situacao]));
    expect(situacao).toMatchObject({
      SENHA_ADMIN: "FEITO",
      IDENTIDADE: "FEITO",
      EQUIPE: "FEITO",
      OAB_MONITORADA: "FEITO",
      EMAIL: "PENDENTE", // gravado, mas com erro
      COBRANCA: "PENDENTE",
      PRIMEIRO_CLIENTE: "FEITO",
    });
    expect(r.essenciaisFeitos).toBe(true);
    expect(r.proximo?.chave).toBe("EMAIL");
  });

  it("pular grava quem pulou; retomar devolve; essencial recusa", async () => {
    await pularPasso(escritorio, "COBRANCA", "Dra. Admin");
    let r = await roteiroDoEscritorio(escritorio);
    expect(r.passos.find((p) => p.chave === "COBRANCA")?.situacao).toBe("PULADO");

    const gravado = await comEscritorio(escritorio, (db) =>
      db.escritorio.findFirstOrThrow({ where: { id: escritorio }, select: { primeirosPassos: true } }),
    );
    expect((gravado.primeirosPassos as { pulados: Record<string, { por: string }> }).pulados.COBRANCA.por).toBe("Dra. Admin");

    await retomarPasso(escritorio, "COBRANCA");
    r = await roteiroDoEscritorio(escritorio);
    expect(r.passos.find((p) => p.chave === "COBRANCA")?.situacao).toBe("PENDENTE");

    await expect(pularPasso(escritorio, "EQUIPE", null)).rejects.toBeInstanceOf(PassoNaoPulavel);
  });

  it("dispensar do inicio nao apaga o que foi pulado", async () => {
    await pularPasso(escritorio, "MODELOS", null);
    await dispensarDoInicio(escritorio, true);
    let r = await roteiroDoEscritorio(escritorio);
    expect(r.dispensado).toBe(true);
    expect(r.passos.find((p) => p.chave === "MODELOS")?.situacao).toBe("PULADO");
    await dispensarDoInicio(escritorio, false);
    r = await roteiroDoEscritorio(escritorio);
    expect(r.dispensado).toBe(false);
  });
});
