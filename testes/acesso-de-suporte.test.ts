// Entrar no escritorio como suporte (23/10/2026).
//
// O que protege: o link de suporte so abre o escritorio dele, uma vez, dentro
// do prazo; assinatura adulterada nao passa; o registro nasce antes da
// entrada, com o motivo; encerrar derruba a sessao; sem motivo nao abre.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import {
  AcessoDeSuporteRecusado,
  abrirAcessoDeSuporte,
  acessoDeSuporteValido,
  assinarToken,
  encerrarAcessoDeSuporte,
  lerToken,
  usarLinkDeSuporte,
} from "../src/lib/acesso-de-suporte";

process.env.NEXTAUTH_SECRET ??= "segredo-de-teste-com-tamanho-suficiente";

describe("token do link de suporte", () => {
  it("confere assinatura e prazo", () => {
    const agora = Date.now();
    const t = assinarToken({ acessoId: "a1", escritorioId: "e1", expiraEm: agora + 60_000 });
    expect(lerToken(t, agora)).toEqual({ acessoId: "a1", escritorioId: "e1" });
    expect(lerToken(t, agora + 120_000)).toBeNull();
    const [corpo, assinatura] = t.split(".");
    const outro = Buffer.from(JSON.stringify({ a: "a1", e: "OUTRO", x: agora + 60_000 })).toString("base64url");
    expect(lerToken(`${outro}.${assinatura}`, agora)).toBeNull();
    expect(lerToken(`${corpo}.xx`, agora)).toBeNull();
    expect(lerToken("lixo", agora)).toBeNull();
  });
});

const temBanco = Boolean(process.env.DATABASE_URL);
(temBanco ? describe : describe.skip)("acesso de suporte contra o banco", () => {
  let esc = "";
  let outro = "";
  let operadorId = "";
  let adminId = "";

  beforeAll(async () => {
    esc = (await prismaPlataforma().escritorio.create({ data: { slug: `sup-${Date.now()}`, nome: "Banca do Suporte", status: "ATIVO" } })).id;
    outro = (await prismaPlataforma().escritorio.create({ data: { slug: `sup2-${Date.now()}`, nome: "Outra Banca", status: "ATIVO" } })).id;
    operadorId = (
      await prismaPlataforma().operadorPlataforma.create({ data: { nome: "Op Suporte", email: `op-sup-${Date.now()}@t.test`, senhaHash: "x" } })
    ).id;
    await comEscritorio(esc, async (db) => {
      await db.usuario.create({ data: semEscritorio({ nome: "Apoio", email: `apoio-${Date.now()}@s.test`, senhaHash: "x", papel: "USUARIO" }) });
      adminId = (await db.usuario.create({ data: semEscritorio({ nome: "Dra. Admin", email: `adm-${Date.now()}@s.test`, senhaHash: "x", papel: "ADMIN" }) })).id;
    });
  });

  afterAll(async () => {
    await prismaPlataforma().acessoSuporte.deleteMany({ where: { operadorId } });
    await prismaPlataforma().operadorPlataforma.delete({ where: { id: operadorId } }).catch(() => {});
    for (const id of [esc, outro]) await prismaPlataforma().escritorio.delete({ where: { id } }).catch(() => {});
  });

  it("sem motivo não abre", async () => {
    await expect(abrirAcessoDeSuporte(operadorId, esc, "curto")).rejects.toBeInstanceOf(AcessoDeSuporteRecusado);
  });

  it("registra antes de entrar, entra como o administrador, uma vez só e só no escritório dele", async () => {
    const r = await abrirAcessoDeSuporte(operadorId, esc, "chamado 123: cadastro de clientes");
    const reg = await prismaPlataforma().acessoSuporte.findUniqueOrThrow({ where: { id: r.acessoId } });
    expect(reg.motivo).toContain("chamado 123");
    expect(reg.comoUsuarioId).toBe(adminId);
    expect(reg.linkUsadoEm).toBeNull();

    const token = decodeURIComponent(new URL(r.url).searchParams.get("t")!);
    expect(await usarLinkDeSuporte(token, outro)).toBeNull();
    const usado = await usarLinkDeSuporte(token, esc);
    expect(usado?.usuarioId).toBe(adminId);
    expect(await usarLinkDeSuporte(token, esc)).toBeNull();
    expect(await acessoDeSuporteValido(r.acessoId)).toBe(true);

    await encerrarAcessoDeSuporte(r.acessoId);
    expect(await acessoDeSuporteValido(r.acessoId)).toBe(false);
  });

  it("link vencido não abre", async () => {
    const antes = new Date(Date.now() - 10 * 60_000);
    const r = await abrirAcessoDeSuporte(operadorId, esc, "chamado 456: conferir agenda", antes);
    const token = decodeURIComponent(new URL(r.url).searchParams.get("t")!);
    expect(await usarLinkDeSuporte(token, esc)).toBeNull();
  });
});
