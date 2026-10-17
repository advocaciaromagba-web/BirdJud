// "Esqueci a senha" do console: a conta que enxerga todos os escritorios.
//
// O que se prova: e-mail que nao e de operador ativo nao gera link; o link
// vale uma vez so, por 30 minutos, e pedir outro derruba o anterior; senha
// curta e recusada; trocar grava a senha nova, marca a revogacao das sessoes
// antigas e zera o limite de tentativas de entrada da conta.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaPlataforma } from "../src/lib/prisma";
import { conferirSenha, gerarHash } from "../src/lib/senhas";
import { registrarTentativa } from "../src/lib/limite";
import {
  TokenInvalido,
  mensagemDeRedefinicaoDoOperador,
  pedirRedefinicaoDoOperador,
  redefinirSenhaDoOperador,
} from "../src/lib/redefinicao-do-operador";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

describe("e-mail da redefinicao", () => {
  it("diz a validade, o uso unico e o que fazer se nao foi voce", () => {
    const m = mensagemDeRedefinicaoDoOperador({ nome: "Operador", link: "https://birdjud.com.br/plataforma/redefinir-senha?t=x" });
    expect(m.texto).toContain("30 minutos e uma unica vez");
    expect(m.texto).toContain("Se nao foi voce");
    expect(m.texto).toContain("https://birdjud.com.br/plataforma/redefinir-senha?t=x");
  });
});

d("redefinicao da senha do operador", () => {
  const marca = Date.now();
  const email = `op-${marca}@teste.local`;
  const inativo = `op-inativo-${marca}@teste.local`;
  let id = "";

  beforeAll(async () => {
    id = (await prismaPlataforma().operadorPlataforma.create({
      data: { nome: "Op Teste", email, senhaHash: await gerarHash("senha-antiga-de-operador") },
    })).id;
    await prismaPlataforma().operadorPlataforma.create({
      data: { nome: "Op Inativo", email: inativo, senhaHash: "x", ativo: false },
    });
  });

  afterAll(async () => {
    await prismaPlataforma().operadorPlataforma.deleteMany({ where: { email: { in: [email, inativo] } } });
    await prismaPlataforma().limiteDeTaxa.deleteMany({ where: { chave: `operador:${email}` } });
  });

  it("e-mail que nao e de operador ativo nao gera link", async () => {
    expect(await pedirRedefinicaoDoOperador(`ninguem-${marca}@teste.local`, null)).toBeNull();
    expect(await pedirRedefinicaoDoOperador(inativo, null)).toBeNull();
  });

  it("o link troca a senha uma vez so, e derruba as sessoes antigas", async () => {
    // Antes: tentativas erradas de entrada acumuladas na conta.
    await registrarTentativa(`operador:${email}`, 5, 3600);
    const pedido = await pedirRedefinicaoDoOperador(email.toUpperCase(), "1.2.3.4");
    expect(pedido).not.toBeNull();

    await redefinirSenhaDoOperador(pedido!.token, "senha-nova-do-console-123");
    const op = await prismaPlataforma().operadorPlataforma.findUniqueOrThrow({ where: { id } });
    expect(await conferirSenha("senha-nova-do-console-123", op.senhaHash)).toBe(true);
    expect(await conferirSenha("senha-antiga-de-operador", op.senhaHash)).toBe(false);
    expect(op.sessoesValidasApos).not.toBeNull();
    expect(await prismaPlataforma().limiteDeTaxa.count({ where: { chave: `operador:${email}` } })).toBe(0);

    await expect(redefinirSenhaDoOperador(pedido!.token, "outra-senha-qualquer-1")).rejects.toThrow(TokenInvalido);
  });

  it("pedir de novo derruba o link anterior", async () => {
    const primeiro = await pedirRedefinicaoDoOperador(email, null);
    const segundo = await pedirRedefinicaoDoOperador(email, null);
    await expect(redefinirSenhaDoOperador(primeiro!.token, "senha-nova-do-console-456")).rejects.toThrow(TokenInvalido);
    await redefinirSenhaDoOperador(segundo!.token, "senha-nova-do-console-456");
  });

  it("link vencido (30 minutos) nao vale", async () => {
    const pedido = await pedirRedefinicaoDoOperador(email, null, new Date(Date.now() - 31 * 60_000));
    await expect(redefinirSenhaDoOperador(pedido!.token, "senha-nova-do-console-789")).rejects.toThrow(TokenInvalido);
  });

  it("senha com menos de 12 caracteres e recusada, e o link continua valendo", async () => {
    const pedido = await pedirRedefinicaoDoOperador(email, null);
    await expect(redefinirSenhaDoOperador(pedido!.token, "curta-1")).rejects.toThrow(/12 caracteres/);
    await redefinirSenhaDoOperador(pedido!.token, "agora-sim-uma-senha-longa");
  });

  it("token inventado nao vale", async () => {
    await expect(redefinirSenhaDoOperador("x".repeat(43), "senha-nova-do-console-000")).rejects.toThrow(TokenInvalido);
  });
});
