// Bateria de isolamento — escrita ANTES das rotas, de proposito.
//
// Cria dois escritorios e tenta, a partir de um, ler / alterar / apagar dados
// do outro. Nenhuma tentativa pode funcionar. Roda antes de todo deploy.
//
// Precisa de um banco de testes com o schema aplicado E com prisma/rls.sql
// rodado (npm run rls:aplicar). Sem DATABASE_URL, os testes sao pulados.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prisma, prismaPlataforma } from "../src/lib/prisma";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

let alfa = "";
let beta = "";
let clienteDeBeta = "";

d("isolamento entre escritorios", () => {
  beforeAll(async () => {
    const a = await prismaPlataforma.escritorio.create({
      data: { slug: `alfa-${Date.now()}`, nome: "Escritorio Alfa" },
    });
    const b = await prismaPlataforma.escritorio.create({
      data: { slug: `beta-${Date.now()}`, nome: "Escritorio Beta" },
    });
    alfa = a.id;
    beta = b.id;

    await comEscritorio(alfa, (db) =>
      db.cliente.create({ data: { nome: "Cliente de Alfa" } })
    );
    const c = await comEscritorio(beta, (db) =>
      db.cliente.create({ data: { nome: "Cliente de Beta" } })
    );
    clienteDeBeta = c.id;
  });

  afterAll(async () => {
    for (const id of [alfa, beta]) {
      if (id) await prismaPlataforma.escritorio.delete({ where: { id } }).catch(() => {});
    }
    await prismaPlataforma.$disconnect();
  });

  it("consulta fora de comEscritorio() nao roda", async () => {
    await expect(prisma.cliente.findMany()).rejects.toThrow(/sem escritorio/i);
  });

  it("listagem so devolve os proprios registros", async () => {
    const vistos = await comEscritorio(alfa, (db) => db.cliente.findMany());
    expect(vistos).toHaveLength(1);
    expect(vistos[0]?.nome).toBe("Cliente de Alfa");
  });

  it("busca por id de outro escritorio nao encontra", async () => {
    const achado = await comEscritorio(alfa, (db) =>
      db.cliente.findFirst({ where: { id: clienteDeBeta } })
    );
    expect(achado).toBeNull();
  });

  it("alteracao de registro de outro escritorio nao afeta nada", async () => {
    const r = await comEscritorio(alfa, (db) =>
      db.cliente.updateMany({ where: { id: clienteDeBeta }, data: { nome: "invadido" } })
    );
    expect(r.count).toBe(0);

    const intacto = await comEscritorio(beta, (db) =>
      db.cliente.findFirst({ where: { id: clienteDeBeta } })
    );
    expect(intacto?.nome).toBe("Cliente de Beta");
  });

  it("exclusao de registro de outro escritorio nao afeta nada", async () => {
    const r = await comEscritorio(alfa, (db) =>
      db.cliente.deleteMany({ where: { id: clienteDeBeta } })
    );
    expect(r.count).toBe(0);
  });

  it("criacao nao consegue forjar outro escritorio no payload", async () => {
    const criado = await comEscritorio(alfa, (db) =>
      // escritorioId injetado pela extensao sobrepoe o que vier do chamador
      db.cliente.create({ data: { nome: "Forjado", escritorioId: beta } as never })
    );
    expect(criado.escritorioId).toBe(alfa);
  });

  it("RLS barra a consulta crua quando app.escritorio_id e de outro escritorio", async () => {
    const linhas = await comEscritorio(alfa, (db) =>
      db.$queryRaw<{ id: string }[]>`SELECT id FROM "Cliente" WHERE id = ${clienteDeBeta}`
    );
    expect(linhas).toHaveLength(0);
  });
});
