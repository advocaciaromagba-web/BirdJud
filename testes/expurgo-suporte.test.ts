// Registro de acesso do suporte: guardado 12 meses, depois apagado.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaPlataforma } from "../src/lib/prisma";
import { MESES_DE_GUARDA_DO_ACESSO_DE_SUPORTE, expurgarAcessosDeSuporte } from "../src/lib/plataforma";

const d = process.env.DATABASE_URL ? describe : describe.skip;
const marca = Date.now();
let esc = "";
let operador = "";

d("expurgo do acesso de suporte", () => {
  beforeAll(async () => {
    esc = (await prismaPlataforma().escritorio.create({ data: { slug: `expurgo-${marca}`, nome: "Expurgo" } })).id;
    operador = (
      await prismaPlataforma().operadorPlataforma.create({
        data: { nome: "Operador", email: `op-expurgo-${marca}@teste.br`, senhaHash: "x" },
      })
    ).id;
  });

  afterAll(async () => {
    await prismaPlataforma().acessoSuporte.deleteMany({ where: { escritorioId: esc } });
    await prismaPlataforma().operadorPlataforma.delete({ where: { id: operador } }).catch(() => {});
    await prismaPlataforma().escritorio.delete({ where: { id: esc } }).catch(() => {});
  });

  it("apaga o que passou de 12 meses e guarda o resto", async () => {
    expect(MESES_DE_GUARDA_DO_ACESSO_DE_SUPORTE).toBe(12);
    const agora = new Date("2026-10-11T12:00:00Z");
    const em = (iso: string) => ({ operadorId: operador, escritorioId: esc, motivo: iso, iniciadoEm: new Date(iso) });
    await prismaPlataforma().acessoSuporte.createMany({
      data: [em("2025-10-01T12:00:00Z"), em("2025-10-12T12:00:00Z"), em("2026-09-01T12:00:00Z")],
    });

    await expurgarAcessosDeSuporte(agora);
    const ficaram = await prismaPlataforma().acessoSuporte.findMany({ where: { escritorioId: esc }, orderBy: { iniciadoEm: "asc" } });
    // 01/10/2025 tem mais de 12 meses; 12/10/2025 ainda nao.
    expect(ficaram.map((a) => a.motivo)).toEqual(["2025-10-12T12:00:00Z", "2026-09-01T12:00:00Z"]);
  });
});
