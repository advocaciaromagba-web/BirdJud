import { describe, expect, it } from "vitest";
import {
  acumular,
  cabem,
  crescimentoPorMes,
  gargalos,
  mesesAte,
  nivelDe,
  percentil,
  precisamDeVacuum,
  recomendar,
  resumirServicos,
  simularEscala,
  suspeitasDeIndice,
  type EstadoParaRecomendar,
} from "../src/lib/escalabilidade";
import { acessoAsMetricas } from "../src/lib/railway";

const GB = 1024 ** 3;

describe("gargalos", () => {
  it("ordena do mais cheio ao mais folgado e marca o nivel", () => {
    const l = gargalos([
      { chave: "a", rotulo: "A", usado: 1, limite: 10, unidade: "bytes" },
      { chave: "b", rotulo: "B", usado: 9, limite: 10, unidade: "bytes" },
      { chave: "c", rotulo: "C", usado: 7.5, limite: 10, unidade: "bytes" },
      { chave: "d", rotulo: "sem limite", usado: 5, limite: 0, unidade: "bytes" },
    ]);
    expect(l.map((r) => [r.chave, r.nivel])).toEqual([
      ["b", "critico"],
      ["c", "atencao"],
      ["a", "ok"],
    ]);
  });

  it("niveis nas bordas", () => {
    expect(nivelDe(0.69)).toBe("ok");
    expect(nivelDe(0.7)).toBe("atencao");
    expect(nivelDe(0.85)).toBe("critico");
  });
});

describe("ritmo e projecao", () => {
  it("crescimento de uma serie acumulada reta", () => {
    expect(crescimentoPorMes(acumular([10, 10, 10, 10]))).toBeCloseTo(10);
    expect(crescimentoPorMes([5])).toBe(0);
  });

  it("usa so os ultimos meses da janela", () => {
    // Seis meses parados e depois tres de 100 por mes: a janela de 3 ve 100.
    const s = acumular([0, 0, 0, 0, 0, 0, 100, 100, 100]);
    expect(crescimentoPorMes(s, 3)).toBeCloseTo(100);
  });

  it("meses ate o alvo", () => {
    expect(mesesAte(50, 100, 10)).toBe(5);
    expect(mesesAte(120, 100, 10)).toBe(0);
    expect(mesesAte(50, 100, 0)).toBeNull();
    expect(mesesAte(50, 100, -3)).toBeNull();
  });

  it("percentil pelo metodo do posto mais proximo", () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentil(v, 95)).toBe(95);
    expect(percentil(v, 50)).toBe(50);
    expect(percentil([], 95)).toBe(0);
  });
});

describe("capacidade e simulacao", () => {
  it("cabem: quantos ate 70% do limite, descontada a parte fixa", () => {
    expect(cabem(1, 100)).toBe(70);
    expect(cabem(1, 100, 20)).toBe(50);
    expect(cabem(0, 100)).toBeNull();
  });

  it("projeta linearmente e diz o que estoura", () => {
    const [dez, cem] = simularEscala(
      {
        escritorios: 2,
        bytesBanco: 0.1 * GB + 2 * 0.02 * GB,
        bytesBancoFixo: 0.1 * GB,
        limiteBanco: 5 * GB,
        bytesArquivos: 2 * 0.05 * GB,
        limiteArquivos: 5 * GB,
        segundosDeTrabalhoPorDia: 2 * 600,
        trabalhadores: 1,
        memoriaAppGb: null,
        limiteMemoriaAppGb: null,
      },
      [10, 100],
    );
    expect(dez.banco).toBeCloseTo(0.3 * GB);
    expect(dez.arquivos).toBeCloseTo(0.5 * GB);
    expect(dez.ocupacaoTrabalhador).toBeCloseTo(6000 / 86_400);
    expect(dez.estoura).toEqual([]);
    expect(dez.trabalhadoresNecessarios).toBe(1);
    // 100 escritorios: 5 GB de arquivos (100%) e 60 000 s de fila (69%).
    expect(cem.estoura).toEqual(["disco dos arquivos"]);
    expect(cem.trabalhadoresNecessarios).toBe(1);
  });
});

describe("tabelas do banco", () => {
  const t = (nome: string, linhas: number, seq: number, idx: number, mortas = 0) => ({
    nome,
    bytes: 0,
    linhas,
    linhasMortas: mortas,
    leiturasSequenciais: seq,
    leiturasPorIndice: idx,
  });

  it("acusa tabela grande lida inteira, nao a pequena", () => {
    const l = suspeitasDeIndice([t("Grande", 50_000, 5_000, 10), t("Pequena", 50, 9_000, 0), t("Indexada", 50_000, 50, 90_000)]);
    expect(l.map((x) => x.nome)).toEqual(["Grande"]);
  });

  it("acusa linhas mortas acima de 20%", () => {
    const l = precisamDeVacuum([t("Suja", 4_000, 0, 0, 2_000), t("Limpa", 100_000, 0, 0, 2_000)]);
    expect(l.map((x) => x.nome)).toEqual(["Suja"]);
  });
});

describe("servicos do Railway", () => {
  it("resume por servico e ignora o que so tem disco", () => {
    const p = (...v: number[]) => v.map((valor, i) => ({ ts: i, valor }));
    const r = resumirServicos(
      [
        { servicoId: "app", medida: "CPU_USAGE", pontos: p(0.1, 0.3) },
        { servicoId: "app", medida: "CPU_LIMIT", pontos: p(8, 8) },
        { servicoId: "app", medida: "MEMORY_USAGE_GB", pontos: p(0.2, 0.4) },
        { servicoId: "app", medida: "MEMORY_LIMIT_GB", pontos: p(8, 8) },
        { servicoId: "app", medida: "NETWORK_TX_GB", pontos: p(0.5, 0.25) },
        { servicoId: "volume", medida: "DISK_USAGE_GB", pontos: p(1) },
      ],
      { app: "aplicacao" },
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      nome: "aplicacao",
      cpu: { media: 0.2, pico: 0.3, limite: 8 },
      memoriaGb: { pico: 0.4, atual: 0.4, limite: 8 },
      redeSaidaGb: 0.75,
      discoGb: null,
    });
  });

  it("acesso as metricas: token proprio ou o da guarda, ids do proprio Railway", () => {
    expect(acessoAsMetricas({})).toBeNull();
    expect(acessoAsMetricas({ RAILWAY_TOKEN_METRICAS: "t", RAILWAY_PROJECT_ID: "p" })).toBeNull();
    expect(
      acessoAsMetricas({ RAILWAY_TOKEN_GUARDA: "g", RAILWAY_PROJECT_ID: "p", RAILWAY_ENVIRONMENT_ID: "e" }),
    ).toEqual({ token: "g", projetoId: "p", ambienteId: "e" });
  });
});

describe("recomendacoes", () => {
  const base: EstadoParaRecomendar = {
    gargalos: [{ rotulo: "Disco do banco", fracao: 0.1, nivel: "ok" }],
    mesesAteBancoCheio: null,
    mesesAteArquivosCheios: null,
    ocupacaoTrabalhador: 0.05,
    trabalhadores: 1,
    atrasadosNaFila: 0,
    esperaP95Segundos: 3,
    cacheDoBanco: 0.999,
    latenciaBancoMs: 1,
    conexoes: { usadas: 10, maximo: 97 },
    suspeitasDeIndice: [],
    precisamDeVacuum: [],
    semMetricasDoRailway: false,
    escritorios: 20,
  };

  it("tudo com folga quando nada passa do limite", () => {
    expect(recomendar(base)).toEqual([expect.stringMatching(/^Tudo com folga/)]);
  });

  it("aponta o que precisa de acao", () => {
    const t = recomendar({
      ...base,
      gargalos: [{ rotulo: "Disco do banco", fracao: 0.9, nivel: "critico" }],
      mesesAteArquivosCheios: 3,
      ocupacaoTrabalhador: 0.8,
      conexoes: { usadas: 80, maximo: 97 },
      cacheDoBanco: 0.9,
    }).join("\n");
    expect(t).toMatch(/Disco do banco em 90%: aumentar agora/);
    expect(t).toMatch(/arquivos chega a 70% em 3 meses/);
    expect(t).toMatch(/réplica do serviço "trabalhador"/);
    expect(t).toMatch(/PgBouncer/);
    expect(t).toMatch(/shared_buffers/);
    expect(t).not.toMatch(/Tudo com folga/);
  });

  it("avisa da base pequena e da falta do token, sem esconder o veredito", () => {
    const t = recomendar({ ...base, escritorios: 2, semMetricasDoRailway: true });
    expect(t[0]).toMatch(/^Tudo com folga/);
    expect(t.join("\n")).toMatch(/RAILWAY_TOKEN_METRICAS/);
    expect(t.join("\n")).toMatch(/grosseiras/);
  });
});
