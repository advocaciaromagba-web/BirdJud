/**
 * A regra da volta automatica.
 *
 * Cada caso aqui e uma forma de errar que custaria caro em producao: voltar
 * no meio de um deploy que ia subir, voltar quando o problema e o banco, ou
 * entrar num laco de voltas que nao resolvem.
 */
import { describe, expect, it } from "vitest";
import {
  FALHAS_SEGUIDAS,
  JANELA_ENTRE_VOLTAS_MS,
  decidir,
  type EstadoDeDeploy,
} from "../src/lib/volta-de-deploy";

const AGORA = Date.parse("2026-10-08T03:00:00Z");

const deploy = (id: string, situacao: string): EstadoDeDeploy => ({
  id,
  situacao,
  criadoEm: "2026-10-07T23:00:00Z",
});

const caiu = Array(FALHAS_SEGUIDAS).fill(false);
const base = { ultimaVolta: null, agora: AGORA };

describe("volta automática de deploy", () => {
  it("volta quando o deploy falhou e o site não responde", () => {
    const d = decidir({
      ...base,
      saude: caiu,
      deploys: [deploy("novo", "FAILED"), deploy("bom", "SUCCESS")],
    });
    expect(d.acao).toBe("voltar");
    if (d.acao === "voltar") expect(d.alvo.id).toBe("bom");
  });

  it("não volta se o site respondeu em alguma das últimas batidas", () => {
    const d = decidir({
      ...base,
      saude: [false, true, false],
      deploys: [deploy("novo", "FAILED"), deploy("bom", "SUCCESS")],
    });
    expect(d.acao).toBe("nada");
  });

  it("não volta com menos batidas do que o mínimo", () => {
    const d = decidir({
      ...base,
      saude: [false, false],
      deploys: [deploy("novo", "FAILED"), deploy("bom", "SUCCESS")],
    });
    expect(d.acao).toBe("nada");
  });

  it("espera o deploy em andamento terminar", () => {
    for (const situacao of ["QUEUED", "BUILDING", "DEPLOYING"]) {
      const d = decidir({
        ...base,
        saude: caiu,
        deploys: [deploy("novo", situacao), deploy("bom", "SUCCESS")],
      });
      expect(d.acao, situacao).toBe("nada");
      expect(d.motivo).toContain(situacao);
    }
  });

  it("não volta quando o deploy no ar deu certo: a queda não é da versão", () => {
    const d = decidir({
      ...base,
      saude: caiu,
      deploys: [deploy("atual", "SUCCESS"), deploy("velho", "SUCCESS")],
    });
    expect(d.acao).toBe("nada");
    expect(d.motivo).toContain("não é da versão");
  });

  it("não volta se não há versão anterior que tenha subido", () => {
    const d = decidir({
      ...base,
      saude: caiu,
      deploys: [deploy("novo", "FAILED"), deploy("outro", "FAILED")],
    });
    expect(d.acao).toBe("nada");
  });

  it("pula deploys removidos e intermediarios até achar o último que subiu", () => {
    const d = decidir({
      ...base,
      saude: caiu,
      deploys: [
        deploy("novo", "FAILED"),
        deploy("tambem-ruim", "CRASHED"),
        deploy("bom", "SUCCESS"),
      ],
    });
    expect(d.acao).toBe("voltar");
    if (d.acao === "voltar") expect(d.alvo.id).toBe("bom");
  });

  it("não repete a mesma volta dentro da janela", () => {
    const d = decidir({
      saude: caiu,
      deploys: [deploy("novo", "FAILED"), deploy("bom", "SUCCESS")],
      ultimaVolta: { paraId: "bom", quando: AGORA - 60_000 },
      agora: AGORA,
    });
    expect(d.acao).toBe("nada");
    expect(d.motivo).toContain("já foi tentada");
  });

  it("depois da janela, tenta de novo", () => {
    const d = decidir({
      saude: caiu,
      deploys: [deploy("novo", "FAILED"), deploy("bom", "SUCCESS")],
      ultimaVolta: { paraId: "bom", quando: AGORA - JANELA_ENTRE_VOLTAS_MS - 1 },
      agora: AGORA,
    });
    expect(d.acao).toBe("voltar");
  });

  it("volta para outro alvo mesmo dentro da janela", () => {
    const d = decidir({
      saude: caiu,
      deploys: [deploy("novo", "FAILED"), deploy("outro-bom", "SUCCESS")],
      ultimaVolta: { paraId: "bom", quando: AGORA - 1000 },
      agora: AGORA,
    });
    expect(d.acao).toBe("voltar");
  });
});
