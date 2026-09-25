// Fase 4: venda e operacao — teste, fatura, regua de atraso e suspensao.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comEscritorio,
  prismaPlataforma,
  semEscritorio,
} from "../src/lib/prisma";
import {
  aplicarRegua,
  criarAssinatura,
  diasDeAtraso,
  registrarPagamento,
  statusPelaRegua,
  vencimentoComPrazo,
  vencimentoDe,
} from "../src/lib/cobranca";
import {
  excedentes,
  mensalidade,
  PRAZO_MINIMO_DIAS,
  PRECO_DA_FAIXA,
  REGUA,
  somar,
} from "../src/lib/precos";
import { exportarEscritorio } from "../src/lib/exportacao";
import { gerarHash } from "../src/lib/senhas";
import { registrarConsumo } from "../src/lib/consumo";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;
const DIA = 24 * 60 * 60 * 1000;

describe("regra da regua (pura)", () => {
  it("sem atraso, quem devia volta a ATIVO e quem estava em teste continua", () => {
    expect(statusPelaRegua("INADIMPLENTE", null)).toBe("ATIVO");
    expect(statusPelaRegua("SUSPENSO", null)).toBe("ATIVO");
    expect(statusPelaRegua("TESTE", null)).toBe("TESTE");
    expect(statusPelaRegua("ATIVO", null)).toBe("ATIVO");
  });

  it("atraso pequeno ainda nao pune", () => {
    expect(statusPelaRegua("ATIVO", 1)).toBe("ATIVO");
    expect(statusPelaRegua("ATIVO", REGUA.inadimplente - 1)).toBe("ATIVO");
  });

  it("passa a INADIMPLENTE e depois a SUSPENSO", () => {
    expect(statusPelaRegua("ATIVO", REGUA.inadimplente)).toBe("INADIMPLENTE");
    expect(statusPelaRegua("INADIMPLENTE", REGUA.suspenso)).toBe("SUSPENSO");
    expect(statusPelaRegua("ATIVO", 90)).toBe("SUSPENSO");
  });

  it("ENCERRADO e decisao humana: a regua nao mexe", () => {
    expect(statusPelaRegua("ENCERRADO", null)).toBe("ENCERRADO");
    expect(statusPelaRegua("ENCERRADO", 90)).toBe("ENCERRADO");
  });

  it("o fim do teste vira cliente pagante, mesmo sem fatura vencida", () => {
    expect(statusPelaRegua("TESTE", null, true)).toBe("ATIVO");
    expect(statusPelaRegua("TESTE", 1, true)).toBe("ATIVO");
  });

  it("enquanto o teste corre, o escritorio continua em TESTE", () => {
    expect(statusPelaRegua("TESTE", null, false)).toBe("TESTE");
  });

  it("teste acabado nao salva quem ja esta em atraso longo", () => {
    expect(statusPelaRegua("TESTE", REGUA.suspenso, true)).toBe("SUSPENSO");
  });
});

describe("vencimento e atraso", () => {
  it("respeita mes curto", () => {
    expect(vencimentoDe("2026-02", 31).toISOString().slice(0, 10)).toBe(
      "2026-02-28",
    );
    expect(vencimentoDe("2026-10", 10).toISOString().slice(0, 10)).toBe(
      "2026-10-10",
    );
  });

  it("a fatura nunca nasce vencida", () => {
    // Teste que acaba dia 17, vencimento no dia 10: sem prazo minimo, a fatura
    // sairia com 7 dias de atraso e o escritorio viraria inadimplente na hora.
    const emissao = new Date("2026-09-17T12:00:00Z");
    const vencimento = vencimentoComPrazo("2026-09", 10, emissao);
    expect(vencimento.getTime()).toBeGreaterThan(emissao.getTime());
    expect(diasDeAtraso(vencimento, emissao)).toBeLessThanOrEqual(
      -PRAZO_MINIMO_DIAS,
    );
  });

  it("quando ha folga, mantem o dia combinado", () => {
    const emissao = new Date("2026-10-01T12:00:00Z");
    expect(
      vencimentoComPrazo("2026-10", 10, emissao).toISOString().slice(0, 10),
    ).toBe("2026-10-10");
  });

  it("conta os dias de atraso", () => {
    const vencimento = new Date("2026-09-10T12:00:00Z");
    expect(diasDeAtraso(vencimento, new Date("2026-09-10T12:00:00Z"))).toBe(0);
    expect(diasDeAtraso(vencimento, new Date("2026-09-16T12:00:00Z"))).toBe(6);
  });
});

describe("preco", () => {
  it("soma faixa e modulos contratados", () => {
    const itens = mensalidade("ATE_10", ["WHATSAPP", "EMAIL"]);
    expect(itens[0]?.valorCentavos).toBe(PRECO_DA_FAIXA.ATE_10);
    expect(itens).toHaveLength(3);
  });

  it("cobra so o que passou da franquia", () => {
    const itens = excedentes([
      { metrica: "WHATSAPP_MSG", excedente: 10 },
      { metrica: "REGISTROS", excedente: 500 },
    ]);
    // REGISTROS e metrica de nucleo: nao tem preco de excedente.
    expect(itens).toHaveLength(1);
    expect(somar(itens)).toBe(120);
  });
});

let escritorio = "";

d("ciclo comercial", () => {
  beforeAll(async () => {
    const e = await prismaPlataforma().escritorio.create({
      data: {
        slug: `f4-${Date.now()}`,
        nome: "Escritorio F4",
        status: "TESTE",
        faixa: "ATE_3",
      },
    });
    escritorio = e.id;
    await comEscritorio(escritorio, async (db) =>
      db.usuario.create({
        data: semEscritorio({
          nome: "Titular",
          email: "titular@f4.adv.br",
          senhaHash: await gerarHash("senha-de-teste-1234"),
          papel: "ADMIN",
          advogado: true,
        }),
      }),
    );
  });

  afterAll(async () => {
    if (escritorio) {
      await prismaPlataforma()
        .escritorio.delete({ where: { id: escritorio } })
        .catch(() => {});
    }
    await prismaPlataforma().$disconnect();
  });

  it("durante o teste nao gera fatura", async () => {
    await criarAssinatura(escritorio, PRECO_DA_FAIXA.ATE_3, 14);
    const resultado = await aplicarRegua(escritorio);
    expect(resultado.faturaGerada).toBeNull();
    expect(resultado.statusNovo).toBe("TESTE");
  });

  it("acabado o teste, gera a fatura do mes e ativa o escritorio", async () => {
    await prismaPlataforma().assinatura.update({
      where: { escritorioId: escritorio },
      data: { fimDoTeste: new Date(Date.now() - DIA) },
    });
    await registrarConsumo(escritorio, "WHATSAPP_MSG", 5);

    const resultado = await aplicarRegua(escritorio);
    expect(resultado.faturaGerada).not.toBeNull();
    // E o escritorio entra em ATIVO, nao em INADIMPLENTE.
    expect(resultado.statusNovo).toBe("ATIVO");

    const fatura = await prismaPlataforma().fatura.findFirstOrThrow({
      where: { escritorioId: escritorio },
    });
    // Sem modulo contratado, a fatura e so a faixa.
    expect(fatura.valorCentavos).toBe(PRECO_DA_FAIXA.ATE_3);
    expect(fatura.status).toBe("ABERTA");
  });

  it("nao duplica a fatura da mesma competencia", async () => {
    await aplicarRegua(escritorio);
    await aplicarRegua(escritorio);
    const quantas = await prismaPlataforma().fatura.count({
      where: { escritorioId: escritorio },
    });
    expect(quantas).toBe(1);
  });

  it("atraso passa para INADIMPLENTE e depois SUSPENSO", async () => {
    const fatura = await prismaPlataforma().fatura.findFirstOrThrow({
      where: { escritorioId: escritorio },
    });

    await prismaPlataforma().fatura.update({
      where: { id: fatura.id },
      data: {
        vencimento: new Date(Date.now() - (REGUA.inadimplente + 1) * DIA),
      },
    });
    expect((await aplicarRegua(escritorio)).statusNovo).toBe("INADIMPLENTE");

    await prismaPlataforma().fatura.update({
      where: { id: fatura.id },
      data: { vencimento: new Date(Date.now() - (REGUA.suspenso + 1) * DIA) },
    });
    expect((await aplicarRegua(escritorio)).statusNovo).toBe("SUSPENSO");
  });

  it("o pagamento devolve o escritorio ao ar", async () => {
    const fatura = await prismaPlataforma().fatura.findFirstOrThrow({
      where: { escritorioId: escritorio, status: "ABERTA" },
    });
    const resultado = await registrarPagamento(fatura.id, "pag-123");
    expect(resultado.statusNovo).toBe("ATIVO");

    const paga = await prismaPlataforma().fatura.findUniqueOrThrow({
      where: { id: fatura.id },
    });
    expect(paga.status).toBe("PAGA");
    expect(paga.idExterno).toBe("pag-123");
    expect(paga.pagoEm).not.toBeNull();
  });

  it("a exportacao traz os dados e nao traz segredo", async () => {
    const dados = await exportarEscritorio(escritorio);
    expect(dados.escritorio).toMatchObject({ nome: "Escritorio F4" });
    expect(dados.usuarios).toHaveLength(1);
    expect(dados.faturas).toHaveLength(1);

    const texto = JSON.stringify(dados);
    expect(texto).not.toContain("senhaHash");
    expect(texto).not.toContain("doisFatores");
    // O campo `dados` das integracoes (credencial cifrada) tambem fica fora.
    expect(Object.keys(dados.integracoes[0] ?? {})).not.toContain("dados");
  });
});

d("webhook de pagamento", () => {
  // A rota e testada pela funcao que ela chama e pelas regras de borda; a
  // conferencia HTTP de ponta a ponta esta no roteiro de fumaca.
  it("o caminho de baixa do webhook e o mesmo do painel", async () => {
    const e = await prismaPlataforma().escritorio.create({
      data: {
        slug: `f4w-${Date.now()}`,
        nome: "Webhook F4",
        status: "SUSPENSO",
      },
    });
    try {
      const fatura = await prismaPlataforma().fatura.create({
        data: {
          escritorioId: e.id,
          competencia: "2026-09",
          valorCentavos: 29900,
          vencimento: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        },
      });

      const resultado = await registrarPagamento(fatura.id, "pay_do_asaas");
      expect(resultado.statusNovo).toBe("ATIVO");

      const paga = await prismaPlataforma().fatura.findUniqueOrThrow({
        where: { id: fatura.id },
      });
      expect(paga.idExterno).toBe("pay_do_asaas");
    } finally {
      await prismaPlataforma()
        .escritorio.delete({ where: { id: e.id } })
        .catch(() => {});
    }
  });
});
