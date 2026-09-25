// Recuperacao de senha.
//
// O que se prova: o banco guarda o hash e nao o token; o link vale uma vez e
// por uma hora; pedir de novo derruba o anterior; trocar a senha encerra as
// sessoes abertas e solta o bloqueio por tentativas; e o token de um
// escritorio nao serve em outro.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  comEscritorio,
  prismaPlataforma,
  semEscritorio,
} from "../src/lib/prisma";
import { conferirSenha, gerarHash } from "../src/lib/senhas";
import {
  criarPedido,
  hashDoToken,
  limparPedidosVencidos,
  mensagemDeRedefinicao,
  mensagemDeConvite,
  redefinirComToken,
  TokenInvalido,
  validadeEmMinutos,
  VALIDADE_DO_CONVITE_MINUTOS,
  VALIDADE_MINUTOS,
} from "../src/lib/redefinicao";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;
const MINUTO = 60 * 1000;

let alfa = "";
let beta = "";
let usuarioAlfa = "";
let usuarioBeta = "";

async function criarUsuario(
  escritorioId: string,
  email: string,
): Promise<string> {
  const usuario = await comEscritorio(escritorioId, async (db) =>
    db.usuario.create({
      data: semEscritorio({
        nome: "Titular",
        email,
        senhaHash: await gerarHash("senha-antiga-123"),
        papel: "ADMIN",
        advogado: true,
      }),
    }),
  );
  return usuario.id;
}

describe("texto do e-mail", () => {
  it("diz o prazo e o que fazer se nao foi voce", () => {
    const mensagem = mensagemDeRedefinicao({
      nomeDoEscritorio: "Escritorio Teste",
      link: "https://teste.birdjud.com.br/redefinir-senha?t=abc",
      validadeMinutos: VALIDADE_MINUTOS,
    });
    expect(mensagem.assunto).toContain("Escritorio Teste");
    expect(mensagem.texto).toContain(
      "https://teste.birdjud.com.br/redefinir-senha?t=abc",
    );
    expect(mensagem.texto).toContain("60 minutos");
    expect(mensagem.texto).toContain("Se nao foi voce");
    // Nada de senha, nem de e-mail de terceiro, no corpo da mensagem.
    expect(mensagem.texto).not.toContain("senha-");
  });
});

d("redefinicao de senha", () => {
  beforeAll(async () => {
    const marca = Date.now();
    const a = await prismaPlataforma().escritorio.create({
      data: { slug: `redef-a-${marca}`, nome: "Escritorio Alfa" },
    });
    const b = await prismaPlataforma().escritorio.create({
      data: { slug: `redef-b-${marca}`, nome: "Escritorio Beta" },
    });
    alfa = a.id;
    beta = b.id;
    usuarioAlfa = await criarUsuario(alfa, "titular@alfa.adv.br");
    usuarioBeta = await criarUsuario(beta, "titular@beta.adv.br");
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

  it("guarda o hash do token, nunca o token", async () => {
    const { token } = await criarPedido(alfa, usuarioAlfa, "1.2.3.4");

    const pedidos = await comEscritorio(alfa, (db) =>
      db.redefinicaoDeSenha.findMany({ where: { usuarioId: usuarioAlfa } }),
    );
    const guardado = pedidos.find((pedido) => pedido.usadoEm === null);

    expect(guardado).toBeTruthy();
    expect(guardado!.tokenHash).toBe(hashDoToken(token));
    expect(guardado!.tokenHash).not.toBe(token);
    // O token nao aparece em campo nenhum da linha.
    expect(JSON.stringify(guardado)).not.toContain(token);
  });

  it("troca a senha, encerra as sessoes e solta o bloqueio", async () => {
    await comEscritorio(alfa, (db) =>
      db.usuario.update({
        where: { id: usuarioAlfa },
        data: {
          tentativasFalhas: 5,
          bloqueadoAte: new Date(Date.now() + 10 * MINUTO),
          sessoesValidasApos: null,
        },
      }),
    );

    const { token } = await criarPedido(alfa, usuarioAlfa, null);
    const email = await redefinirComToken(alfa, token, "senha-nova-4321");
    expect(email).toBe("titular@alfa.adv.br");

    const usuario = await comEscritorio(alfa, (db) =>
      db.usuario.findFirst({ where: { id: usuarioAlfa } }),
    );
    expect(await conferirSenha("senha-nova-4321", usuario!.senhaHash)).toBe(
      true,
    );
    expect(await conferirSenha("senha-antiga-123", usuario!.senhaHash)).toBe(
      false,
    );
    expect(usuario!.tentativasFalhas).toBe(0);
    expect(usuario!.bloqueadoAte).toBeNull();
    expect(usuario!.sessoesValidasApos).not.toBeNull();
  });

  it("o mesmo link nao serve duas vezes", async () => {
    const { token } = await criarPedido(alfa, usuarioAlfa, null);
    await redefinirComToken(alfa, token, "senha-nova-5555");
    await expect(
      redefinirComToken(alfa, token, "outra-senha-6666"),
    ).rejects.toThrow(TokenInvalido);
  });

  it("pedir de novo derruba o link anterior", async () => {
    const primeiro = await criarPedido(alfa, usuarioAlfa, null);
    const segundo = await criarPedido(alfa, usuarioAlfa, null);

    await expect(
      redefinirComToken(alfa, primeiro.token, "senha-nova-7777"),
    ).rejects.toThrow(TokenInvalido);
    await expect(
      redefinirComToken(alfa, segundo.token, "senha-nova-8888"),
    ).resolves.toBe("titular@alfa.adv.br");
  });

  it("link vencido nao vale", async () => {
    const { token } = await criarPedido(alfa, usuarioAlfa, null);
    const daquiA61Minutos = new Date(Date.now() + 61 * MINUTO);

    await expect(
      redefinirComToken(alfa, token, "senha-nova-9999", daquiA61Minutos),
    ).rejects.toThrow(TokenInvalido);
  });

  it("o token de um escritorio nao serve no outro", async () => {
    const { token } = await criarPedido(beta, usuarioBeta, null);

    // Tentar usar no Alfa nao acha nada: a extensao filtra por escritorio.
    await expect(
      redefinirComToken(alfa, token, "senha-nova-1111"),
    ).rejects.toThrow(TokenInvalido);

    // E a senha do Beta continua a antiga.
    const usuario = await comEscritorio(beta, (db) =>
      db.usuario.findFirst({ where: { id: usuarioBeta } }),
    );
    expect(await conferirSenha("senha-antiga-123", usuario!.senhaHash)).toBe(
      true,
    );
  });

  it("usuario desativado nao redefine senha", async () => {
    const { token } = await criarPedido(beta, usuarioBeta, null);
    await comEscritorio(beta, (db) =>
      db.usuario.update({ where: { id: usuarioBeta }, data: { ativo: false } }),
    );

    await expect(
      redefinirComToken(beta, token, "senha-nova-2222"),
    ).rejects.toThrow(TokenInvalido);

    await comEscritorio(beta, (db) =>
      db.usuario.update({ where: { id: usuarioBeta }, data: { ativo: true } }),
    );
  });

  it("a limpeza tira o que venceu e o que ja foi usado", async () => {
    const { token } = await criarPedido(alfa, usuarioAlfa, null);
    await redefinirComToken(alfa, token, "senha-nova-3333");
    await criarPedido(alfa, usuarioAlfa, null);

    const apagados = await limparPedidosVencidos(alfa);
    expect(apagados).toBeGreaterThan(0);

    const sobraram = await comEscritorio(alfa, (db) =>
      db.redefinicaoDeSenha.findMany({ where: { usuarioId: usuarioAlfa } }),
    );
    // So o pedido em aberto sobrou.
    expect(sobraram).toHaveLength(1);
    expect(sobraram[0].usadoEm).toBeNull();
  });
});

d("convite de usuario", () => {
  let escritorio = "";
  let convidado = "";

  beforeAll(async () => {
    const e = await prismaPlataforma().escritorio.create({
      data: { slug: `convite-${Date.now()}`, nome: "Escritorio do Convite" },
    });
    escritorio = e.id;
    convidado = await criarUsuario(escritorio, "novato@convite.adv.br");
  });

  afterAll(async () => {
    if (escritorio) {
      await prismaPlataforma()
        .escritorio.delete({ where: { id: escritorio } })
        .catch(() => {});
    }
  });

  it("convite vale dias; redefinicao vale uma hora", () => {
    expect(validadeEmMinutos("CONVITE")).toBe(VALIDADE_DO_CONVITE_MINUTOS);
    expect(validadeEmMinutos("REDEFINICAO")).toBe(VALIDADE_MINUTOS);
    expect(VALIDADE_DO_CONVITE_MINUTOS).toBeGreaterThan(VALIDADE_MINUTOS);
  });

  it("o pedido guarda o tipo, e o convite expira depois", async () => {
    const agora = new Date();
    const convite = await criarPedido(
      escritorio,
      convidado,
      null,
      "CONVITE",
      agora,
    );

    const pedido = await comEscritorio(escritorio, (db) =>
      db.redefinicaoDeSenha.findFirst({
        where: { usuarioId: convidado, usadoEm: null },
      }),
    );

    expect(pedido!.tipo).toBe("CONVITE");
    const horas =
      (convite.expiraEm.getTime() - agora.getTime()) / (60 * 60 * 1000);
    expect(horas).toBeGreaterThan(24);
  });

  it("o convite troca a senha pelo mesmo caminho da redefinicao", async () => {
    const { token } = await criarPedido(escritorio, convidado, null, "CONVITE");
    await expect(
      redefinirComToken(escritorio, token, "primeira-senha-123"),
    ).resolves.toBe("novato@convite.adv.br");
  });

  it("o texto do convite diz quem convidou, o prazo e o que fazer se nao esperava", () => {
    const mensagem = mensagemDeConvite({
      nomeDoEscritorio: "Escritorio do Convite",
      nomeDeQuemConvidou: "Helena Vasconcelos",
      link: "https://convite.birdjud.com.br/redefinir-senha?t=abc&c=1",
      validadeMinutos: VALIDADE_DO_CONVITE_MINUTOS,
    });

    expect(mensagem.assunto).toContain("Escritorio do Convite");
    expect(mensagem.texto).toContain("Helena Vasconcelos");
    expect(mensagem.texto).toContain("7 dia(s)");
    expect(mensagem.texto).toContain("nao esperava este convite");
    // Convite nunca CARREGA senha: o que vai e o link. (O texto fala em
    // "escolher sua senha", o que e outra coisa — por isso a regra e sobre
    // senha atribuida, "senha: xxx", e nao sobre a palavra.)
    expect(mensagem.texto).not.toMatch(/senha\s*[:=]/i);
  });
});
