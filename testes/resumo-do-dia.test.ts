// Resumo do dia.
//
// O QUE ESTES TESTES PROTEGEM: a atencao de quem le. Um resumo que chega todo
// dia dizendo "nada para hoje" ensina a pessoa a ignorar o resumo — e no dia
// em que ele trouxer um prazo vencendo, ela nao vai ler. O erro aqui nao da
// erro: ele some dentro do habito.
import { describe, expect, it } from "vitest";
import {
  assuntoDoResumo,
  corpoDoResumo,
  linhaDoResumo,
  mereceMensagem,
  montarResumo,
  type FatosDoDia,
} from "../src/lib/resumo-do-dia";

const VAZIO: FatosDoDia = {
  prazosVencidos: [],
  prazosHoje: [],
  prazosAmanha: [],
  compromissosHoje: [],
  audienciasAmanha: 0,
  publicacoesNovas: 0,
};

const PRAZO = (titulo: string, vencimento = "2026-10-06") => ({
  titulo,
  vencimento,
  numeroProcesso: "1000123-45.2026.8.26.0100",
});

const COMPROMISSO = (titulo: string, hora = "14:30") => ({
  titulo,
  tipo: "AUDIENCIA",
  hora,
  local: "Forum Central",
});

describe("quando nao mandar", () => {
  it("dia sem nada nao gera mensagem", () => {
    expect(mereceMensagem(VAZIO)).toBe(false);
    expect(montarResumo(VAZIO, "Escritorio").vazio).toBe(true);
  });

  // Publicacao nova ja tem o resumo de publicacoes, que sai no mesmo horario.
  // Duas mensagens dizendo a mesma coisa e o caminho mais curto para as duas
  // serem ignoradas.
  it("publicacao nova sozinha nao vale um segundo e-mail", () => {
    expect(mereceMensagem({ ...VAZIO, publicacoesNovas: 7 })).toBe(false);
  });

  it("qualquer prazo ou compromisso vale", () => {
    expect(mereceMensagem({ ...VAZIO, prazosHoje: [PRAZO("Contestacao")] })).toBe(true);
    expect(mereceMensagem({ ...VAZIO, prazosVencidos: [PRAZO("Recurso")] })).toBe(true);
    expect(mereceMensagem({ ...VAZIO, prazosAmanha: [PRAZO("Replica")] })).toBe(true);
    expect(mereceMensagem({ ...VAZIO, compromissosHoje: [COMPROMISSO("Audiencia")] })).toBe(true);
    expect(mereceMensagem({ ...VAZIO, audienciasAmanha: 1 })).toBe(true);
  });
});

describe("assunto", () => {
  // A ordem e a de quem perde mais: prazo vencido perde direito, prazo de hoje
  // esta a horas de perder, audiencia nao se remarca por esquecimento.
  it("o que mais pesa vem no assunto, nao a soma de tudo", () => {
    const tudo: FatosDoDia = {
      prazosVencidos: [PRAZO("Recurso")],
      prazosHoje: [PRAZO("Contestacao")],
      prazosAmanha: [PRAZO("Replica")],
      compromissosHoje: [COMPROMISSO("Audiencia")],
      audienciasAmanha: 2,
      publicacoesNovas: 9,
    };
    expect(assuntoDoResumo(tudo, "Roma")).toBe("Roma — seu dia: 1 prazo vencido");
  });

  it("sem vencido, o de hoje", () => {
    expect(
      assuntoDoResumo({ ...VAZIO, prazosHoje: [PRAZO("a"), PRAZO("b")] }, "Roma"),
    ).toBe("Roma — seu dia: 2 prazos vencem hoje");
  });

  it("sem prazo, o compromisso", () => {
    expect(
      assuntoDoResumo({ ...VAZIO, compromissosHoje: [COMPROMISSO("a")] }, "Roma"),
    ).toBe("Roma — seu dia: 1 compromisso");
  });

  it("so audiencia de amanha ainda tem assunto", () => {
    expect(assuntoDoResumo({ ...VAZIO, audienciasAmanha: 1 }, "Roma")).toBe(
      "Roma — seu dia: 1 audiencia amanha",
    );
  });

  it("o nome do escritorio e parametro, nunca constante", () => {
    expect(assuntoDoResumo({ ...VAZIO, audienciasAmanha: 1 }, "Outro Escritorio")).toContain(
      "Outro Escritorio",
    );
  });
});

describe("linha do WhatsApp", () => {
  it("e numero, nao narrativa", () => {
    const f: FatosDoDia = {
      prazosVencidos: [PRAZO("a")],
      prazosHoje: [PRAZO("b"), PRAZO("c")],
      prazosAmanha: [],
      compromissosHoje: [COMPROMISSO("d")],
      audienciasAmanha: 0,
      publicacoesNovas: 4,
    };
    expect(linhaDoResumo(f)).toBe(
      "1 prazo vencido, 2 vencendo hoje, 1 compromisso hoje, 4 publicacoes novas.",
    );
  });

  it("plural certo no singular", () => {
    expect(linhaDoResumo({ ...VAZIO, compromissosHoje: [COMPROMISSO("a")] })).toBe(
      "1 compromisso hoje.",
    );
  });
});

describe("corpo do e-mail", () => {
  it("o que se perde primeiro vem primeiro", () => {
    const f: FatosDoDia = {
      prazosVencidos: [PRAZO("Recurso de apelacao")],
      prazosHoje: [PRAZO("Contestacao")],
      prazosAmanha: [PRAZO("Replica")],
      compromissosHoje: [COMPROMISSO("Audiencia de instrucao", "09:00")],
      audienciasAmanha: 1,
      publicacoesNovas: 3,
    };
    const html = corpoDoResumo(f, "Roma", "https://roma.birdjud.com.br");
    expect(html.indexOf("Recurso de apelacao")).toBeLessThan(html.indexOf("Contestacao"));
    expect(html.indexOf("Contestacao")).toBeLessThan(html.indexOf("Audiencia de instrucao"));
    expect(html.indexOf("Audiencia de instrucao")).toBeLessThan(html.indexOf("Replica"));
    expect(html).toContain("09:00");
    expect(html).toContain("Forum Central");
    expect(html).toContain("1 audiencia amanha, 3 publicacoes novas");
    expect(html).toContain("https://roma.birdjud.com.br");
  });

  // O prazo vencido leva a data: "venceu" sem dizer quando nao ajuda a decidir
  // o que fazer primeiro.
  it("o vencido diz quando venceu; o de hoje nao precisa", () => {
    const html = corpoDoResumo(
      { ...VAZIO, prazosVencidos: [PRAZO("Recurso", "2026-09-28")], prazosHoje: [PRAZO("Hoje")] },
      "Roma",
      "https://x",
    );
    expect(html).toContain("28/09/2026");
  });

  it("escapa o que vem do cadastro", () => {
    const html = corpoDoResumo(
      { ...VAZIO, prazosHoje: [{ titulo: '<script>alert(1)</script>', vencimento: "2026-10-06", numeroProcesso: null }] },
      "Roma & Cia",
      "https://x",
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Roma &amp; Cia");
  });

  it("bloco sem nada nao aparece", () => {
    const html = corpoDoResumo({ ...VAZIO, compromissosHoje: [COMPROMISSO("a")] }, "Roma", "https://x");
    expect(html).not.toContain("Vence hoje");
    expect(html).not.toContain("Prazo vencido");
  });
});
