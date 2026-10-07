// Triagem da publicacao: agendar ou trabalhar, e para quando.
//
// O QUE ESTES TESTES PROTEGEM: o prazo. Uma audiencia classificada como
// tarefa some da agenda; uma tarefa marcada para o dia do vencimento e marcada
// para o dia em que nao da mais para errar. Nenhum dos dois da erro.
import { describe, expect, it } from "vitest";
import {
  ANTECEDENCIA_SUGERIDA_DIAS,
  contagemPeloTexto,
  especiePeloTexto,
  sugestaoSemIA,
  tipoDoCompromisso,
  tituloPadrao,
} from "../src/lib/triagem-de-publicacao";
import { calcularPrazo, recuarDiasUteis } from "../src/lib/prazos";

describe("agendar ou trabalhar", () => {
  it("o que exige ESTAR em algum lugar vira agendamento", () => {
    for (const t of [
      "Fica designada audiencia de instrucao e julgamento",
      "Intime-se para a pericia medica",
      "Designo atendimento na secretaria",
      "Sessao de julgamento virtual",
      "Audiencia de conciliacao",
    ]) {
      expect(especiePeloTexto(t), t).toBe("AGENDAMENTO");
    }
  });

  it("o que exige ESCREVER vira tarefa", () => {
    for (const t of [
      "Manifeste-se a parte autora no prazo de 15 dias",
      "Apresente contestacao",
      "Impugne os embargos",
      "Cumpra a determinacao, juntando o documento",
      "Apresente contrarrazoes ao recurso",
    ]) {
      expect(especiePeloTexto(t), t).toBe("TAREFA");
    }
  });

  it("no empate, AGENDAMENTO vence", () => {
    // "Manifeste-se sobre a designacao da audiencia" tem as duas coisas.
    // Perder uma audiencia custa mais que escrever uma peca um dia antes.
    expect(
      especiePeloTexto("Manifeste-se sobre a data da audiencia designada"),
    ).toBe("AGENDAMENTO");
  });

  it("texto que nao fala de nenhum dos dois nao inventa especie", () => {
    expect(especiePeloTexto("Publicado o acordao. Nada mais.")).toBeNull();
  });

  it("mas a sugestao final nunca vem vazia", () => {
    // O que nao aparece na tela nao e feito. Sem leitura da IA, a publicacao
    // chega com sugestao simples e confianca BAIXA, que e o aviso de que
    // aquilo saiu de palavra-chave.
    const s = sugestaoSemIA("Publicado o acordao.", null, "0001-23");
    expect(s.especie).toBe("TAREFA");
    expect(s.confianca).toBe("BAIXA");
    expect(s.titulo).toContain("0001-23");
  });
});

describe("que tipo de compromisso cada uma gera", () => {
  it("pericia e pericia, audiencia e audiencia", () => {
    expect(tipoDoCompromisso("AGENDAMENTO", "pericia medica")).toBe("PERICIA");
    expect(tipoDoCompromisso("AGENDAMENTO", "audiencia una")).toBe("AUDIENCIA");
    expect(tipoDoCompromisso("AGENDAMENTO", "atendimento no cartorio")).toBe(
      "COMPROMISSO",
    );
    expect(tipoDoCompromisso("TAREFA", "manifeste-se")).toBe("TAREFA");
  });

  it("o titulo leva o numero do processo", () => {
    // Uma agenda com cinco linhas escritas "Manifestacao" nao diz qual e qual.
    expect(tituloPadrao("TAREFA", "TAREFA", "0001234-56.2026.8.26.0100")).toContain(
      "0001234-56.2026.8.26.0100",
    );
  });
});

describe("dias uteis ou corridos", () => {
  it("processo civel conta em dias uteis — CPC 219", () => {
    expect(contagemPeloTexto("Manifeste-se em 15 dias. 2ª Vara Civel")).toBe(
      "UTEIS",
    );
  });

  it("processo criminal conta em dias corridos — CPP 798", () => {
    // Sem distinguir, um prazo de cinco dias em acao penal sairia uma semana
    // depois do que vence de verdade.
    for (const t of [
      "2ª Vara Criminal da comarca",
      "Nos autos da execucao penal",
      "Recebida a denuncia, acao penal",
    ]) {
      expect(contagemPeloTexto(t), t).toBe("CORRIDOS");
    }
  });
});

describe("a data sugerida, tres dias uteis antes do fatal", () => {
  it("recua pulando fim de semana", () => {
    // 2026-11-10 e uma terca. Tres dias uteis antes: 5 (quinta).
    expect(recuarDiasUteis("2026-11-10", 3)).toBe("2026-11-05");
  });

  it("tres dias UTEIS, e nao corridos — senao cairia no domingo", () => {
    // 2026-11-11 e quarta. Tres dias CORRIDOS antes seria domingo, 8.
    const sugerida = recuarDiasUteis("2026-11-11", ANTECEDENCIA_SUGERIDA_DIAS);
    expect(sugerida).toBe("2026-11-06");
    expect(new Date(`${sugerida}T12:00:00Z`).getUTCDay()).not.toBe(0);
  });

  it("NUNCA sugere data que ja passou", () => {
    // Publicacao lida com atraso: o fatal e daqui a dois dias, e recuar tres
    // cairia ontem. O sistema estaria mandando trabalhar no passado.
    const sugerida = recuarDiasUteis("2026-11-10", 3, "2026-11-09");
    expect(sugerida).toBe("2026-11-09");
  });

  it("e nunca sugere depois do proprio fatal", () => {
    const sugerida = recuarDiasUteis("2026-11-10", 3, "2026-11-20");
    expect(sugerida).toBe("2026-11-10");
  });

  it("da conta inteira: 15 dias uteis a partir da publicacao, menos 3", () => {
    // O caminho completo que o sistema faz: a IA diz "15 dias"; prazos.ts
    // transforma em data; a triagem recua tres dias uteis.
    const fatal = calcularPrazo("2026-11-03", 15, "UTEIS").vencimento;
    const sugerida = recuarDiasUteis(fatal, ANTECEDENCIA_SUGERIDA_DIAS, "2026-11-03");
    expect(fatal).toBe("2026-11-25");
    // 25/11 e quarta. Recuando: 24, 23 e — pulando 20/11, feriado nacional da
    // Consciencia Negra (Lei 14.759/2023) — 19. Quem fizesse a conta de
    // cabeca diria 20, e marcaria a peca para um dia em que o forum esta
    // fechado.
    expect(sugerida).toBe("2026-11-19");
  });
});
