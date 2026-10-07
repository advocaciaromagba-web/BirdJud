/**
 * O comando de partida do container nao pode derrubar o site.
 *
 * Contexto, para quem mexer aqui depois: o start roda quatro coisas antes de
 * ligar o servidor (esperar o banco, migrar, aplicar RLS, conferir producao).
 * Qualquer uma que falhe impede o "exec next start", reprova no healthcheck e
 * tira birdjud.com.br do ar. Ja aconteceu — uma conferencia marcou erro
 * porque so metade das variaveis do WhatsApp tinha sido gravada.
 *
 * Estes testes guardam as duas decisoes que vieram daquele dia.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { esperasDe, tentar } from "../scripts/lib/tentar.mjs";

const conferencia = readFileSync("scripts/conferir-producao.mjs", "utf8");
const partida = JSON.parse(readFileSync("railway.json", "utf8"));

describe("repetir com espera crescente", () => {
  it("espera uma vez a menos que o numero de tentativas", () => {
    expect(esperasDe({ tentativas: 5, esperaMs: 1000, fator: 2 })).toEqual([
      1000, 2000, 4000, 8000,
    ]);
  });

  it("uma tentativa unica nao espera por nada", () => {
    expect(esperasDe({ tentativas: 1 })).toEqual([]);
  });

  it("cobre mais de meio minuto de banco indisponivel", () => {
    const total = esperasDe().reduce((soma, ms) => soma + ms, 0);
    expect(total).toBeGreaterThanOrEqual(30_000);
  });

  it("devolve o resultado assim que a acao para de falhar", async () => {
    let vezes = 0;
    const valor = await tentar(
      async () => {
        vezes += 1;
        if (vezes < 3) throw new Error("banco ainda subindo");
        return "pronto";
      },
      { tentativas: 5, esperaMs: 1, rotulo: "teste" },
    );
    expect(valor).toBe("pronto");
    expect(vezes).toBe(3);
  });

  it("falha de verdade continua falhando, e propaga a causa", async () => {
    let vezes = 0;
    await expect(
      tentar(
        async () => {
          vezes += 1;
          throw new Error("senha errada");
        },
        { tentativas: 3, esperaMs: 1, rotulo: "teste" },
      ),
    ).rejects.toThrow("senha errada");
    expect(vezes).toBe(3);
  });
});

describe("o que pode derrubar o start", () => {
  /**
   * So integridade e isolamento. Recurso configurado pela metade degrada o
   * recurso; nao justifica recusar servir. Se algum dos nomes abaixo virar
   * erro de novo, foi engano.
   */
  const SO_AVISA = [
    "WhatsApp de entrada",
    "WhatsApp de saida",
    "DJEN_RELE_TOKEN",
  ];

  for (const nome of SO_AVISA) {
    it(`${nome} avisa, nao derruba`, () => {
      const trecho = conferencia.slice(
        0,
        conferencia.indexOf(`"${nome}"`),
      );
      // A chamada que precede o nome tem de ser alerta(, nunca erro(.
      const ultimaChamada = trecho.lastIndexOf("alerta(");
      const ultimoErro = trecho.lastIndexOf("erro(");
      expect(conferencia).toContain(`"${nome}"`);
      expect(ultimaChamada).toBeGreaterThan(ultimoErro);
    });
  }
});

describe("comando de partida", () => {
  it("espera o banco antes de migrar", () => {
    const cmd = partida.deploy.startCommand;
    expect(cmd.indexOf("esperar-banco")).toBeGreaterThanOrEqual(0);
    expect(cmd.indexOf("esperar-banco")).toBeLessThan(cmd.indexOf("migrar"));
  });

  it("liga o servidor por ultimo, com exec", () => {
    expect(partida.deploy.startCommand).toMatch(/exec \S*next start$/);
  });

  it("da ao healthcheck tempo para a espera do banco", () => {
    // As esperas somam ~31s so no esperar-banco, e migracao e conferencia
    // vem depois. Dois minutos era apertado demais.
    expect(partida.deploy.healthcheckTimeout).toBeGreaterThanOrEqual(300);
  });
});
