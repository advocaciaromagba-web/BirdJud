// Previsao de arrecadacao: tres fontes, sem contar duas vezes.
import { describe, expect, it } from "vitest";
import { competenciaSeguinte, montarPrevisao, somarMeses, type CobrancaLocal, type Entradas, type PagamentoLido } from "../src/lib/previsao-conta";

const HOJE = "2026-11-05";
const pag = (p: Partial<PagamentoLido> & { id: string; vencimento: string }): PagamentoLido => ({
  customer: "cus_1",
  valorCentavos: 100000,
  status: "PENDING",
  descricao: "",
  assinatura: null,
  parcelamento: null,
  ...p,
});
const local = (l: Partial<CobrancaLocal> & { id: string; vencimento: string }): CobrancaLocal => ({
  idNoProvedor: null,
  provedor: "ASAAS",
  cliente: "Cliente Local",
  descricao: "Cobrança",
  valorCentavos: 50000,
  recebidoCentavos: 0,
  status: "ABERTA",
  contrato: false,
  mensalidade: false,
  parcelamento: false,
  ...l,
});
const base = (e: Partial<Entradas>): Entradas => ({
  pagamentos: [],
  assinaturas: [],
  locais: [],
  nomePorConta: new Map([["cus_1", "Sebastião Lopes"]]),
  assinaturasAqui: new Set(),
  erroDoAsaas: null,
  ...e,
});

describe("datas", () => {
  it("vira o mês e o ano, e segura o dia no fim do mês", () => {
    expect(competenciaSeguinte("2026-11", 2)).toBe("2027-01");
    expect(competenciaSeguinte("2026-01", -1)).toBe("2025-12");
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2026-11-10", 3)).toBe("2027-02-10");
  });
});

describe("a previsão", () => {
  it("o que vence no mês: previsto, recebido, a vencer e vencido sobre o mesmo conjunto", () => {
    const r = montarPrevisao(
      base({
        pagamentos: [
          pag({ id: "p1", vencimento: "2026-11-02", status: "RECEIVED" }),
          pag({ id: "p2", vencimento: "2026-11-03", status: "OVERDUE" }),
          pag({ id: "p3", vencimento: "2026-11-20" }),
          pag({ id: "p4", vencimento: "2026-11-25", status: "REFUNDED" }),
        ],
      }),
      "2026-11",
      1,
      HOJE,
    );
    expect(r.meses[0]).toMatchObject({ previsto: 300000, recebido: 100000, vencido: 100000, aVencer: 100000 });
    expect(r.meses[0].porCliente).toEqual([{ rotulo: "Sebastião Lopes", centavos: 300000, quantas: 3 }]);
  });

  it("cobrança com par no Asaas conta uma vez; a do InfinitePay entra pelo sistema", () => {
    const r = montarPrevisao(
      base({
        pagamentos: [pag({ id: "p1", vencimento: "2026-11-10" })],
        locais: [
          local({ id: "c1", idNoProvedor: "p1", vencimento: "2026-11-10", recebidoCentavos: 30000 }),
          local({ id: "c2", provedor: "INFINITEPAY", vencimento: "2026-11-15", status: "PAGA" }),
        ],
      }),
      "2026-11",
      1,
      HOJE,
    );
    expect(r.meses[0].linhas.map((l) => [l.chave, l.recebidoCentavos])).toEqual([
      ["asaas:p1", 30000],
      ["sistema:c2", 50000],
    ]);
    expect(r.pendencias).toEqual([]);
  });

  it("Asaas fora do ar: entra tudo o que está no sistema", () => {
    const r = montarPrevisao(base({ erroDoAsaas: "timeout", locais: [local({ id: "c1", idNoProvedor: "p1", vencimento: "2026-11-10" })] }), "2026-11", 1, HOJE);
    expect(r.meses[0].previsto).toBe(50000);
  });

  it("assinatura projeta os meses que o Asaas ainda não emitiu, e só esses", () => {
    const r = montarPrevisao(
      base({
        pagamentos: [pag({ id: "p1", vencimento: "2026-11-10", assinatura: "sub_1", valorCentavos: 160000 })],
        assinaturas: [{ id: "sub_1", customer: "cus_1", valorCentavos: 160000, proximoVencimento: "2026-11-10", cicloMeses: 1, descricao: "Assessoria" }],
        assinaturasAqui: new Set(["sub_1"]),
      }),
      "2026-11",
      3,
      HOJE,
    );
    expect(r.meses.map((m) => [m.competencia, m.previsto, m.projetado])).toEqual([
      ["2026-11", 160000, 0],
      ["2026-12", 160000, 160000],
      ["2027-01", 160000, 160000],
    ]);
    expect(r.meses[1].linhas[0]).toMatchObject({ fonte: "PROJETADA", origem: "MENSALIDADE" });
  });

  it("aponta o que explica a diferença para Cobranças", () => {
    const r = montarPrevisao(
      base({
        pagamentos: [pag({ id: "p1", vencimento: "2026-11-10", customer: "cus_x" })],
        assinaturas: [{ id: "sub_9", customer: "cus_1", valorCentavos: 90000, proximoVencimento: "2026-12-01", cicloMeses: 3, descricao: "AK Empreendimentos" }],
      }),
      "2026-11",
      2,
      HOJE,
    );
    expect(r.pendencias.map((p) => p.tipo).sort()).toEqual(["ASSINATURA_FORA", "PAGADOR_DESCONHECIDO", "SO_NO_ASAAS"]);
    expect(r.meses[0].linhas[0].cliente).toBe("Pagador fora do cadastro");
  });
});
