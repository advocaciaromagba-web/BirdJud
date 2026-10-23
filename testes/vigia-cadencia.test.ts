// Cadencia dos avisos do vigia (23/10/2026).
//
// O que protege: o aviso de backup parado ou certificado com problema sai
// uma vez por hora, nao a cada 5 minutos; o vigia nao tem estado, entao a
// regra e pelo relogio.
import { describe, expect, it } from "vitest";
import { cadenciaDoAviso } from "../src/lib/vigia-cadencia";

describe("cadência dos avisos lentos", () => {
  it("só a primeira rodada da hora avisa", () => {
    expect(cadenciaDoAviso(new Date("2026-10-23T08:00:12Z")).avisarLentos).toBe(true);
    expect(cadenciaDoAviso(new Date("2026-10-23T08:04:59Z")).avisarLentos).toBe(true);
    expect(cadenciaDoAviso(new Date("2026-10-23T08:05:00Z")).avisarLentos).toBe(false);
    expect(cadenciaDoAviso(new Date("2026-10-23T08:29:15Z")).avisarLentos).toBe(false);
    expect(cadenciaDoAviso(new Date("2026-10-23T09:03:00Z")).avisarLentos).toBe(true);
  });

  it("acompanha o intervalo entre rodadas", () => {
    expect(cadenciaDoAviso(new Date("2026-10-23T08:07:00Z"), 10).avisarLentos).toBe(true);
    expect(cadenciaDoAviso(new Date("2026-10-23T08:12:00Z"), 10).avisarLentos).toBe(false);
  });
});
