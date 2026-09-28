import { describe, expect, it } from "vitest";
import {
  DIAS_DE_AVISO,
  julgar,
  nomeCobre,
  nomesDoCertificado,
} from "@/lib/certificado";

const AGORA = new Date("2026-09-28T12:00:00Z");
const daqui = (dias: number) =>
  new Date(AGORA.getTime() + dias * 86_400_000).toUTCString();

describe("nomeCobre", () => {
  it("aceita o nome exato", () => {
    expect(nomeCobre("birdjud.com.br", "birdjud.com.br")).toBe(true);
  });

  it("o curinga cobre um rotulo a esquerda", () => {
    expect(nomeCobre("*.birdjud.com.br", "app.birdjud.com.br")).toBe(true);
    expect(nomeCobre("*.birdjud.com.br", "modelo.birdjud.com.br")).toBe(true);
  });

  it("o curinga NAO cobre o apice nem dois rotulos", () => {
    expect(nomeCobre("*.birdjud.com.br", "birdjud.com.br")).toBe(false);
    expect(nomeCobre("*.birdjud.com.br", "a.b.birdjud.com.br")).toBe(false);
  });

  it("nao confunde dominio que apenas termina parecido", () => {
    expect(nomeCobre("*.birdjud.com.br", "app.naobirdjud.com.br")).toBe(false);
    expect(nomeCobre("birdjud.com.br", "malbirdjud.com.br")).toBe(false);
  });

  it("ignora caixa e ponto final", () => {
    expect(nomeCobre("*.BirdJud.com.br.", "APP.birdjud.com.br")).toBe(true);
  });
});

describe("nomesDoCertificado", () => {
  it("junta o CN com os SAN de DNS e descarta o resto", () => {
    expect(
      nomesDoCertificado({
        subject: { CN: "birdjud.com.br" },
        subjectaltname: "DNS:birdjud.com.br, DNS:*.birdjud.com.br, IP Address:1.2.3.4",
      }),
    ).toEqual(["birdjud.com.br", "*.birdjud.com.br"]);
  });
});

describe("julgar", () => {
  const bom = {
    subject: { CN: "*.birdjud.com.br" },
    subjectaltname: "DNS:*.birdjud.com.br",
    valid_to: daqui(60),
  };

  it("aprova certificado que cobre o host e esta longe de vencer", () => {
    const v = julgar("app.birdjud.com.br", bom, AGORA);
    expect(v.situacao).toBe("ok");
  });

  // Este e o caso que derrubou o sistema: a borda respondeu com o
  // certificado padrao do provedor.
  it("acusa falha quando a borda entrega o certificado do provedor", () => {
    const v = julgar(
      "app.birdjud.com.br",
      { subject: { CN: "*.up.railway.app" }, subjectaltname: "DNS:*.up.railway.app", valid_to: daqui(60) },
      AGORA,
    );
    expect(v.situacao).toBe("falha");
    expect(v.situacao === "falha" && v.motivo).toContain("*.up.railway.app");
  });

  it("acusa falha quando venceu ou esta a poucos dias de vencer", () => {
    expect(julgar("app.birdjud.com.br", { ...bom, valid_to: daqui(-1) }, AGORA).situacao).toBe("falha");
    expect(
      julgar("app.birdjud.com.br", { ...bom, valid_to: daqui(DIAS_DE_AVISO - 1) }, AGORA).situacao,
    ).toBe("falha");
    expect(
      julgar("app.birdjud.com.br", { ...bom, valid_to: daqui(DIAS_DE_AVISO + 1) }, AGORA).situacao,
    ).toBe("ok");
  });

  // Alarme falso ensina a ignorar o alarme: sem certificado na mao, calamos.
  it("fica inconclusivo quando nao ha certificado para julgar", () => {
    expect(julgar("app.birdjud.com.br", null, AGORA).situacao).toBe("inconclusivo");
    expect(julgar("app.birdjud.com.br", {}, AGORA).situacao).toBe("inconclusivo");
  });

  it("valida ilegivel nao vira alarme quando o nome confere", () => {
    const v = julgar("app.birdjud.com.br", { ...bom, valid_to: "nao e data" }, AGORA);
    expect(v.situacao).toBe("ok");
  });
});
