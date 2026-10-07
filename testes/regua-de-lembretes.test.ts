// A regua de lembretes: 3 dias, 24 horas, 1 hora.
//
// O QUE ESTES TESTES PROTEGEM: a confianca no aviso. Avisar "faltam 3 dias"
// de uma audiencia que e amanha, ou mandar tres avisos de cada tarefa, nao da
// erro nenhum — ensina a equipe e o cliente a ignorar o WhatsApp, e no dia da
// audiencia ninguem le.
import { describe, expect, it } from "vitest";
import {
  MAIOR_ANTECEDENCIA_HORAS,
  MARCOS,
  TIPOS_COM_REGUA,
  marcoAgora,
  marcosDoTipo,
  quandoComMarco,
} from "../src/lib/regua-de-lembretes";

const AGORA = new Date("2026-10-07T12:00:00Z");
const daquiA = (horas: number) =>
  new Date(AGORA.getTime() + horas * 60 * 60 * 1000);

describe("em qual marco o compromisso esta", () => {
  const chave = (horas: number, tipo = "AUDIENCIA") =>
    marcoAgora(tipo, daquiA(horas), AGORA)?.chave ?? null;

  it("a 50 horas, e o marco de 3 dias", () => {
    expect(chave(50)).toBe("3d");
  });

  it("a 20 horas, e o de 24 horas", () => {
    expect(chave(20)).toBe("24h");
  });

  it("a meia hora, e o de 1 hora", () => {
    expect(chave(0.5)).toBe("1h");
  });

  it("COMPROMISSO DE AMANHA NAO DISPARA 'FALTAM 3 DIAS'", () => {
    // A armadilha: "faltam 3 dias ou menos" tambem e verdade para quem e
    // amanha. Sem faixa, o cliente receberia os dois avisos no mesmo minuto.
    expect(chave(23)).toBe("24h");
    expect(chave(23)).not.toBe("3d");
  });

  it("alem de 3 dias, nenhum marco ainda", () => {
    expect(chave(100)).toBeNull();
  });

  it("compromisso que ja comecou nao gera aviso", () => {
    // Lembrete de audiencia que ja passou deixa o sistema com cara de
    // quebrado, e nao ajuda ninguem.
    expect(chave(0)).toBeNull();
    expect(chave(-1)).toBeNull();
  });

  it("nas bordas exatas, o marco e o proprio", () => {
    expect(chave(72)).toBe("3d");
    expect(chave(24)).toBe("24h");
    expect(chave(1)).toBe("1h");
  });
});

describe("quem tem regua e quem nao tem", () => {
  it("encontro tem os tres marcos", () => {
    for (const tipo of ["AUDIENCIA", "PERICIA", "COMPROMISSO"]) {
      expect(marcosDoTipo(tipo), tipo).toHaveLength(3);
      expect(TIPOS_COM_REGUA.has(tipo), tipo).toBe(true);
    }
  });

  it("prazo e tarefa tem um aviso so, de 24 horas", () => {
    // Tres avisos de cada tarefa enchem o WhatsApp da equipe e ensinam todo
    // mundo a ignorar — o contrario do que se quer no dia do prazo.
    for (const tipo of ["PRAZO", "TAREFA"]) {
      expect(marcosDoTipo(tipo).map((m) => m.chave), tipo).toEqual(["24h"]);
      expect(marcoAgora(tipo, daquiA(50), AGORA), tipo).toBeNull();
      expect(marcoAgora(tipo, daquiA(0.5), AGORA)?.chave, tipo).toBe("24h");
    }
  });
});

describe("a forma dos marcos", () => {
  it("as chaves sao estaveis — elas entram na chave do aviso", () => {
    // Mudar uma chave aqui faz o sistema reenviar avisos que ja sairam.
    expect(MARCOS.map((m) => m.chave)).toEqual(["3d", "24h", "1h"]);
    expect(MAIOR_ANTECEDENCIA_HORAS).toBe(72);
  });

  it("a mensagem diz quanto falta, nao so a data", () => {
    const m = MARCOS.find((x) => x.chave === "24h")!;
    expect(quandoComMarco("10/11/2026, 14:00", m)).toBe(
      "10/11/2026, 14:00 — e amanha",
    );
  });
});
