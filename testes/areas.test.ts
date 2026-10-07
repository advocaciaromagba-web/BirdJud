// Permissao por area.
//
// O QUE ESTES TESTES PROTEGEM: duas coisas opostas. Que ninguem perca acesso
// ao que ja usava so porque o escritorio ligou um painel de permissoes — e que
// a tela de permissoes nao vire um caminho para alguem se promover a
// administrador.
import { describe, expect, it } from "vitest";
import {
  AREAS,
  AREA_DO_ENDERECO,
  areasDistribuiveis,
  ehArea,
  mapaDeAcesso,
  podeNaArea,
} from "../src/lib/areas";
import type { Modulo } from "../src/lib/modulos";

const TODOS: Modulo[] = [
  "NUCLEO",
  "PUBLICACOES_DJEN",
  "WHATSAPP",
  "EMAIL",
  "NFSE",
  "COBRANCAS",
  "FINANCEIRO",
  "ASSINATURA",
  "IA",
  "NUVEM",
];

describe("o catalogo", () => {
  it("nao repete chave", () => {
    expect(new Set(AREAS.map((a) => a.chave)).size).toBe(AREAS.length);
  });

  it("todo endereco aponta para uma area que existe", () => {
    for (const area of Object.values(AREA_DO_ENDERECO)) {
      expect(ehArea(area)).toBe(true);
    }
  });

  // Dinheiro exige alguem dizer sim.
  it("o que e dinheiro nasce fechado; o trabalho do dia nasce aberto", () => {
    const porChave = new Map(AREAS.map((a) => [a.chave, a.padrao]));
    expect(porChave.get("COBRANCAS")).toBe(false);
    expect(porChave.get("CONCILIACAO")).toBe(false);
    expect(porChave.get("FINANCEIRO")).toBe(false);
    expect(porChave.get("NOTAS")).toBe(false);
    expect(porChave.get("CLIENTES")).toBe(true);
    expect(porChave.get("PROCESSOS")).toBe(true);
    expect(porChave.get("AGENDA")).toBe(true);
    expect(porChave.get("PRAZOS")).toBe(true);
  });

  // Da para liberar a emissao de cobranca sem abrir o livro-caixa e a meta do
  // ano, que e o retrato de quanto a banca ganha.
  it("o dinheiro e subdividido", () => {
    expect(ehArea("COBRANCAS")).toBe(true);
    expect(ehArea("FINANCEIRO")).toBe(true);
    expect(ehArea("CONCILIACAO")).toBe(true);
  });
});

describe("quem ve o que", () => {
  it("admin ve tudo, inclusive o que nasce fechado", () => {
    const m = mapaDeAcesso("ADMIN", [], TODOS);
    expect(Object.values(m).every(Boolean)).toBe(true);
  });

  // Ligar o painel de permissoes nao pode mudar o trabalho de ninguem.
  it("sem nada gravado, vale o padrao", () => {
    const m = mapaDeAcesso("USUARIO", [], TODOS);
    expect(m.CLIENTES).toBe(true);
    expect(m.AGENDA).toBe(true);
    expect(m.FINANCEIRO).toBe(false);
  });

  it("o gravado manda sobre o padrao, nos dois sentidos", () => {
    const m = mapaDeAcesso(
      "ADVOGADO",
      [
        { area: "CLIENTES", permitido: false },
        { area: "FINANCEIRO", permitido: true },
      ],
      TODOS,
    );
    expect(m.CLIENTES).toBe(false);
    expect(m.FINANCEIRO).toBe(true);
  });

  // A tela de permissoes nao pode virar um caminho para promover alguem.
  it("area so de admin nao se abre por registro gravado", () => {
    const m = mapaDeAcesso("ADVOGADO", [{ area: "USUARIOS", permitido: true }], TODOS);
    expect(m.USUARIOS).toBe(false);
    expect(mapaDeAcesso("ADVOGADO", [{ area: "ADMINISTRACAO", permitido: true }], TODOS).ADMINISTRACAO).toBe(false);
  });

  // Sem modulo a area nem existe: mostrar como "bloqueada" faria o escritorio
  // procurar uma permissao que nao e o problema.
  it("sem o modulo, nem admin ve", () => {
    const m = mapaDeAcesso("ADMIN", [], ["NUCLEO"]);
    expect(m.FINANCEIRO).toBe(false);
    expect(m.PUBLICACOES).toBe(false);
    expect(m.CLIENTES).toBe(true);
  });

  it("modulo ganha do registro gravado", () => {
    const m = mapaDeAcesso("ADVOGADO", [{ area: "FINANCEIRO", permitido: true }], ["NUCLEO"]);
    expect(m.FINANCEIRO).toBe(false);
  });

  it("podeNaArea responde o mesmo que o mapa", () => {
    expect(podeNaArea("USUARIO", [], TODOS, "CLIENTES")).toBe(true);
    expect(podeNaArea("USUARIO", [], TODOS, "FINANCEIRO")).toBe(false);
    expect(podeNaArea("USUARIO", [], TODOS, "AREA_QUE_NAO_EXISTE")).toBe(false);
  });
});

describe("o que o escritorio distribui", () => {
  it("nao oferece o que so o admin ve", () => {
    const chaves = areasDistribuiveis(TODOS).map((a) => a.chave);
    expect(chaves).not.toContain("USUARIOS");
    expect(chaves).not.toContain("ADMINISTRACAO");
    expect(chaves).toContain("CLIENTES");
    expect(chaves).toContain("FINANCEIRO");
  });

  it("nao oferece area de modulo nao contratado", () => {
    const chaves = areasDistribuiveis(["NUCLEO", "COBRANCAS"]).map((a) => a.chave);
    expect(chaves).toContain("COBRANCAS");
    expect(chaves).not.toContain("FINANCEIRO");
    expect(chaves).not.toContain("NOTAS");
  });
});
