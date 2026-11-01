import { describe, expect, it } from "vitest";
import { agruparPendencias } from "../src/lib/reenvio-de-assinatura";

const cliente = {
  id: "c1",
  nome: "Maria Prado",
  email: "maria@exemplo.com",
  telefone: "(16) 99230-4561",
  notificarWhatsapp: true,
  notificarEmail: true,
};
const sig = (email: string, extra: Record<string, unknown> = {}) => ({
  nome: email.split("@")[0],
  email,
  acao: "SIGN" as const,
  link: `https://assina.exemplo/${email}`,
  assinadoEm: null,
  recusadoEm: null,
  ...extra,
});

describe("reenvio para assinatura", () => {
  it("uma pendência por pessoa, com todos os documentos que faltam ela assinar", () => {
    const { pendencias, ignorados } = agruparPendencias(
      [
        { id: "1", especie: "PROCURACAO", situacao: "ENVIADO", signatarios: [sig("maria@exemplo.com")], cliente },
        { id: "2", especie: "DECLARACAO", situacao: "ENVIADO", signatarios: [sig("MARIA@exemplo.com")], cliente },
        {
          id: "3",
          especie: "CONTRATO",
          situacao: "PARCIAL",
          signatarios: [sig("maria@exemplo.com", { assinadoEm: "2026-10-30T10:00:00Z" }), sig("adv@escritorio.com")],
          cliente,
        },
      ],
      null,
    );
    expect(ignorados).toEqual([]);
    const maria = pendencias.find((p) => p.email.toLowerCase() === "maria@exemplo.com")!;
    expect(maria.documentos.map((d) => d.nome)).toEqual(["Procuração", "Declaração de hipossuficiência"]);
    // Quem ja assinou o contrato nao recebe o contrato de novo.
    expect(maria.documentos).toHaveLength(2);
    // So o cliente do documento tem telefone: o link e pessoal.
    expect(maria.telefone).toBe("5516992304561");
    const adv = pendencias.find((p) => p.email === "adv@escritorio.com")!;
    expect(adv.telefone).toBeNull();
    expect(adv.cliente).toBeNull();
  });

  it("explica o que ficou de fora, sem juntar causas diferentes", () => {
    const { pendencias, ignorados } = agruparPendencias(
      [
        { id: "1", especie: "PROCURACAO", situacao: "ASSINADO", signatarios: [], cliente },
        {
          id: "2",
          especie: "CONTRATO",
          situacao: "PARCIAL",
          signatarios: [sig("maria@exemplo.com", { assinadoEm: "2026-10-30T10:00:00Z" })],
          cliente,
        },
        { id: "3", especie: "DECLARACAO", situacao: "ENVIADO", signatarios: [sig("maria@exemplo.com", { link: null })], cliente },
      ],
      null,
    );
    expect(pendencias).toEqual([]);
    expect(ignorados.map((i) => i.motivo)).toEqual([
      expect.stringMatching(/já foi assinado por todos/),
      expect.stringMatching(/todos já assinaram/),
      expect.stringMatching(/não devolveu link/),
    ]);
  });

  it("pedido de uma linha: só aquela pessoa", () => {
    const { pendencias, ignorados } = agruparPendencias(
      [
        {
          id: "1",
          especie: "CONTRATO",
          situacao: "ENVIADO",
          signatarios: [sig("maria@exemplo.com"), sig("adv@escritorio.com", { assinadoEm: "2026-10-30T10:00:00Z" })],
          cliente,
        },
      ],
      "adv@escritorio.com",
    );
    expect(pendencias).toEqual([]);
    expect(ignorados[0].motivo).toMatch(/esta pessoa já assinou/);
  });
});
