import { describe, expect, it } from "vitest";
import {
  analisarCarteira,
  competenciaDe,
  rotuloDoMes,
  somarMeses,
  type EscritorioNoPainel,
} from "../src/lib/painel-plataforma";

const AGORA = new Date("2026-10-15T15:00:00Z");
const dia = (iso: string) => new Date(`${iso}T15:00:00Z`);

function esc(extra: Partial<EscritorioNoPainel> & { id: string }): EscritorioNoPainel {
  return {
    nome: extra.id,
    status: "ATIVO",
    faixa: "ATE_3",
    criadoEm: dia("2026-01-01"),
    encerradoEm: null,
    assinatura: { valorCentavos: 29900, diaVencimento: 10, fimDoTeste: dia("2026-02-01"), canceladaEm: null },
    faturas: [],
    ...extra,
  };
}

const CARTEIRA: EscritorioNoPainel[] = [
  esc({
    id: "Roma",
    faixa: "ATE_3",
    faturas: [
      { competencia: "2026-09", valorCentavos: 29900, vencimento: dia("2026-09-10"), status: "PAGA", pagoEm: dia("2026-09-12") },
      { competencia: "2026-10", valorCentavos: 29900, vencimento: dia("2026-10-10"), status: "PAGA", pagoEm: dia("2026-10-09") },
    ],
  }),
  esc({
    id: "Silva",
    status: "INADIMPLENTE",
    faixa: "ATE_10",
    assinatura: { valorCentavos: 89900, diaVencimento: 5, fimDoTeste: dia("2026-03-01"), canceladaEm: null },
    faturas: [
      // 70 dias, 40 dias e 10 dias de atraso
      { competencia: "2026-08", valorCentavos: 89900, vencimento: dia("2026-08-06"), status: "ABERTA", pagoEm: null },
      { competencia: "2026-09", valorCentavos: 89900, vencimento: dia("2026-09-05"), status: "ABERTA", pagoEm: null },
      { competencia: "2026-10", valorCentavos: 89900, vencimento: dia("2026-10-05"), status: "ABERTA", pagoEm: null },
    ],
  }),
  esc({
    id: "Novo",
    status: "TESTE",
    faixa: "ATE_1",
    // teste acaba em 20/10: entra na previsao de novembro (vence dia 10)
    assinatura: { valorCentavos: 14900, diaVencimento: 10, fimDoTeste: dia("2026-10-20"), canceladaEm: null },
  }),
  esc({
    id: "Tardio",
    status: "TESTE",
    // acaba em 15/11, depois do dia 10: so entra em dezembro
    assinatura: { valorCentavos: 20000, diaVencimento: 10, fimDoTeste: dia("2026-11-15"), canceladaEm: null },
  }),
  esc({ id: "Suspenso", status: "SUSPENSO" }),
  esc({ id: "Fechado", status: "ENCERRADO", encerradoEm: dia("2026-05-01") }),
  esc({
    id: "Cancelou",
    assinatura: { valorCentavos: 50000, diaVencimento: 10, fimDoTeste: dia("2026-01-01"), canceladaEm: dia("2026-10-01") },
  }),
];

describe("painel da plataforma: competencias", () => {
  it("mes no fuso de Brasilia, soma de meses e rotulo", () => {
    expect(competenciaDe(new Date("2026-11-01T02:00:00Z"))).toBe("2026-10");
    expect(somarMeses("2026-11", 3)).toBe("2027-02");
    expect(somarMeses("2026-01", -1)).toBe("2025-12");
    expect(rotuloDoMes("2027-02")).toBe("fev/27");
  });
});

describe("painel da plataforma: a carteira", () => {
  const a = analisarCarteira(CARTEIRA, AGORA);

  it("conta por situacao e deixa encerrado fora do total", () => {
    const n = Object.fromEntries(a.escritorios.porStatus.map((s) => [s.chave, s.valor]));
    expect(n).toEqual({ ATIVO: 2, TESTE: 2, INADIMPLENTE: 1, SUSPENSO: 1, ENCERRADO: 1 });
    expect(a.escritorios.total).toBe(6);
  });

  it("receita mensal e de quem paga: ativo e inadimplente, sem cancelado nem suspenso", () => {
    expect(a.receitaMensal).toBe(29900 + 89900);
    expect(a.pagantes).toBe(2);
    expect(a.ticketMedio).toBe(59900);
    expect(a.receitaEmTeste).toBe(14900 + 20000);
    const faixa = Object.fromEntries(a.porFaixa.map((f) => [f.chave, f.valor]));
    expect(faixa).toMatchObject({ ATE_3: 29900, ATE_10: 89900, ATE_1: 0 });
  });

  it("vencido separado pela idade do atraso, com o maior devedor", () => {
    const idade = Object.fromEntries(a.vencido.porIdade.map((f) => [f.chave, f.valor]));
    expect(idade).toEqual({ ATE_15: 89900, ATE_30: 0, ATE_60: 89900, MAIS_60: 89900 });
    expect(a.vencido.total).toBe(3 * 89900);
    expect(a.vencido.escritorios).toBe(1);
    expect(a.vencido.maiorDevedor).toEqual({ nome: "Silva", valor: 3 * 89900, dias: 70 });
    expect(a.vencido.porcentoDaReceita).toBe(225.1);
  });

  it("recebido pelo mes do pagamento, nao da competencia", () => {
    const mes = Object.fromEntries(a.recebidos.map((r) => [r.competencia, r.valor]));
    expect(mes["2026-09"]).toBe(29900);
    expect(mes["2026-10"]).toBe(29900);
    expect(a.recebidoNoMes).toBe(29900);
    expect(a.recebidos).toHaveLength(6);
    expect(a.recebidos[0].competencia).toBe("2026-05");
  });

  it("previsao: garantido todo mes; teste so a partir do vencimento depois do fim do teste", () => {
    const [nov, dez, jan] = a.previsao;
    expect(nov).toMatchObject({ competencia: "2026-11", garantido: 119800, testes: 14900 });
    expect(dez).toMatchObject({ competencia: "2026-12", garantido: 119800, testes: 34900 });
    expect(jan.testes).toBe(34900);
    expect(a.previsao).toHaveLength(6);
  });

  it("a analise escrita diz os fatos que pedem decisao", () => {
    const t = a.textos.join("\n");
    expect(t).toContain("Receita mensal contratada de R$");
    expect(t).toContain("2 escritorio(s) pagante(s)");
    expect(t).toMatch(/vencidos ha mais de 60 dias/);
    expect(t).toContain("Maior valor em atraso: Silva");
    expect(t).toContain("Novo"); // teste terminando em 5 dias
    expect(t).toMatch(/Silva responde por 75%/);
    expect(t).toMatch(/Proximos 3 meses/);
  });

  it("carteira vazia nao inventa numero", () => {
    const v = analisarCarteira([], AGORA);
    expect(v.receitaMensal).toBe(0);
    expect(v.ticketMedio).toBe(0);
    expect(v.concentracao).toBeNull();
    expect(v.textos[0]).toMatch(/Ainda nao ha escritorio pagante nem em teste/);
    expect(v.textos).toContain("Nenhuma fatura vencida em aberto.");
  });
});
