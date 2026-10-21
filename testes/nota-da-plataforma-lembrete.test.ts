// Lembrete do percentual de tributos na nota da plataforma (21/10/2026).
//
// O que protege: o percentual "por enquanto" (anexo do Simples ainda a
// confirmar) aparece a cada emissao para o administrador conferir, e NAO e
// pendencia: a nota sai, automatica ou manual.
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { lembreteDoPercentual } from "../src/lib/nota-da-plataforma";

describe("lembrete do percentual de tributos", () => {
  it("diz o percentual do Simples e pede a conferência", () => {
    const texto = lembreteDoPercentual({ opSimpNac: 3, pTotTribSN: new Prisma.Decimal("15.5") });
    expect(texto).toContain("15,50%");
    expect(texto).toContain("Simples Nacional");
    expect(texto).toMatch(/Confira com o contador/);
  });

  it("sem cadastro, sem percentual ou fora do Simples não há lembrete", () => {
    expect(lembreteDoPercentual(null)).toBeNull();
    expect(lembreteDoPercentual({ opSimpNac: 3, pTotTribSN: null })).toBeNull();
    expect(lembreteDoPercentual({ opSimpNac: 1, pTotTribSN: new Prisma.Decimal("15.5") })).toBeNull();
  });
});
