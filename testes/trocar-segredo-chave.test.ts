// Troca da SEGREDO_CHAVE (22/10/2026).
//
// O que protege: depois de um vazamento de variaveis, as credenciais dos
// escritorios passam para a chave nova sem ninguem reconectar nada; o que ja
// esta na nova fica; o que nao abre com nenhuma e apontado, nao destruido.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { cifrarCom, decifrarCom } from "../src/lib/segredo";
import { recifrarIntegracoes } from "../scripts/trocar-segredo-chave";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

d("trocar a chave das credenciais", () => {
  let esc = "";
  const antiga = randomBytes(32);
  const nova = randomBytes(32);
  const outra = randomBytes(32);

  beforeAll(async () => {
    esc = (await prismaPlataforma().escritorio.create({ data: { slug: `chave-${Date.now()}`, nome: "Banca da Chave" } })).id;
    await comEscritorio(esc, async (db) => {
      await db.integracao.create({ data: semEscritorio({ tipo: "SMTP", dados: cifrarCom({ senha: "s1" }, antiga) }) });
      await db.integracao.create({ data: semEscritorio({ tipo: "ASAAS", dados: cifrarCom({ token: "t2" }, nova) }) });
      await db.integracao.create({ data: semEscritorio({ tipo: "GOOGLE", dados: cifrarCom({ x: 1 }, outra) }) });
    });
  });

  afterAll(async () => {
    if (esc) await prismaPlataforma().escritorio.delete({ where: { id: esc } }).catch(() => {});
  });

  it("recifra o que está na antiga, deixa o que já está na nova, aponta o ilegível", async () => {
    const r = await recifrarIntegracoes(prismaPlataforma(), antiga, nova);
    expect(r.recifradas).toBeGreaterThanOrEqual(1);
    expect(r.jaNaNova).toBeGreaterThanOrEqual(1);
    expect(r.ilegiveis).toContain(`${esc}/GOOGLE`);

    const smtp = await comEscritorio(esc, (db) => db.integracao.findFirstOrThrow({ where: { tipo: "SMTP" } }));
    expect(decifrarCom(smtp.dados, nova)).toEqual({ senha: "s1" });
    expect(() => decifrarCom(smtp.dados, antiga)).toThrow();

    // Rodar de novo nao muda nada: idempotente.
    const r2 = await recifrarIntegracoes(prismaPlataforma(), antiga, nova);
    expect(r2.recifradas).toBe(0);
  });
});
