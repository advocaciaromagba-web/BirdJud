// As migracoes rodam em ordem ALFABETICA do nome da pasta, nao na ordem em
// que foram escritas.
//
// Isto ja quebrou uma vez: com "8_avisos" e "12_whatsapp", o banco novo tentava
// alterar a tabela Aviso antes de cria-la — "12" vem antes de "8" no
// alfabeto. Passou despercebido porque o banco de desenvolvimento aplicou cada
// migracao no dia em que ela nasceu; so um banco vazio revela a ordem real.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PASTA = join(process.cwd(), "prisma", "migrations");

function migracoes(): string[] {
  return readdirSync(PASTA, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name);
}

describe("ordem das migracoes", () => {
  it("toda migracao comeca com dois digitos", () => {
    for (const nome of migracoes()) {
      expect(nome).toMatch(/^\d{2}_/);
    }
  });

  it("a ordem alfabetica e a ordem numerica sao a mesma", () => {
    const nomes = migracoes();
    const porNumero = [...nomes].sort(
      (a, b) => Number(a.slice(0, 2)) - Number(b.slice(0, 2)),
    );
    const porAlfabeto = [...nomes].sort();
    expect(porAlfabeto).toEqual(porNumero);
  });

  it("nao ha dois numeros repetidos", () => {
    const numeros = migracoes().map((nome) => nome.slice(0, 2));
    expect(new Set(numeros).size).toBe(numeros.length);
  });
});
