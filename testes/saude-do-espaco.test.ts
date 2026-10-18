// Disco e banco passando de 70%: o que o vigia externo consulta.
//
// O que se prova: abaixo do limiar nao ha alarme nem percentual; acima, diz
// qual dos dois e quanto; statfs que mede o host inteiro (e nao o volume) e
// ignorado; e as medidas de verdade respondem contra o banco local.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  avaliarEspaco,
  medidaDoVolume,
  medirArquivos,
  medirBanco,
  percentual,
  saudeDoEspaco,
} from "../src/lib/saude-do-espaco";

const MB = 1024 * 1024;
const GB5 = 5000 * MB;

describe("saude do espaco", () => {
  it("abaixo de 70% esta tudo bem e nao conta nada", () => {
    expect(
      avaliarEspaco({
        arquivos: { usadoBytes: 100 * MB, limiteBytes: GB5 },
        banco: { usadoBytes: 3500 * MB, limiteBytes: GB5 },
      }),
    ).toEqual({ ok: true, acima: {} });
  });

  it("acima de 70% diz qual passou e em quanto", () => {
    expect(
      avaliarEspaco({
        arquivos: { usadoBytes: 3650 * MB, limiteBytes: GB5 },
        banco: { usadoBytes: 100 * MB, limiteBytes: GB5 },
      }),
    ).toEqual({ ok: false, acima: { arquivos: 73 } });
    expect(
      avaliarEspaco({ arquivos: null, banco: { usadoBytes: 4900 * MB, limiteBytes: GB5 } }),
    ).toEqual({ ok: false, acima: { banco: 98 } });
  });

  it("statfs do volume vale; do host inteiro, nao", () => {
    // Volume de 5 GB com 1 GB usado.
    const volume = medidaDoVolume({ blocks: (GB5 / 4096), bfree: (4000 * MB) / 4096, bsize: 4096 }, GB5);
    expect(volume && percentual(volume)).toBe(20);
    // Disco do host de 250 GB: nao diz nada sobre o volume.
    expect(medidaDoVolume({ blocks: 64_000_000, bfree: 60_000_000, bsize: 4096 }, GB5)).toBeNull();
  });
});

const temBanco = Boolean(process.env.DATABASE_URL);
(temBanco ? describe : describe.skip)("saude do espaco, medida de verdade", () => {
  it("mede o banco e os arquivos", async () => {
    const banco = await medirBanco();
    expect(banco.usadoBytes).toBeGreaterThan(0);
    expect(banco.limiteBytes).toBe(GB5);

    const anterior = process.env.RAIZ_ARQUIVOS;
    process.env.RAIZ_ARQUIVOS = await mkdtemp(join(tmpdir(), "birdjud-espaco-"));
    try {
      const arquivos = await medirArquivos();
      expect(arquivos.usadoBytes).toBeGreaterThanOrEqual(0);
      expect((await saudeDoEspaco()).ok).toBe(true);
      // Limite do volume pelo ambiente (aqui o statfs e do host: vale a soma).
      const pequeno = await medirArquivos({ LIMITE_DO_VOLUME_DE_ARQUIVOS_MB: "100" } as never);
      expect(pequeno.limiteBytes).toBe(100 * MB);
    } finally {
      if (anterior === undefined) delete process.env.RAIZ_ARQUIVOS;
      else process.env.RAIZ_ARQUIVOS = anterior;
    }
  });
});
