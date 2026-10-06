// Lista de documentos a pedir ao cliente.
//
// O QUE ESTES TESTES PROTEGEM: a parte da lista que nao pode falhar e a que
// NAO vem da IA. Documentos pessoais, justica gratuita e acessos sao os mesmos
// em qualquer acao, e precisam sair iguais em todo atendimento — inclusive
// quando a IA nao responde nada. Lista que varia de um cliente para o outro
// falha exatamente no dia em que alguem confiar nela.
import { describe, expect, it } from "vitest";
import {
  ACESSOS,
  GRATUIDADE,
  PESSOAIS,
  emTexto,
  limpar,
  montar,
} from "../src/lib/checklist";

const CASO = { tipoAcao: "Acao de cobranca", pedeGratuidade: false };

const grupos = (l: ReturnType<typeof montar>) =>
  l.itens.reduce<Record<string, number>>((c, i) => {
    c[i.grupo] = (c[i.grupo] ?? 0) + 1;
    return c;
  }, {});

describe("a base nao depende da IA", () => {
  it("sem nada da IA, a lista ainda sai completa", () => {
    const l = montar(CASO);
    expect(grupos(l)).toEqual({
      PESSOAIS: PESSOAIS.length,
      ACESSOS: ACESSOS.length,
    });
  });

  it("com a IA devolvendo lixo, a base continua intacta", () => {
    const l = montar(CASO, {
      doCaso: "nao sou lista" as never,
      ajudam: [{}, { documento: "   " }] as never,
      observacoes: "tambem nao" as never,
    });
    expect(grupos(l).PESSOAIS).toBe(PESSOAIS.length);
    expect(grupos(l).DO_CASO).toBeUndefined();
    expect(l.observacoes).toEqual([]);
  });

  // O ponto que vale repetir: o sistema nunca exige RG, e a base diz isso.
  it("a identidade aceita CIN, RG ou CNH — nao exige RG", () => {
    const identidade = PESSOAIS[0]!.documento;
    expect(identidade).toContain("CIN");
    expect(identidade).toContain("CNH");
    expect(identidade).not.toMatch(/^RG\b/);
  });
});

describe("justica gratuita entra so quando pedida", () => {
  it("nao pedindo, nao aparece", () => {
    expect(grupos(montar(CASO)).GRATUIDADE).toBeUndefined();
  });

  it("pedindo, entra inteira", () => {
    const l = montar({ ...CASO, pedeGratuidade: true });
    expect(grupos(l).GRATUIDADE).toBe(GRATUIDADE.length);
  });

  // A declaracao sozinha ja nao basta (CPC 99 § 2º): a lista tem de pedir a
  // prova, senao o pedido volta indeferido.
  it("pede extrato e imposto de renda, nao so a declaracao", () => {
    const textos = GRATUIDADE.map((i) => i.documento.toLowerCase()).join(" | ");
    expect(textos).toContain("extrato");
    expect(textos).toContain("imposto de renda");
    expect(textos).toContain("declaracao de hipossuficiencia");
  });
});

describe("o que vem da IA e podado", () => {
  it("corta no limite e nao deixa item sem nome", () => {
    const muitos = Array.from({ length: 30 }, (_, i) => ({
      documento: `Doc ${i}`,
      paraQue: "x",
      essencial: true,
    }));
    expect(limpar(muitos, 10)).toHaveLength(10);
    expect(limpar([{ documento: "" }, { documento: "Vale" }], 10)).toHaveLength(1);
  });

  it("no maximo 4 observacoes, sem vazias", () => {
    const l = montar(CASO, {
      observacoes: ["a", "", "   ", "b", "c", "d", "e"],
    });
    expect(l.observacoes).toEqual(["a", "b", "c", "d"]);
  });

  it("aceita o que a IA mandou de util", () => {
    const l = montar(CASO, {
      doCaso: [{ documento: "Contrato", paraQue: "prova a divida", essencial: true }],
    });
    expect(l.itens.find((i) => i.grupo === "DO_CASO")?.documento).toBe("Contrato");
  });
});

describe("o texto para o cliente", () => {
  it("assina com o nome DO ESCRITORIO, nao um nome fixo", () => {
    const t = emTexto(montar(CASO), "Jose Cicero dos Santos", "Advocacia Pereira");
    expect(t).toContain("Advocacia Pereira");
    expect(t).not.toContain("Advocacia Roma");
  });

  it("chama o cliente pelo primeiro nome", () => {
    expect(emTexto(montar(CASO), "Jose Cicero dos Santos", "X")).toContain("Ola, Jose!");
  });

  it("nao quebra com nome vazio", () => {
    expect(emTexto(montar(CASO), "   ", "X")).toContain("Ola!");
  });

  it("traz os titulos dos grupos que tem item", () => {
    const t = emTexto(montar({ ...CASO, pedeGratuidade: true }), "Ana", "X");
    expect(t).toContain("DOCUMENTOS PESSOAIS");
    expect(t).toContain("PARA O PEDIDO DE JUSTICA GRATUITA");
    expect(t).toContain("ACESSOS");
    expect(t).not.toContain("DOCUMENTOS DO SEU CASO"); // nao houve item da IA
  });
});
