// Bateria de isolamento — escrita ANTES das rotas, de proposito.
//
// Cria dois escritorios e tenta, a partir de um, ler / alterar / apagar dados
// do outro. Nenhuma tentativa pode funcionar. Roda antes de todo deploy.
//
// Precisa de um banco de testes com o schema aplicado E com prisma/rls.sql
// rodado (npm run rls:aplicar). Sem DATABASE_URL, os testes sao pulados.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comEscritorio,
  prisma,
  prismaPlataforma,
  prismaSemEscritorio,
  semEscritorio,
} from "../src/lib/prisma";
import { escritorioPorSlug } from "../src/lib/escritorio";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

let alfa = "";
let beta = "";
let clienteDeBeta = "";

d("isolamento entre escritorios", () => {
  beforeAll(async () => {
    const a = await prismaPlataforma().escritorio.create({
      data: { slug: `alfa-${Date.now()}`, nome: "Escritorio Alfa" },
    });
    const b = await prismaPlataforma().escritorio.create({
      data: { slug: `beta-${Date.now()}`, nome: "Escritorio Beta" },
    });
    alfa = a.id;
    beta = b.id;

    await comEscritorio(alfa, (db) =>
      db.cliente.create({ data: semEscritorio({ nome: "Cliente de Alfa" }) }),
    );
    const c = await comEscritorio(beta, (db) =>
      db.cliente.create({ data: semEscritorio({ nome: "Cliente de Beta" }) }),
    );
    clienteDeBeta = c.id;
  });

  afterAll(async () => {
    for (const id of [alfa, beta]) {
      if (id)
        await prismaPlataforma()
          .escritorio.delete({ where: { id } })
          .catch(() => {});
    }
    await prismaPlataforma().$disconnect();
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
      db.cliente.findFirst({ where: { id: clienteDeBeta } }),
    );
    expect(achado).toBeNull();
  });

  it("alteracao de registro de outro escritorio nao afeta nada", async () => {
    const r = await comEscritorio(alfa, (db) =>
      db.cliente.updateMany({
        where: { id: clienteDeBeta },
        data: { nome: "invadido" },
      }),
    );
    expect(r.count).toBe(0);

    const intacto = await comEscritorio(beta, (db) =>
      db.cliente.findFirst({ where: { id: clienteDeBeta } }),
    );
    expect(intacto?.nome).toBe("Cliente de Beta");
  });

  it("exclusao de registro de outro escritorio nao afeta nada", async () => {
    const r = await comEscritorio(alfa, (db) =>
      db.cliente.deleteMany({ where: { id: clienteDeBeta } }),
    );
    expect(r.count).toBe(0);
  });

  it("criacao nao consegue forjar outro escritorio no payload", async () => {
    const criado = await comEscritorio(alfa, (db) =>
      // escritorioId injetado pela extensao sobrepoe o que vier do chamador
      db.cliente.create({
        data: { nome: "Forjado", escritorioId: beta } as never,
      }),
    );
    expect(criado.escritorioId).toBe(alfa);
  });

  it("trava 2 sozinha: sem app.escritorio_id o banco nao devolve nada", async () => {
    // Driblando a trava de codigo de proposito: conexao da aplicacao, sem a
    // extensao e fora de comEscritorio(). So o RLS esta protegendo aqui.
    const linhas = await prismaSemEscritorio.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Cliente"
    `;
    expect(linhas).toHaveLength(0);
  });

  it("trava 2 sozinha: insercao sem app.escritorio_id e recusada", async () => {
    await expect(
      prismaSemEscritorio.$executeRaw`
        INSERT INTO "Cliente" ("id", "escritorioId", "nome", "atualizadoEm")
        VALUES ('forjado', ${beta}, 'Forjado', now())
      `,
    ).rejects.toThrow();
  });

  it("marca do subdominio e legivel antes do login, sem vazar negocio", async () => {
    const slug = (await prismaPlataforma().escritorio.findUnique({
      where: { id: alfa },
    }))!.slug;
    const marca = await escritorioPorSlug(slug);
    expect(marca?.nome).toBe("Escritorio Alfa");
    expect(marca).not.toHaveProperty("cnpj");
  });

  it("RLS barra a consulta crua quando app.escritorio_id e de outro escritorio", async () => {
    const linhas = await comEscritorio(
      alfa,
      (db) =>
        db.$queryRaw<
          { id: string }[]
        >`SELECT id FROM "Cliente" WHERE id = ${clienteDeBeta}`,
    );
    expect(linhas).toHaveLength(0);
  });
});

/**
 * Prazos, isolados.
 *
 * Tabela nova ganha teste de isolamento proprio, sempre. A regra do porte diz
 * isso, e aqui ela custa pouco: funcao vinda de um sistema de escritorio unico
 * supoe que "o escritorio" e implicito, e esse e o jeito de quebrar o
 * isolamento sem produzir erro nenhum.
 */
d("isolamento dos prazos", () => {
  let alfaP = "";
  let betaP = "";
  let prazoDeBeta = "";

  beforeAll(async () => {
    const a = await prismaPlataforma().escritorio.create({
      data: { slug: `pz-alfa-${Date.now()}`, nome: "Prazo Alfa" },
    });
    const b = await prismaPlataforma().escritorio.create({
      data: { slug: `pz-beta-${Date.now()}`, nome: "Prazo Beta" },
    });
    alfaP = a.id;
    betaP = b.id;

    await comEscritorio(alfaP, (db) =>
      db.prazo.create({
        data: semEscritorio({
          titulo: "Contestacao de Alfa",
          termoInicial: new Date("2026-10-08T00:00:00Z"),
          dias: 15,
          contagem: "UTEIS",
          inicioContagem: new Date("2026-10-09T00:00:00Z"),
          vencimento: new Date("2026-10-30T00:00:00Z"),
          explicacao: "teste",
        }),
      }),
    );
    const p = await comEscritorio(betaP, (db) =>
      db.prazo.create({
        data: semEscritorio({
          titulo: "Recurso de Beta",
          termoInicial: new Date("2026-10-08T00:00:00Z"),
          dias: 15,
          contagem: "UTEIS",
          inicioContagem: new Date("2026-10-09T00:00:00Z"),
          vencimento: new Date("2026-10-30T00:00:00Z"),
          explicacao: "teste",
        }),
      }),
    );
    prazoDeBeta = p.id;
  });

  afterAll(async () => {
    for (const id of [alfaP, betaP]) {
      if (id)
        await prismaPlataforma()
          .escritorio.delete({ where: { id } })
          .catch(() => {});
    }
  });

  it("um escritorio nao ve o prazo do outro", async () => {
    const vistos = await comEscritorio(alfaP, (db) => db.prazo.findMany());
    expect(vistos).toHaveLength(1);
    expect(vistos[0]!.titulo).toBe("Contestacao de Alfa");
  });

  it("marcar como cumprido o prazo de outro escritorio nao afeta nada", async () => {
    const r = await comEscritorio(alfaP, (db) =>
      db.prazo.updateMany({
        where: { id: prazoDeBeta },
        data: { cumpridoEm: new Date() },
      }),
    );
    expect(r.count).toBe(0);
    const intacto = await comEscritorio(betaP, (db) =>
      db.prazo.findFirst({ where: { id: prazoDeBeta } }),
    );
    expect(intacto?.cumpridoEm).toBeNull();
  });

  it("o calendario de um escritorio nao vale para o outro", async () => {
    await comEscritorio(alfaP, (db) =>
      db.diaSemExpediente.create({
        data: semEscritorio({
          dia: new Date("2026-10-14T00:00:00Z"),
          motivo: "feriado so da comarca de Alfa",
        }),
      }),
    );
    const deBeta = await comEscritorio(betaP, (db) =>
      db.diaSemExpediente.findMany(),
    );
    expect(deBeta).toHaveLength(0);
  });
});
