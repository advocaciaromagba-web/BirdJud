import { describe, expect, it } from "vitest";
import {
  DIAS_DE_AVISO,
  alvosDeCertificado,
  descreverAlvo,
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

describe("onde bater para ver o certificado", () => {
  // POR QUE ISTO IMPORTA: com uma borda de terceiro na frente, quem responde
  // no nome publico e ela, com um certificado dela, sempre valido. O
  // certificado do nosso servidor passaria a vencer em silencio — e foi um
  // certificado nosso em falha que derrubou o sistema inteiro em 28/09/2026.
  it("um nome sozinho bate nele mesmo", () => {
    expect(alvosDeCertificado("app.birdjud.com.br")).toEqual([
      { nome: "app.birdjud.com.br", origem: "app.birdjud.com.br" },
    ]);
  });

  it("nome@origem bate na origem, julgando o nome publico", () => {
    expect(
      alvosDeCertificado("app.birdjud.com.br@qj91rgxj.up.railway.app"),
    ).toEqual([
      { nome: "app.birdjud.com.br", origem: "qj91rgxj.up.railway.app" },
    ]);
  });

  it("le uma lista com os dois tipos, e nao se perde com espacos", () => {
    expect(
      alvosDeCertificado(
        " birdjud.com.br@tzp59u2a.up.railway.app , app.birdjud.com.br ",
      ),
    ).toEqual([
      { nome: "birdjud.com.br", origem: "tzp59u2a.up.railway.app" },
      { nome: "app.birdjud.com.br", origem: "app.birdjud.com.br" },
    ]);
  });

  // Virgula sobrando na configuracao nao pode virar alarme sobre o host "".
  it("descarta item vazio em vez de criar alvo quebrado", () => {
    expect(alvosDeCertificado("a.br,,  , b.br")).toEqual([
      { nome: "a.br", origem: "a.br" },
      { nome: "b.br", origem: "b.br" },
    ]);
    expect(alvosDeCertificado("")).toEqual([]);
    expect(alvosDeCertificado(undefined)).toEqual([]);
    expect(alvosDeCertificado(null)).toEqual([]);
  });

  it("descarta engano de digitacao em vez de adivinhar", () => {
    expect(alvosDeCertificado("app.birdjud.com.br@")).toEqual([]);
    expect(alvosDeCertificado("@origem.br")).toEqual([]);
  });

  it("a descricao diz onde foi batido, para separar borda de origem", () => {
    expect(descreverAlvo({ nome: "a.br", origem: "a.br" })).toBe("a.br");
    expect(descreverAlvo({ nome: "a.br", origem: "o.railway.app" })).toBe(
      "a.br (na origem o.railway.app)",
    );
  });

  // A armadilha medida em 05/10/2026: a origem sem SNI entrega
  // DNS:default.domain. Julgar esse certificado contra o nome publico tem de
  // dar FALHA — se desse "ok", um vigia mal ligado diria que esta tudo bem; e
  // o julgamento do certificado certo tem de dar ok.
  it("o certificado padrao da origem nao passa por certificado do nome", () => {
    const padraoDaOrigem = {
      subject: { CN: "default.domain" },
      subjectaltname: "DNS:default.domain",
      valid_to: "Nov  4 18:12:13 2026 GMT",
    };
    const veredito = julgar(
      "app.birdjud.com.br",
      padraoDaOrigem,
      new Date("2026-10-05T12:00:00Z"),
    );
    expect(veredito.situacao).toBe("falha");
  });

  it("o certificado real da origem passa", () => {
    const daOrigem = {
      subject: { CN: "*.birdjud.com.br" },
      subjectaltname: "DNS:app.birdjud.com.br",
      valid_to: "Nov  4 18:12:13 2026 GMT",
    };
    const veredito = julgar(
      "app.birdjud.com.br",
      daOrigem,
      new Date("2026-10-05T12:00:00Z"),
    );
    expect(veredito.situacao).toBe("ok");
  });
});
