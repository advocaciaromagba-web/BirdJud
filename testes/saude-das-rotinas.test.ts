// Saude das rotinas: o que o vigia externo consulta.
//
// O que se prova: trabalhador sem concluir nada ha 90 minutos e alarme; a
// ultima execucao de uma rotina essencial em FALHOU e alarme; falha seguida
// de sucesso nao e; rotina que nao e essencial nao conta.
//
// Usa um "agora" no futuro: a tabela de trabalhos e da plataforma toda, e os
// trabalhos dos outros testes nao podem entrar na conta.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaPlataforma } from "../src/lib/prisma";
import { saudeDasRotinas } from "../src/lib/saude-das-rotinas";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

const AGORA = new Date("2099-03-10T12:00:00Z");
const antes = (min: number) => new Date(AGORA.getTime() - min * 60_000);

d("saúde das rotinas", () => {
  let esc = "";

  beforeAll(async () => {
    esc = (await prismaPlataforma().escritorio.create({ data: { slug: `saude-${Date.now()}`, nome: "Banca da Saúde" } })).id;
  });

  afterAll(async () => {
    await prismaPlataforma().trabalho.deleteMany({ where: { concluidoEm: { gte: new Date("2099-01-01") } } });
    if (esc) await prismaPlataforma().escritorio.delete({ where: { id: esc } }).catch(() => {});
    await prismaPlataforma().$disconnect();
  });

  const trabalho = (tipo: string, estado: string, minutosAtras: number) =>
    prismaPlataforma().trabalho.create({
      data: { escritorioId: esc, tipo, estado, concluidoEm: antes(minutosAtras), agendadoPara: antes(minutosAtras) },
    });

  it("nada concluído nos últimos 90 minutos: trabalhador parado", async () => {
    await trabalho("LEMBRAR", "CONCLUIDO", 120);
    expect(await saudeDasRotinas(AGORA)).toEqual({ ok: false, trabalhadorParado: true, rotinasFalhando: 0 });
  });

  it("concluindo e sem falha: ok", async () => {
    await trabalho("LEMBRAR", "CONCLUIDO", 10);
    expect(await saudeDasRotinas(AGORA)).toEqual({ ok: true, trabalhadorParado: false, rotinasFalhando: 0 });
  });

  it("última execução de rotina essencial em FALHOU: alarme", async () => {
    await trabalho("LEMBRAR", "FALHOU", 5);
    expect(await saudeDasRotinas(AGORA)).toEqual({ ok: false, trabalhadorParado: false, rotinasFalhando: 1 });
  });

  it("falha seguida de sucesso volta ao normal", async () => {
    await trabalho("LEMBRAR", "CONCLUIDO", 1);
    expect((await saudeDasRotinas(AGORA)).ok).toBe(true);
  });

  it("rotina que não e essencial não dispara", async () => {
    await trabalho("ORGANIZAR_NUVEM", "FALHOU", 1);
    expect((await saudeDasRotinas(AGORA)).ok).toBe(true);
  });
});
