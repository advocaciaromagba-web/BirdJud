// Implantacao pela plataforma: a conta montada e entregue pela Blackbird.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma } from "../src/lib/prisma";
import { entregarEscritorio, implantarEscritorio, incluirNaEquipe } from "../src/lib/implantacao";
import { EnderecoIndisponivel } from "../src/lib/nascimento";
import { ConexaoRecusada, conectarPorFormulario } from "../src/lib/conectores/conectar";
import { documentosPendentes, registrarAceite } from "../src/lib/aceite";
import { FaixaEsgotada } from "../src/lib/faixas";
import { DadoInvalido } from "../src/lib/dados-do-escritorio";
import { roteiroDoEscritorio } from "../src/lib/primeiros-passos-do-escritorio";
import { lerOab } from "../src/lib/oabs";
import { modulosDoPlano } from "../src/lib/planos";

describe("leitura de OAB", () => {
  it("aceita os jeitos comuns de escrever", () => {
    expect(lerOab("123456/SP")).toEqual({ numero: "123456", uf: "SP" });
    expect(lerOab("SP 123.456")).toEqual({ numero: "123456", uf: "SP" });
    expect(lerOab("OAB/MG 98.765")).toEqual({ numero: "98765", uf: "MG" });
    expect(lerOab("123456")).toBeNull();
    expect(lerOab(null)).toBeNull();
  });
});

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;
const marca = Date.now();
let operadorId = "";
let escritorioId = "";

d("implantacao pela plataforma", () => {
  beforeAll(async () => {
    process.env.SEGREDO_CHAVE ??= Buffer.alloc(32, 4).toString("base64");
    // Sem remetente: a entrega devolve os links para repassar.
    for (const v of ["PLATAFORMA_SMTP_HOST", "PLATAFORMA_SMTP_USUARIO", "PLATAFORMA_SMTP_SENHA", "PLATAFORMA_REMETENTE", "EMAIL_RELE_URL", "EMAIL_RELE_TOKEN"]) {
      delete process.env[v];
    }
    const op = await prismaPlataforma().operadorPlataforma.create({
      data: { nome: "Operadora Teste", email: `op-${marca}@blackbird.test`, senhaHash: "x" },
    });
    operadorId = op.id;
  });

  afterAll(async () => {
    if (escritorioId) {
      await prismaPlataforma().escritorio.delete({ where: { id: escritorioId } }).catch(() => {});
    }
    await prismaPlataforma().acessoSuporte.deleteMany({ where: { operadorId } }).catch(() => {});
    await prismaPlataforma().operadorPlataforma.delete({ where: { id: operadorId } }).catch(() => {});
    await prismaPlataforma().$disconnect();
  });

  it("nasce completo: plano, preco fechado, dados, administrador e OAB no DJEN", async () => {
    const r = await implantarEscritorio(
      { operadorId },
      {
        slug: `impl-${marca}`,
        nome: "Implantado & Cia",
        modulos: modulosDoPlano("COMPLETO"),
        faixa: "ATE_1",
        diasDeTeste: 0,
        valorCentavos: 19900,
        dados: { cnpj: "61.683.460/0001-56", telefoneAtendimento: "(16) 3333-0000", razaoSocial: "Implantado Ltda" },
        administrador: { nome: "Dra. Admin", email: `adm-${marca}@impl.test`, oab: "123456/SP", telefone: "16999990000", recebeWhatsapp: true },
      },
    );
    escritorioId = r.id;
    expect(r.mensalidadeCentavos).toBe(19900);

    const e = await prismaPlataforma().escritorio.findUniqueOrThrow({
      where: { id: r.id },
      include: { assinatura: true, modulos: true },
    });
    expect(e.implantadoPor).toBe(operadorId);
    expect(e.implantadoEm).not.toBeNull();
    expect(e.entregueEm).toBeNull();
    expect(e.cnpj).toBe("61.683.460/0001-56");
    expect(e.assinatura?.valorCentavos).toBe(19900);
    expect(e.modulos.filter((m) => m.ativo).map((m) => m.modulo)).toContain("PUBLICACOES_DJEN");
    // A senha de administracao e do escritorio: a implantacao nao cria.
    expect(e.senhaAdminHash).toBeNull();

    const { admin, oabs } = await comEscritorio(r.id, async (db) => ({
      admin: await db.usuario.findFirstOrThrow({ where: { papel: "ADMIN" } }),
      oabs: await db.oabMonitorada.findMany(),
    }));
    expect(admin.recebeWhatsapp).toBe(true);
    expect(admin.advogado).toBe(true);
    expect(oabs.map((o) => `${o.numero}/${o.uf}`)).toEqual(["123456/SP"]);

    // O aceite e do escritorio: fica pendente ate o administrador aceitar.
    expect((await documentosPendentes(r.id)).length).toBeGreaterThan(0);

    const acessos = await prismaPlataforma().acessoSuporte.count({ where: { operadorId, escritorioId: r.id } });
    expect(acessos).toBeGreaterThan(0);
  });

  it("endereco reservado ou repetido e recusado antes de criar qualquer coisa", async () => {
    const base = {
      nome: "X", modulos: modulosDoPlano("ESSENCIAL"), faixa: "ATE_1" as const, diasDeTeste: 30,
      dados: {}, administrador: { nome: "Y", email: `y-${marca}@x.test` },
    };
    await expect(implantarEscritorio({ operadorId }, { ...base, slug: "plataforma" })).rejects.toBeInstanceOf(EnderecoIndisponivel);
    await expect(implantarEscritorio({ operadorId }, { ...base, slug: `impl-${marca}` })).rejects.toBeInstanceOf(EnderecoIndisponivel);
  });

  it("CNPJ com digito errado nao entra", async () => {
    const { salvarDadosDoEscritorio } = await import("../src/lib/dados-do-escritorio");
    await expect(salvarDadosDoEscritorio(escritorioId, { cnpj: "11.111.111/1111-11" })).rejects.toBeInstanceOf(DadoInvalido);
  });

  it("equipe respeita a faixa: o segundo advogado nao cabe no Solo; o apoio cabe", async () => {
    await expect(
      incluirNaEquipe(operadorId, escritorioId, { nome: "Dr. Dois", email: `dois-${marca}@impl.test`, papel: "ADVOGADO", oab: "222222/SP" }),
    ).rejects.toBeInstanceOf(FaixaEsgotada);
    const r = await incluirNaEquipe(operadorId, escritorioId, { nome: "Apoio", email: `apoio-${marca}@impl.test`, papel: "USUARIO" });
    expect(r.oabMonitorada).toBe(false);
  });

  it("integracao: campo faltando e nuvem por formulario sao recusados", async () => {
    await expect(conectarPorFormulario(escritorioId, "ASAAS", {})).rejects.toBeInstanceOf(ConexaoRecusada);
    await expect(conectarPorFormulario(escritorioId, "MICROSOFT", {})).rejects.toThrow(/pelo botao/);
  });

  it("o roteiro do escritorio enxerga o que a implantacao fez", async () => {
    const r = await roteiroDoEscritorio(escritorioId);
    const s = Object.fromEntries(r.passos.map((p) => [p.chave, p.situacao]));
    expect(s).toMatchObject({ IDENTIDADE: "FEITO", EQUIPE: "FEITO", OAB_MONITORADA: "FEITO", WHATSAPP: "FEITO", SENHA_ADMIN: "PENDENTE" });
  });

  it("entrega: convida quem nao entrou, devolve o link quando o e-mail nao sai, e marca a data", async () => {
    const e1 = await entregarEscritorio({ operadorId, nome: "Operadora" }, escritorioId);
    expect(e1.convites).toHaveLength(2);
    expect(e1.convites.every((c) => !c.enviado && c.link?.includes("/redefinir-senha?t="))).toBe(true);
    expect(e1.convites[0].email).toBe(`adm-${marca}@impl.test`); // administrador primeiro

    const e = await prismaPlataforma().escritorio.findUniqueOrThrow({ where: { id: escritorioId } });
    expect(e.entregueEm).not.toBeNull();

    // Entregar de novo derruba o link anterior: so um convite valido por pessoa.
    await entregarEscritorio({ operadorId, nome: "Operadora" }, escritorioId);
    const validos = await comEscritorio(escritorioId, (db) =>
      db.redefinicaoDeSenha.count({ where: { tipo: "CONVITE", usadoEm: null } }),
    );
    expect(validos).toBe(2);
  });

  it("depois do aceite do administrador, nada fica pendente", async () => {
    await registrarAceite(escritorioId, { nome: "Dra. Admin", email: `adm-${marca}@impl.test`, ip: null, navegador: null });
    expect(await documentosPendentes(escritorioId)).toEqual([]);
  });
});
