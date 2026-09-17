// Regras da fase 1 que dependem do banco: troca de senha, ativacao do
// segundo fator e cadastro de usuario pelo admin.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateSync } from "otplib";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { conferirSenha, gerarHash } from "../src/lib/senhas";
import { conferirCodigo, gerarSegredo } from "../src/lib/dois-fatores";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

let escritorio = "";
let usuarioId = "";

d("conta do usuario", () => {
  beforeAll(async () => {
    const e = await prismaPlataforma().escritorio.create({
      data: { slug: `conta-${Date.now()}`, nome: "Escritorio da Conta" },
    });
    escritorio = e.id;
    const usuario = await comEscritorio(escritorio, async (db) =>
      db.usuario.create({
        data: semEscritorio({
          nome: "Titular",
          email: "titular@exemplo.adv.br",
          senhaHash: await gerarHash("senha-inicial-123"),
          papel: "ADMIN",
          advogado: true,
        }),
      })
    );
    usuarioId = usuario.id;
  });

  afterAll(async () => {
    if (escritorio) {
      await prismaPlataforma().escritorio.delete({ where: { id: escritorio } }).catch(() => {});
    }
    await prismaPlataforma().$disconnect();
  });

  it("troca a senha e a antiga deixa de valer", async () => {
    const novo = await gerarHash("outra-senha-bem-longa");
    await comEscritorio(escritorio, (db) =>
      db.usuario.update({ where: { id: usuarioId }, data: { senhaHash: novo } })
    );

    const usuario = await comEscritorio(escritorio, (db) =>
      db.usuario.findFirstOrThrow({ where: { id: usuarioId } })
    );
    await expect(conferirSenha("outra-senha-bem-longa", usuario.senhaHash)).resolves.toBe(true);
    await expect(conferirSenha("senha-inicial-123", usuario.senhaHash)).resolves.toBe(false);
  });

  it("o segredo do 2FA so vale depois de confirmado com um codigo", async () => {
    const segredo = gerarSegredo();
    // Codigo errado nao deveria gravar nada.
    expect(await conferirCodigo("000000", segredo)).toBe(false);

    const codigo = generateSync({ secret: segredo });
    expect(await conferirCodigo(codigo, segredo)).toBe(true);

    await comEscritorio(escritorio, (db) =>
      db.usuario.update({ where: { id: usuarioId }, data: { doisFatores: segredo } })
    );
    const usuario = await comEscritorio(escritorio, (db) =>
      db.usuario.findFirstOrThrow({ where: { id: usuarioId } })
    );
    expect(usuario.doisFatores).toBe(segredo);
  });

  it("e-mail repetido no mesmo escritorio e recusado", async () => {
    await expect(
      comEscritorio(escritorio, async (db) =>
        db.usuario.create({
          data: semEscritorio({
            nome: "Repetido",
            email: "titular@exemplo.adv.br",
            senhaHash: await gerarHash("mais-uma-senha-123"),
            papel: "USUARIO",
          }),
        })
      )
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("o mesmo e-mail pode existir em outro escritorio", async () => {
    const outro = await prismaPlataforma().escritorio.create({
      data: { slug: `outro-${Date.now()}`, nome: "Outro Escritorio" },
    });
    try {
      const usuario = await comEscritorio(outro.id, async (db) =>
        db.usuario.create({
          data: semEscritorio({
            nome: "Homonimo",
            email: "titular@exemplo.adv.br",
            senhaHash: await gerarHash("senha-do-outro-123"),
            papel: "ADMIN",
          }),
        })
      );
      expect(usuario.escritorioId).toBe(outro.id);
    } finally {
      await prismaPlataforma().escritorio.delete({ where: { id: outro.id } }).catch(() => {});
    }
  });
});
