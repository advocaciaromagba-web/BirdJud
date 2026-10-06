// Meta do ano.
//
// O QUE ESTES TESTES PROTEGEM: a decisao que o escritorio toma olhando o
// painel. "76% da meta" em marco e otimo e em dezembro e um ano perdido — se
// a conta do ritmo estiver errada, o escritorio relaxa quando devia correr.
import { describe, expect, it } from "vitest";
import {
  MARGEM,
  anosOferecidos,
  diasDoAno,
  diasVividos,
  ritmoDaMeta,
} from "../src/lib/metas";

const META = 600_000_00; // R$ 600.000,00

describe("dias do ano", () => {
  it("conta o bissexto", () => {
    expect(diasDoAno(2026)).toBe(365);
    expect(diasDoAno(2028)).toBe(366);
    expect(diasDoAno(2100)).toBe(365); // seculo nao divisivel por 400
    expect(diasDoAno(2000)).toBe(366);
  });

  it("o primeiro dia do ano ja conta como vivido", () => {
    expect(diasVividos(2026, "2026-01-01")).toBe(1);
    expect(diasVividos(2026, "2026-12-31")).toBe(365);
  });

  it("nao passa do ano nem fica negativo", () => {
    expect(diasVividos(2026, "2027-06-01")).toBe(365);
    expect(diasVividos(2026, "2025-06-01")).toBe(0);
  });
});

describe("ritmo", () => {
  // Em 6 de outubro o ano nao esta em 9/12: esta em 279/365. Contar por mes
  // fechado daria ao escritorio um mes inteiro de folga que ele nao tem.
  it("conta por dia corrido, nao por mes fechado", () => {
    const r = ritmoDaMeta(META, 0, 2026, "2026-10-06")!;
    expect(r.fracaoDoAno).toBeCloseTo(279 / 365, 6);
    // 9/12 daria R$ 450.000; 279/365 da mais que isso.
    expect(r.esperadoCentavos).toBeGreaterThan(450_000_00);
  });

  it("diz quanto falta para estar no ritmo", () => {
    const r = ritmoDaMeta(META, 300_000_00, 2026, "2026-07-02")!;
    // Metade do ano: esperado perto de 300.000, entao esta em dia.
    expect(r.situacao).toBe("NO_RITMO");
    expect(Math.abs(r.diferencaCentavos)).toBeLessThan(META * MARGEM);
  });

  it("atrasado quando falta mais que a margem", () => {
    const r = ritmoDaMeta(META, 200_000_00, 2026, "2026-07-02")!;
    expect(r.situacao).toBe("ATRASADO");
    expect(r.diferencaCentavos).toBeLessThan(0);
  });

  it("adiantado quando sobra mais que a margem", () => {
    const r = ritmoDaMeta(META, 450_000_00, 2026, "2026-07-02")!;
    expect(r.situacao).toBe("ADIANTADO");
  });

  // Honorario nao entra em parcela diaria. Sem margem, o painel diria
  // "ATRASADO" quase toda semana e viraria alarme que ninguem olha.
  it("a margem existe para o painel nao virar alarme", () => {
    const esperado = ritmoDaMeta(META, 0, 2026, "2026-07-02")!.esperadoCentavos;
    const quaseNoPonto = ritmoDaMeta(META, esperado - 1000, 2026, "2026-07-02")!;
    expect(quaseNoPonto.situacao).toBe("NO_RITMO");
  });

  it("cumprida ganha de tudo, inclusive em janeiro", () => {
    const r = ritmoDaMeta(META, META, 2026, "2026-01-15")!;
    expect(r.situacao).toBe("CUMPRIDA");
    expect(r.faltaCentavos).toBe(0);
    expect(r.porMesRestanteCentavos).toBe(0);
  });

  it("diz quanto por mes falta para fechar", () => {
    const r = ritmoDaMeta(META, 300_000_00, 2026, "2026-07-02")!;
    expect(r.faltaCentavos).toBe(300_000_00);
    // Sobram ~183 dias, ou ~6 meses: perto de R$ 50.000 por mes.
    expect(r.porMesRestanteCentavos!).toBeGreaterThan(45_000_00);
    expect(r.porMesRestanteCentavos!).toBeLessThan(55_000_00);
  });

  it("no ultimo dia do ano nao ha mes que sobre", () => {
    const r = ritmoDaMeta(META, 100_000_00, 2026, "2026-12-31")!;
    expect(r.porMesRestanteCentavos).toBeNull();
  });

  it("projeta o fechamento no ritmo de hoje", () => {
    const r = ritmoDaMeta(META, 300_000_00, 2026, "2026-07-02")!;
    // Metade do ano com metade da meta projeta a meta inteira.
    expect(r.projecaoCentavos).toBeGreaterThan(590_000_00);
    expect(r.projecaoCentavos).toBeLessThan(610_000_00);
  });

  it("sem meta, nao ha ritmo para mostrar", () => {
    expect(ritmoDaMeta(0, 100_000_00, 2026, "2026-07-02")).toBeNull();
    expect(ritmoDaMeta(-1, 100_000_00, 2026, "2026-07-02")).toBeNull();
    expect(ritmoDaMeta(Number.NaN, 1, 2026, "2026-07-02")).toBeNull();
  });

  // Antes de o ano comecar nao se projeta nada: dividir por zero dia vivido
  // daria um numero sem sentido na cara de quem olha.
  it("ano que ainda nao comecou nao projeta", () => {
    const r = ritmoDaMeta(META, 0, 2027, "2026-10-06")!;
    expect(r.fracaoDoAno).toBe(0);
    expect(r.projecaoCentavos).toBe(0);
    expect(r.esperadoCentavos).toBe(0);
    expect(r.situacao).toBe("NO_RITMO");
  });
});

describe("anos na tela", () => {
  it("o passado, o corrente e o proximo", () => {
    expect(anosOferecidos(2026)).toEqual([2025, 2026, 2027]);
  });
});
