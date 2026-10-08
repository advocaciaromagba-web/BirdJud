/**
 * As iniciais do cartao no pe do menu.
 *
 * Parece detalhe, mas e o que a pessoa ve de si no sistema o dia inteiro.
 * "Jose Luciano da Costa Roma" tem de virar JR — JD, saido de "da", nao
 * significa nada.
 */
import { describe, expect, it } from "vitest";
import { iniciaisDe } from "../src/lib/nomes";

describe("iniciais do nome", () => {
  it("usa o primeiro e o ultimo pedaco", () => {
    expect(iniciaisDe("Jose Luciano da Costa Roma")).toBe("JR");
    expect(iniciaisDe("Maria Silva")).toBe("MS");
  });

  it("ignora particula no fim do nome", () => {
    expect(iniciaisDe("Ana de Souza")).toBe("AS");
    expect(iniciaisDe("Pedro dos Santos")).toBe("PS");
  });

  it("nome de uma palavra so devolve uma letra", () => {
    expect(iniciaisDe("Roma")).toBe("R");
  });

  it("aguenta espaco a mais e caixa baixa", () => {
    expect(iniciaisDe("  joao   pereira  ")).toBe("JP");
  });

  it("nome vazio nao quebra a tela", () => {
    expect(iniciaisDe("")).toBe("?");
    expect(iniciaisDe("   ")).toBe("?");
    expect(iniciaisDe("de da dos")).toBe("?");
  });
});

/**
 * Em lista plana, dois itens seguidos com o mesmo desenho obrigam a ler
 * linha por linha — o icone deixa de ajudar e vira enfeite.
 */
describe("icones do menu", () => {
  it("nenhum item do menu repete o icone de outro", async () => {
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync("src/componentes/Estrutura.tsx", "utf8");
    const usados = [...fonte.matchAll(/icone:\s*"([a-z]+)"/g)].map((m) => m[1]);
    expect(usados.length).toBeGreaterThan(10);
    expect(new Set(usados).size).toBe(usados.length);
  });

  it("todo icone usado existe de verdade", async () => {
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync("src/componentes/Estrutura.tsx", "utf8");
    const icones = readFileSync("src/componentes/Icone.tsx", "utf8");
    for (const [, nome] of fonte.matchAll(/icone:\s*"([a-z]+)"/g)) {
      expect(icones, nome).toContain(`| "${nome}"`);
    }
  });
});
