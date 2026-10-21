// Editar a equipe (21/10/2026).
//
// O que protege o escritorio: ninguem se desativa; o ultimo administrador
// fica; mudar de apoio para advogado ocupa vaga; desativar derruba a sessao
// na hora; e-mail repetido e recusado.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { editarPessoa, EdicaoRecusada, incluirPessoa } from "../src/lib/equipe";
import { FaixaEsgotada } from "../src/lib/faixas";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

d("edição da equipe", () => {
  let esc = "";
  let admin = "";
  let apoio = "";

  beforeAll(async () => {
    // Faixa ATE_1: 1 advogado e 2 de apoio. O administrador ja ocupa a de advogado.
    esc = (await prismaPlataforma().escritorio.create({ data: { slug: `equipe-${Date.now()}`, nome: "Banca da Equipe", faixa: "ATE_1" } })).id;
    admin = (await incluirPessoa(esc, { nome: "Dra. Admin", email: `admin-${Date.now()}@eq.test`, papel: "ADMIN", senha: "senha-forte-10" })).id;
    apoio = (await incluirPessoa(esc, { nome: "Apoio", email: `apoio-${Date.now()}@eq.test`, papel: "USUARIO", senha: "senha-forte-10" })).id;
  });

  afterAll(async () => {
    if (esc) await prismaPlataforma().escritorio.delete({ where: { id: esc } }).catch(() => {});
  });

  it("corrige nome, e-mail, OAB e telefone", async () => {
    const r = await editarPessoa(esc, apoio, { nome: "Apoio Corrigido", email: `Novo-${Date.now()}@EQ.test`, telefone: "(16) 99999-0000" }, admin);
    expect(r.nome).toBe("Apoio Corrigido");
    expect(r.email).toMatch(/^novo-.*@eq\.test$/);
    const no = await comEscritorio(esc, (db) => db.usuario.findFirstOrThrow({ where: { id: apoio } }));
    expect(no.telefone).toBe("(16) 99999-0000");
  });

  it("ninguém desativa a si mesmo, e o único administrador fica", async () => {
    await expect(editarPessoa(esc, admin, { ativo: false }, admin)).rejects.toBeInstanceOf(EdicaoRecusada);
    await expect(editarPessoa(esc, admin, { papel: "USUARIO" }, admin)).rejects.toBeInstanceOf(EdicaoRecusada);
    // Outro administrador tentando rebaixar o unico ativo: tambem nao.
    await expect(editarPessoa(esc, admin, { papel: "ADVOGADO" }, apoio)).rejects.toBeInstanceOf(EdicaoRecusada);
  });

  it("apoio virar advogado ocupa vaga; sem vaga, recusa", async () => {
    // ATE_1 tem 1 advogado, ja ocupado pelo administrador.
    await expect(editarPessoa(esc, apoio, { papel: "ADVOGADO" }, admin)).rejects.toBeInstanceOf(FaixaEsgotada);
  });

  it("desativar derruba a sessão e libera a vaga; reativar ocupa de novo", async () => {
    const antes = new Date();
    const r = await editarPessoa(esc, apoio, { ativo: false }, admin);
    expect(r.ativo).toBe(false);
    const u = await comEscritorio(esc, (db) => db.usuario.findFirstOrThrow({ where: { id: apoio } }));
    expect(u.sessoesValidasApos && u.sessoesValidasApos >= antes).toBe(true);

    // Com o apoio desativado, a segunda pessoa de apoio entra na vaga dele.
    const outra = await incluirPessoa(esc, { nome: "Outra", email: `outra-${Date.now()}@eq.test`, papel: "USUARIO", senha: "senha-forte-10" });
    const terceira = await incluirPessoa(esc, { nome: "Terceira", email: `terceira-${Date.now()}@eq.test`, papel: "USUARIO", senha: "senha-forte-10" });
    expect(outra.id && terceira.id).toBeTruthy();
    // Apoio esgotado (2 de 2): reativar o primeiro nao cabe.
    await expect(editarPessoa(esc, apoio, { ativo: true }, admin)).rejects.toBeInstanceOf(FaixaEsgotada);
    await editarPessoa(esc, terceira.id, { ativo: false }, admin);
    expect((await editarPessoa(esc, apoio, { ativo: true }, admin)).ativo).toBe(true);
  });

  it("e-mail de outra pessoa do escritório é recusado", async () => {
    const adminAtual = await comEscritorio(esc, (db) => db.usuario.findFirstOrThrow({ where: { id: admin } }));
    await expect(editarPessoa(esc, apoio, { email: adminAtual.email }, admin)).rejects.toMatchObject({ code: "P2002" });
  });
});
