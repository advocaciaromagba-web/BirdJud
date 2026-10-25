// Suspensao pelo operador e avisos de cobranca (25/10/2026).
//
// O que protege: cada etapa do atraso manda um aviso so, uma vez por fatura,
// e nunca uma etapa anterior depois de uma posterior; o motivo interno da
// suspensao nao vai ao cliente; a regua nao devolve ao ar quem o operador
// suspendeu enquanto houver atraso, e respeita o prazo combinado ao liberar;
// pagar tudo devolve o acesso e limpa a suspensao.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { aplicarRegua, registrarPagamento, statusPelaRegua } from "../src/lib/cobranca";
import {
  AcaoDeCobrancaRecusada,
  avisarAgora,
  avisarCobranca,
  dataDaSuspensao,
  etapaPeloAtraso,
  jaAvisada,
  mensagemDoAviso,
  suspenderPorAtraso,
  type Envio,
} from "../src/lib/avisos-de-cobranca";
import type { MensagemDaPlataforma } from "../src/lib/email-plataforma";
import { REGUA } from "../src/lib/precos";

describe("régua de avisos, sem banco", () => {
  it("etapa pelo atraso", () => {
    expect(etapaPeloAtraso(-5)).toBeNull();
    expect(etapaPeloAtraso(-3)).toBe("LEMBRETE");
    expect(etapaPeloAtraso(0)).toBe("LEMBRETE");
    expect(etapaPeloAtraso(1)).toBe("VENCEU");
    expect(etapaPeloAtraso(REGUA.inadimplente)).toBe("INADIMPLENTE");
    expect(etapaPeloAtraso(REGUA.suspenso - 3)).toBe("SUSPENSAO_PROXIMA");
    expect(etapaPeloAtraso(REGUA.suspenso - 3, true)).toBe("INADIMPLENTE");
    expect(etapaPeloAtraso(REGUA.suspenso)).toBeNull();
  });

  it("etapa já avisada (ela ou uma posterior) não sai de novo", () => {
    expect(jaAvisada("VENCEU", ["LEMBRETE"])).toBe(false);
    expect(jaAvisada("VENCEU", ["VENCEU"])).toBe(true);
    expect(jaAvisada("VENCEU", ["INADIMPLENTE"])).toBe(true);
    expect(jaAvisada("LEMBRETE", ["MANUAL"])).toBe(false);
  });

  it("data da suspensão: vencimento + 15 dias, ou o prazo combinado se for depois", () => {
    const venc = new Date("2026-03-10T12:00:00Z");
    expect(dataDaSuspensao(venc).toISOString()).toBe("2026-03-25T12:00:00.000Z");
    expect(dataDaSuspensao(venc, new Date("2026-04-01T03:00:00Z")).toISOString()).toBe("2026-04-01T03:00:00.000Z");
  });

  it("régua: suspensão manual segura enquanto houver atraso; prazo combinado adia", () => {
    const agora = new Date("2026-03-20T12:00:00Z");
    expect(statusPelaRegua("SUSPENSO", 3, true, { manual: true, agora })).toBe("SUSPENSO");
    expect(statusPelaRegua("SUSPENSO", null, true, { manual: true, agora })).toBe("ATIVO");
    expect(statusPelaRegua("SUSPENSO", 20, true, { adiadaAte: new Date("2026-03-25T03:00:00Z"), agora })).toBe("INADIMPLENTE");
    expect(statusPelaRegua("INADIMPLENTE", 20, true, { adiadaAte: new Date("2026-03-19T03:00:00Z"), agora })).toBe("SUSPENSO");
  });

  it("mensagem: com valor, vencimento, link e data da suspensão", () => {
    const m = mensagemDoAviso("INADIMPLENTE", {
      nomeDoEscritorio: "Banca X",
      competencia: "2026-03",
      valorCentavos: 14_900,
      vencimento: new Date("2026-03-10T12:00:00Z"),
      link: "https://pagar.test/abc",
      enderecoDoPlano: "https://x.birdjud.com.br/plano",
      suspensaoEm: new Date("2026-03-25T12:00:00Z"),
    });
    expect(m.assunto).toContain("atraso");
    expect(m.texto).toContain("R$");
    expect(m.texto).toContain("10/03/2026");
    expect(m.texto).toContain("25/03/2026");
    expect(m.texto).toContain("https://pagar.test/abc");
  });
});

const temBanco = Boolean(process.env.DATABASE_URL);
(temBanco ? describe : describe.skip)("suspensão e avisos contra o banco", () => {
  let esc = "";
  let semAdmin = "";
  let faturaId = "";
  const enviados: MensagemDaPlataforma[] = [];
  const enviar: Envio = async (m) => {
    enviados.push(m);
  };
  const venc = new Date("2026-03-10T12:00:00Z");
  const em = (d: string) => new Date(`2026-03-${d}T12:00:00Z`);

  async function novo(nome: string, comAdmin: boolean) {
    const id = (await prismaPlataforma().escritorio.create({ data: { slug: `susp-${nome}-${Date.now()}`, nome, status: "ATIVO" } })).id;
    await prismaPlataforma().assinatura.create({
      data: { escritorioId: id, valorCentavos: 14_900, fimDoTeste: new Date("2026-01-01T12:00:00Z") },
    });
    if (comAdmin) {
      await comEscritorio(id, (db) =>
        db.usuario.create({ data: semEscritorio({ nome: "Dra. Admin", email: `adm-${nome}-${Date.now()}@e.test`, senhaHash: "x", papel: "ADMIN" }) }),
      );
    }
    const f = await prismaPlataforma().fatura.create({
      data: {
        escritorioId: id,
        competencia: "2026-03",
        valorCentavos: 14_900,
        vencimento: venc,
        criadaEm: new Date("2026-03-01T12:00:00Z"),
        linkPagamento: "https://pagar.test/fatura",
      },
    });
    return { id, faturaId: f.id };
  }

  beforeAll(async () => {
    const a = await novo("aviso", true);
    esc = a.id;
    faturaId = a.faturaId;
    semAdmin = (await novo("semadmin", false)).id;
  });

  afterAll(async () => {
    for (const id of [esc, semAdmin]) if (id) await prismaPlataforma().escritorio.delete({ where: { id } }).catch(() => {});
  });

  const mesmo = { anterior: "ATIVO", novo: "ATIVO" };

  it("uma etapa por vez, uma vez por fatura", async () => {
    expect(await avisarCobranca(esc, mesmo, em("08"), enviar)).toEqual(["LEMBRETE"]);
    expect(await avisarCobranca(esc, mesmo, em("09"), enviar)).toEqual([]);
    expect(await avisarCobranca(esc, mesmo, em("11"), enviar)).toEqual(["VENCEU"]);
    // Pulou do vencido direto para os 13 dias (regua parada): vai so a etapa de agora.
    expect(await avisarCobranca(esc, { anterior: "INADIMPLENTE", novo: "INADIMPLENTE" }, em("23"), enviar)).toEqual(["SUSPENSAO_PROXIMA"]);
    expect(await avisarCobranca(esc, { anterior: "INADIMPLENTE", novo: "INADIMPLENTE" }, em("16"), enviar)).toEqual([]);
    const tipos = (await prismaPlataforma().avisoDeCobranca.findMany({ where: { escritorioId: esc }, orderBy: { enviadoEm: "asc" } })).map((a) => a.tipo);
    expect(tipos).toEqual(["LEMBRETE", "VENCEU", "SUSPENSAO_PROXIMA"]);
    expect(enviados.at(-1)?.texto).toContain("25/03/2026");
  });

  it("suspender exige fatura vencida; o motivo interno não vai ao cliente", async () => {
    await expect(suspenderPorAtraso(esc, { motivo: "prometeu e não pagou", avisar: true, operador: "Op" }, em("05"), enviar)).rejects.toBeInstanceOf(
      AcaoDeCobrancaRecusada,
    );
    const r = await suspenderPorAtraso(esc, { motivo: "prometeu e não pagou", avisar: true, operador: "Op" }, em("16"), enviar);
    expect(r.avisado).toBe(true);
    expect(enviados.at(-1)?.assunto).toContain("suspenso");
    expect(enviados.at(-1)?.texto).not.toContain("prometeu");
    const e = await prismaPlataforma().escritorio.findUniqueOrThrow({ where: { id: esc } });
    expect(e.status).toBe("SUSPENSO");
    expect(e.suspensaoManual).toBe(true);
  });

  it("a régua não devolve ao ar quem o operador suspendeu, enquanto houver atraso", async () => {
    expect((await aplicarRegua(esc, em("18"))).statusNovo).toBe("SUSPENSO");
  });

  it("liberar com prazo: a régua não suspende até a data, e suspende depois", async () => {
    await prismaPlataforma().escritorio.update({
      where: { id: esc },
      data: { suspensaoManual: false, suspensaoAdiadaAte: new Date("2026-03-30T03:00:00Z") },
    });
    expect((await aplicarRegua(esc, em("26"))).statusNovo).toBe("INADIMPLENTE");
    expect((await aplicarRegua(esc, em("31"))).statusNovo).toBe("SUSPENSO");
  });

  it("pagar devolve o acesso, limpa a suspensão e avisa", async () => {
    const r = await registrarPagamento(faturaId, null, { agora: em("31") });
    expect(r.statusNovo).toBe("ATIVO");
    const e = await prismaPlataforma().escritorio.findUniqueOrThrow({ where: { id: esc } });
    expect(e.suspensoEm).toBeNull();
    expect(e.suspensaoAdiadaAte).toBeNull();
    expect(await avisarCobranca(esc, { anterior: "SUSPENSO", novo: "ATIVO" }, em("31"), enviar)).toEqual(["REATIVADO"]);
  });

  it("aviso pelo console: sem administrador ativo, recusa; com, registra quem mandou", async () => {
    await expect(avisarAgora(semAdmin, "Op", enviar)).rejects.toThrow(/administrador/);
    const outra = await prismaPlataforma().fatura.create({
      data: { escritorioId: esc, competencia: "2026-04", valorCentavos: 14_900, vencimento: new Date("2026-04-10T12:00:00Z") },
    });
    const para = await avisarAgora(esc, "Operadora Teste", enviar);
    expect(para).toHaveLength(1);
    const a = await prismaPlataforma().avisoDeCobranca.findFirstOrThrow({ where: { faturaId: outra.id, tipo: "MANUAL" } });
    expect(a.porOperador).toBe("Operadora Teste");
  });
});
