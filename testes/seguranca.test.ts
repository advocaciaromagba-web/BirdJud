// Bateria de seguranca da autenticacao.
//
// Estes casos nasceram de uma revisao adversarial do sistema pronto: cada um
// reproduz um ataque que funcionava antes da correcao. Se um deles voltar a
// falhar, o ataque voltou.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateSync } from "otplib";
import { comEscritorio, prismaPlataforma, semEscritorio } from "../src/lib/prisma";
import { gerarHash } from "../src/lib/senhas";
import { gerarSegredo } from "../src/lib/dois-fatores";
import { opcoesAuth, TENTATIVAS_ATE_BLOQUEIO, TENTATIVAS_DO_OPERADOR } from "../src/lib/auth";
import { PROVEDOR, PROVEDOR_OPERADOR } from "../src/lib/auth-comum";

const temBanco = Boolean(process.env.DATABASE_URL);
const d = temBanco ? describe : describe.skip;

type Credenciais = Record<string, string>;

/**
 * Chama o authorize do provedor, como o NextAuth chamaria.
 *
 * Duas armadilhas do next-auth aqui, e as duas ja morderam este projeto:
 * no objeto pronto, o `id` de cima fica com o padrao "credentials" nos dois
 * provedores (o nosso esta em `options.id`), e o `authorize` de cima e um
 * `() => null` da biblioteca — o nosso esta em `options.authorize`. Chamar o
 * de cima faria todo teste negativo passar sem provar nada.
 */
type ProvedorDeCredenciais = {
  options?: {
    id?: string;
    authorize?: (
      c: Credenciais,
      req: { headers: Record<string, string> }
    ) => Promise<unknown>;
  };
};

function entrar(provedor: string, credenciais: Credenciais, cabecalhos: Record<string, string>) {
  const definicao = (opcoesAuth.providers as unknown as ProvedorDeCredenciais[]).find(
    (p) => p.options?.id === provedor
  );
  const authorize = definicao?.options?.authorize;
  if (!authorize) throw new Error(`Provedor ${provedor} nao encontrado.`);
  return authorize(credenciais, { headers: cabecalhos });
}

const marca = Date.now();
const SLUG = `seg-${marca}`;
const HOST = `${SLUG}.birdjud.com.br`;
const SENHA = "senha-de-teste-123";

let escritorioId = "";
let comSegundoFator = "";
let segredo = "";

d("forca bruta no login", () => {
  beforeAll(async () => {
    process.env.DOMINIO_PLATAFORMA = "birdjud.com.br";

    const escritorio = await prismaPlataforma().escritorio.create({
      data: { slug: SLUG, nome: "Seguranca", status: "ATIVO" },
    });
    escritorioId = escritorio.id;
    segredo = gerarSegredo();

    await comEscritorio(escritorioId, async (db) => {
      await db.usuario.create({
        data: semEscritorio({
          nome: "Sem 2FA",
          email: "simples@teste.br",
          senhaHash: await gerarHash(SENHA),
          papel: "ADMIN",
        }),
      });
      const comFator = await db.usuario.create({
        data: semEscritorio({
          nome: "Com 2FA",
          email: "comfator@teste.br",
          senhaHash: await gerarHash(SENHA),
          papel: "ADMIN",
          doisFatores: segredo,
        }),
      });
      comSegundoFator = comFator.id;
    });
  });

  afterAll(async () => {
    if (escritorioId) {
      await prismaPlataforma().escritorio.delete({ where: { id: escritorioId } }).catch(() => {});
    }
    await prismaPlataforma().$disconnect();
  });

  it("senha certa entra", async () => {
    const sessao = await entrar(
      PROVEDOR,
      { email: "simples@teste.br", senha: SENHA },
      { host: HOST, "x-forwarded-for": `10.0.0.${marca % 200}` }
    );
    expect(sessao).toMatchObject({ escritorioId, papel: "ADMIN" });
  });

  it("codigo de segundo fator errado conta tentativa e acaba bloqueando", async () => {
    // O ataque: quem ja tem a senha (vazamento, reuso) testava o codigo de
    // seis digitos a vontade, porque a falha de 2FA nao contava tentativa.
    const cabecalhos = { host: HOST, "x-forwarded-for": "10.0.1.1" };

    for (let i = 0; i < TENTATIVAS_ATE_BLOQUEIO; i += 1) {
      const sessao = await entrar(
        PROVEDOR,
        { email: "comfator@teste.br", senha: SENHA, codigo: "000000" },
        cabecalhos
      );
      expect(sessao).toBeNull();
    }

    const usuario = await comEscritorio(escritorioId, (db) =>
      db.usuario.findUnique({ where: { id: comSegundoFator } })
    );
    expect(usuario?.tentativasFalhas).toBeGreaterThanOrEqual(TENTATIVAS_ATE_BLOQUEIO);
    expect(usuario?.bloqueadoAte).not.toBeNull();
    expect(usuario!.bloqueadoAte!.getTime()).toBeGreaterThan(Date.now());

    // E, bloqueado, nem o codigo certo entra enquanto o bloqueio durar.
    const comCodigoCerto = await entrar(
      PROVEDOR,
      { email: "comfator@teste.br", senha: SENHA, codigo: generateSync({ secret: segredo }) },
      cabecalhos
    );
    expect(comCodigoCerto).toBeNull();
  });

  it("codigo certo entra quando nao ha bloqueio", async () => {
    await comEscritorio(escritorioId, (db) =>
      db.usuario.update({
        where: { id: comSegundoFator },
        data: { tentativasFalhas: 0, bloqueadoAte: null },
      })
    );

    const sessao = await entrar(
      PROVEDOR,
      { email: "comfator@teste.br", senha: SENHA, codigo: generateSync({ secret: segredo }) },
      { host: HOST, "x-forwarded-for": "10.0.1.2" }
    );
    expect(sessao).toMatchObject({ escritorioId });
  });

  it("uma origem so nao testa senha em conta atras de conta", async () => {
    // O bloqueio por conta nao alcanca isto: a mesma senha em cem contas
    // diferentes nunca bate no limite de nenhuma delas.
    const origem = `10.0.2.${marca % 200}`;
    const cabecalhos = { host: HOST, "x-forwarded-for": origem };

    for (let i = 0; i < 40; i += 1) {
      await entrar(
        PROVEDOR,
        { email: `vitima-${i}@teste.br`, senha: "chute" },
        cabecalhos
      );
    }

    // Depois do teto por origem, nem credencial correta passa daquele IP.
    const sessao = await entrar(
      PROVEDOR,
      { email: "simples@teste.br", senha: SENHA },
      cabecalhos
    );
    expect(sessao).toBeNull();

    // De outra origem, continua entrando: o limite e da origem, nao da conta.
    const deOutroLugar = await entrar(
      PROVEDOR,
      { email: "simples@teste.br", senha: SENHA },
      { host: HOST, "x-forwarded-for": `10.0.3.${marca % 200}` }
    );
    expect(deOutroLugar).toMatchObject({ escritorioId });
  });
});

d("forca bruta no login do operador", () => {
  const email = `operador-${marca}@birdjud.com.br`;

  beforeAll(async () => {
    await prismaPlataforma().operadorPlataforma.create({
      data: { nome: "Operador", email, senhaHash: await gerarHash(SENHA) },
    });
  });

  afterAll(async () => {
    await prismaPlataforma().operadorPlataforma.deleteMany({ where: { email } });
    await prismaPlataforma().$disconnect();
  });

  it("a conta que ve todos os escritorios tambem tem teto de tentativas", async () => {
    // O operador nao tem coluna de bloqueio como o usuario de escritorio;
    // antes da correcao, eram tentativas infinitas contra a senha mais
    // importante do sistema.
    const cabecalhos = { host: "birdjud.com.br", "x-forwarded-for": `10.1.0.${marca % 200}` };

    for (let i = 0; i < TENTATIVAS_DO_OPERADOR + 1; i += 1) {
      const sessao = await entrar(PROVEDOR_OPERADOR, { email, senha: "chute" }, cabecalhos);
      expect(sessao).toBeNull();
    }

    const comSenhaCerta = await entrar(PROVEDOR_OPERADOR, { email, senha: SENHA }, cabecalhos);
    expect(comSenhaCerta).toBeNull();
  });

  it("o login do operador nao existe dentro do subdominio de um escritorio", async () => {
    const sessao = await entrar(
      PROVEDOR_OPERADOR,
      { email, senha: SENHA },
      { host: HOST, "x-forwarded-for": "10.1.1.1" }
    );
    expect(sessao).toBeNull();
  });
});

d("endereco de saude", () => {
  it("responde sem sessao e nao conta nada alem do necessario", async () => {
    const { GET } = await import("../src/app/api/saude/route");
    const resposta = await GET();
    const corpo = (await resposta.json()) as Record<string, unknown>;

    expect(resposta.status).toBe(200);
    // So "ok": nem versao, nem host, nem contagem. E endereco publico.
    expect(Object.keys(corpo)).toEqual(["ok"]);
    expect(corpo.ok).toBe(true);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
  });
});
