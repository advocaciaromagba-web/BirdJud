/**
 * O laco da guarda, sem rede e sem relogio.
 *
 * O que estes casos protegem: nao bater na API do Railway a toa, nao perder
 * a memoria entre rodadas, e nunca deixar uma falha de rede virar excecao
 * que derruba o trabalhador.
 */
import { describe, expect, it } from "vitest";
import { rodada, type Dependencias } from "../src/lib/guarda-do-site";
import type { EstadoDeDeploy } from "../src/lib/volta-de-deploy";

const AGORA = Date.parse("2026-10-08T03:00:00Z");

function montar(sobre: Partial<Dependencias> = {}) {
  const chamadas = { bateu: 0, leuDeploys: 0, voltou: [] as string[] };
  const linhas: string[] = [];
  const deps: Dependencias = {
    bater: async () => {
      chamadas.bateu += 1;
      return true;
    },
    deploys: async () => {
      chamadas.leuDeploys += 1;
      return [] as EstadoDeDeploy[];
    },
    voltar: async (id) => {
      chamadas.voltou.push(id);
    },
    anotar: (l) => linhas.push(l),
    agora: () => AGORA,
    ...sobre,
  };
  return { deps, chamadas, linhas };
}

const ruim: EstadoDeDeploy[] = [
  { id: "novo", situacao: "FAILED", criadoEm: "2026-10-07T23:00:00Z" },
  { id: "bom", situacao: "SUCCESS", criadoEm: "2026-10-07T22:00:00Z" },
];

describe("guarda do site", () => {
  it("com o site de pe, nao pergunta nada ao Railway", async () => {
    const { deps, chamadas } = montar();
    await rodada(deps, { saude: [], ultimaVolta: null });
    expect(chamadas.leuDeploys).toBe(0);
  });

  it("guarda so as ultimas batidas", async () => {
    const { deps } = montar();
    const fim = await rodada(deps, {
      saude: [true, true, true, true, true],
      ultimaVolta: null,
    });
    expect(fim.saude.length).toBeLessThanOrEqual(3);
  });

  it("volta depois de tres quedas seguidas e lembra o alvo", async () => {
    const { deps, chamadas } = montar({
      bater: async () => false,
      deploys: async () => ruim,
    });
    let estado: Parameters<typeof rodada>[1] = { saude: [], ultimaVolta: null };
    for (let i = 0; i < 3; i += 1) estado = await rodada(deps, estado);
    expect(chamadas.voltou).toEqual(["bom"]);
    expect(estado.ultimaVolta).toEqual({ paraId: "bom", quando: AGORA });
    // Historico zerado: o que vale e o site depois da volta.
    expect(estado.saude).toEqual([]);
  });

  it("nao volta duas vezes para o mesmo alvo", async () => {
    const { deps, chamadas } = montar({
      bater: async () => false,
      deploys: async () => ruim,
    });
    let estado: Parameters<typeof rodada>[1] = { saude: [], ultimaVolta: null };
    for (let i = 0; i < 9; i += 1) estado = await rodada(deps, estado);
    expect(chamadas.voltou).toEqual(["bom"]);
  });

  it("healthcheck que estoura conta como queda, sem levantar excecao", async () => {
    const { deps } = montar({
      bater: async () => {
        throw new Error("fetch failed");
      },
      deploys: async () => ruim,
    });
    // Uma queda so: ainda nao da o minimo para voltar, entao o historico
    // continua de pe e mostra a batida que estourou contada como queda.
    const fim = await rodada(deps, { saude: [], ultimaVolta: null });
    expect(fim.saude).toEqual([false]);
  });

  it("API do Railway fora nao derruba a rodada, e nao perde o historico", async () => {
    const { deps, linhas } = montar({
      bater: async () => false,
      deploys: async () => {
        throw new Error("502");
      },
    });
    const fim = await rodada(deps, { saude: [false, false], ultimaVolta: null });
    expect(fim.saude).toEqual([false, false, false]);
    expect(linhas.join(" ")).toContain("nao consegui ler os deploys");
  });

  it("volta que falha nao e dada como feita", async () => {
    const { deps, linhas } = montar({
      bater: async () => false,
      deploys: async () => ruim,
      voltar: async () => {
        throw new Error("403");
      },
    });
    const fim = await rodada(deps, { saude: [false, false], ultimaVolta: null });
    expect(fim.ultimaVolta).toBeNull();
    expect(linhas.join(" ")).toContain("a volta falhou");
  });
});

describe("acesso ao Railway", () => {
  it("sem nenhuma variavel, a guarda fica desligada e nao reclama", async () => {
    const { acessoDoAmbiente } = await import("../src/lib/railway");
    expect(acessoDoAmbiente({})).toBeNull();
  });

  it("com o conjunto pela metade, reclama em vez de ficar meio ligada", async () => {
    const { acessoDoAmbiente, RailwayMalConfigurado } = await import(
      "../src/lib/railway"
    );
    expect(() => acessoDoAmbiente({ RAILWAY_TOKEN_GUARDA: "x" })).toThrow(
      RailwayMalConfigurado,
    );
  });

  it("com tudo, le os quatro campos", async () => {
    const { acessoDoAmbiente } = await import("../src/lib/railway");
    expect(
      acessoDoAmbiente({
        RAILWAY_TOKEN_GUARDA: " t ",
        RAILWAY_PROJETO_ID: "p",
        RAILWAY_AMBIENTE_ID: "a",
        RAILWAY_SERVICO_APP_ID: "s",
      }),
    ).toEqual({ token: "t", projetoId: "p", ambienteId: "a", servicoId: "s" });
  });
});
