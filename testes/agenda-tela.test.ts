import { describe, expect, it } from "vitest";
import { combina, statusDe, type CompromissoNaTela } from "../src/lib/agenda-tela";

function compromisso(extra: Partial<CompromissoNaTela> = {}): CompromissoNaTela {
  return {
    id: "c1",
    titulo: "Audiência de instrução",
    tipo: "AUDIENCIA",
    inicioISO: "2026-11-05T13:00:00.000Z",
    local: "Fórum de Guariba",
    link: null,
    observacoes: null,
    concluido: false,
    processoId: null,
    numeroProcesso: "0011838-37.2025.5.15.0125",
    clienteId: null,
    nomeDoCliente: "Antonio Furtado Junior",
    responsavelId: null,
    nomeDoResponsavel: "Dr. Roma",
    participantes: [],
    nomesDosParticipantes: ["Antonio Furtado Junior", "Testemunha Tereza"],
    respostas: [],
    ...extra,
  };
}

describe("busca na agenda", () => {
  it("acha sem acento, por processo, por quem vai e por quem cuida", () => {
    const c = compromisso();
    expect(combina(c, "audiencia")).toBe(true);
    expect(combina(c, "INSTRUCAO")).toBe(true);
    expect(combina(c, "0011838")).toBe(true);
    expect(combina(c, "tereza")).toBe(true);
    expect(combina(c, "roma")).toBe(true);
    expect(combina(c, "guariba")).toBe(true);
    expect(combina(c, "pericia")).toBe(false);
    expect(combina(c, "   ")).toBe(true);
  });
});

describe("status do compromisso", () => {
  it("agendado, passou ou concluido", () => {
    const agora = new Date("2026-11-01T12:00:00Z");
    expect(statusDe(compromisso(), agora)).toBe("Agendado");
    expect(statusDe(compromisso({ inicioISO: "2026-10-30T12:00:00Z" }), agora)).toBe("Passou");
    expect(statusDe(compromisso({ concluido: true }), agora)).toBe("Concluido");
  });
});
