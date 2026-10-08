/**
 * A regra da lista de tarefas.
 *
 * O caso que mais importa: prioridade NAO vence data. Uma tarefa "baixa" que
 * vence hoje e mais urgente que uma "alta" da semana que vem, por mais que o
 * rotulo diga o contrario — e ordenar pelo rotulo e como a lista deixa de
 * ser util.
 */
import { describe, expect, it } from "vitest";
import {
  combina,
  estaAtrasada,
  ordenarAtivas,
  prioridadeDe,
  situacaoDe,
  venceHoje,
} from "../src/lib/tarefas";

const AGORA = new Date("2026-10-08T12:00:00");
const em = (iso: string) => new Date(iso);

describe("atrasada", () => {
  it("passou da hora e nao foi concluida", () => {
    expect(
      estaAtrasada(
        { vencimento: em("2026-10-07T09:00:00"), prioridade: "MEDIA", situacao: "PENDENTE" },
        AGORA,
      ),
    ).toBe(true);
  });

  it("concluida nunca esta atrasada, por mais velha que seja", () => {
    expect(
      estaAtrasada(
        { vencimento: em("2026-01-01T09:00:00"), prioridade: "ALTA", situacao: "CONCLUIDA" },
        AGORA,
      ),
    ).toBe(false);
  });

  it("vence hoje mais tarde ainda nao esta atrasada", () => {
    expect(
      estaAtrasada(
        { vencimento: em("2026-10-08T17:00:00"), prioridade: "BAIXA", situacao: "PENDENTE" },
        AGORA,
      ),
    ).toBe(false);
  });
});

describe("vence hoje", () => {
  it("conta o dia, nao o instante", () => {
    expect(venceHoje(em("2026-10-08T08:00:00"), AGORA)).toBe(true);
    expect(venceHoje(em("2026-10-08T23:59:00"), AGORA)).toBe(true);
    expect(venceHoje(em("2026-10-09T00:01:00"), AGORA)).toBe(false);
  });
});

describe("ordem da lista de ativas", () => {
  const t = (titulo: string, iso: string, prioridade = "MEDIA", situacao = "PENDENTE") => ({
    titulo,
    vencimento: em(iso),
    prioridade,
    situacao,
  });

  it("atrasada vem antes de tudo, e a mais velha no topo", () => {
    const lista = ordenarAtivas(
      [
        t("hoje", "2026-10-08T17:00:00", "URGENTE"),
        t("atrasada nova", "2026-10-07T09:00:00"),
        t("atrasada velha", "2026-09-01T09:00:00"),
      ],
      AGORA,
    );
    expect(lista.map((x) => x.titulo)).toEqual([
      "atrasada velha",
      "atrasada nova",
      "hoje",
    ]);
  });

  it("prioridade NAO vence data", () => {
    const lista = ordenarAtivas(
      [
        t("alta da semana que vem", "2026-10-15T09:00:00", "ALTA"),
        t("baixa de hoje", "2026-10-08T17:00:00", "BAIXA"),
      ],
      AGORA,
    );
    expect(lista[0].titulo).toBe("baixa de hoje");
  });

  it("empate de data desempata pela prioridade", () => {
    const lista = ordenarAtivas(
      [
        t("media", "2026-10-09T09:00:00", "MEDIA"),
        t("urgente", "2026-10-09T09:00:00", "URGENTE"),
        t("baixa", "2026-10-09T09:00:00", "BAIXA"),
      ],
      AGORA,
    );
    expect(lista.map((x) => x.titulo)).toEqual(["urgente", "media", "baixa"]);
  });

  it("nao mexe na lista recebida", () => {
    const original = [t("b", "2026-10-20T09:00:00"), t("a", "2026-10-09T09:00:00")];
    ordenarAtivas(original, AGORA);
    expect(original[0].titulo).toBe("b");
  });

  it("prioridade desconhecida nao joga a tarefa para o fim do mundo", () => {
    const lista = ordenarAtivas(
      [
        t("torta", "2026-10-09T09:00:00", "GRAVISSIMA"),
        t("baixa", "2026-10-09T09:00:00", "BAIXA"),
      ],
      AGORA,
    );
    expect(lista[0].titulo).toBe("torta");
  });
});

describe("busca", () => {
  const tarefa = {
    titulo: "Juntar documentos",
    descricao: "Comprovante de renda",
    numeroProcesso: "1002327-74.2024.8.26.0222",
    nomeDoCliente: "Mônica Gonçalves",
  };

  it("acha pelo titulo, ignorando acento e caixa", () => {
    expect(combina(tarefa, "DOCUMENTOS")).toBe(true);
    expect(combina({ ...tarefa, titulo: "Certidão" }, "certidao")).toBe(true);
  });

  it("acha pelo nome do cliente, que e como a pessoa lembra", () => {
    expect(combina(tarefa, "monica")).toBe(true);
  });

  it("acha pelo numero do processo", () => {
    expect(combina(tarefa, "1002327")).toBe(true);
  });

  it("todas as palavras precisam aparecer", () => {
    expect(combina(tarefa, "documentos monica")).toBe(true);
    expect(combina(tarefa, "documentos joao")).toBe(false);
  });

  it("termo vazio nao filtra nada", () => {
    expect(combina(tarefa, "   ")).toBe(true);
  });
});

describe("normalizacao do que vem de fora", () => {
  it("prioridade e situacao fora da lista caem no padrao", () => {
    expect(prioridadeDe("URGENTE")).toBe("URGENTE");
    expect(prioridadeDe("gravissima")).toBe("MEDIA");
    expect(prioridadeDe(null)).toBe("MEDIA");
    expect(situacaoDe("CONCLUIDA")).toBe("CONCLUIDA");
    expect(situacaoDe(7)).toBe("PENDENTE");
  });
});
