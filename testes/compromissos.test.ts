// A regra que separa tarefa de agendamento. Tem teste porque e assimetrica de
// proposito, e assimetria sem teste vira "acho que era ao contrario".
import { describe, expect, it } from "vitest";
import { ehTarefa, faltaParaGravar } from "@/lib/compromissos";

describe("tarefa", () => {
  it("exige cliente", () => {
    expect(faltaParaGravar({ tipo: "TAREFA" })).toContain("precisa de um cliente");
    expect(faltaParaGravar({ tipo: "TAREFA", clienteId: "  " })).toContain(
      "precisa de um cliente",
    );
  });

  it("aceita cliente da base ou cadastrado na hora", () => {
    expect(faltaParaGravar({ tipo: "TAREFA", clienteId: "cli-1" })).toBeNull();
    expect(
      faltaParaGravar({ tipo: "TAREFA", clienteNovo: { nome: "Maria" } }),
    ).toBeNull();
  });

  // Processo e opcional: ha tarefa de escritorio que nao tem processo, e
  // exigir um obrigaria a inventar numero.
  it("nao exige processo", () => {
    expect(faltaParaGravar({ tipo: "TAREFA", clienteId: "cli-1" })).toBeNull();
  });
});

describe("agendamento", () => {
  it("nao exige cliente nem processo", () => {
    for (const tipo of ["COMPROMISSO", "AUDIENCIA", "PRAZO"]) {
      expect(faltaParaGravar({ tipo })).toBeNull();
    }
  });

  it("aceita cliente quando ha", () => {
    expect(faltaParaGravar({ tipo: "COMPROMISSO", clienteId: "cli-1" })).toBeNull();
  });
});

describe("os dois ao mesmo tempo", () => {
  it("e recusado, para nao duplicar cadastro sem querer", () => {
    expect(
      faltaParaGravar({
        tipo: "COMPROMISSO",
        clienteId: "cli-1",
        clienteNovo: { nome: "Maria" },
      }),
    ).toContain("nao os dois");
  });
});

describe("ehTarefa", () => {
  it("so TAREFA e tarefa", () => {
    expect(ehTarefa("TAREFA")).toBe(true);
    expect(ehTarefa("COMPROMISSO")).toBe(false);
    expect(ehTarefa("tarefa")).toBe(false);
  });
});
