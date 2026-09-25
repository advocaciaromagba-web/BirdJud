import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio, prismaPlataforma, semEscritorio } from "@/lib/prisma";
import { criarAssinatura } from "@/lib/cobranca";
import { DIAS_DE_TESTE } from "@/lib/precos";
import { MODULOS, type Modulo } from "@/lib/catalogo";
import { contaMontada, modulosDoPlano } from "@/lib/planos";
import { definirModulos } from "@/lib/contratacao";

// Todo escritorio novo entra como solo. Quem tem mais advogados sobe de faixa
// na primeira conversa — e ate la nao paga por vaga que nao usa.
const FAIXA_INICIAL = "ATE_1" as const;
import { gerarHash } from "@/lib/senhas";
import { slugDoHost } from "@/lib/subdominio";
import { ipDaRequisicao, registrarAceite } from "@/lib/aceite";
import { registrarTentativa } from "@/lib/limite";
import { VERSAO_DOS_DOCUMENTOS } from "@/lib/juridico";
import { ehDuplicado, tratarErro } from "@/lib/respostas";
import { dominioDaPlataforma } from "@/lib/dominio";

const RESERVADOS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "painel",
  "plataforma",
  "suporte",
]);

const cadastro = z.object({
  escritorio: z.string().min(2).max(120),
  slug: z
    .string()
    .min(3)
    .max(40)
    .regex(
      /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
      "O endereco aceita letras minusculas, numeros e hifen.",
    ),
  nome: z.string().min(2).max(120),
  email: z.string().email(),
  senha: z.string().min(10, "A senha precisa ter ao menos 10 caracteres."),
  // O aceite e do contrato, dos termos e do acordo de LGPD, na versao vigente.
  // O plano escolhido chega como a lista de modulos, nao como o nome do
  // plano: quem monta o proprio conjunto tambem passa por aqui, e o preco
  // sai da mesma conta nos dois casos.
  modulos: z.array(z.enum(MODULOS)).max(MODULOS.length).optional(),
  aceite: z.literal(true, {
    errorMap: () => ({
      message: "E preciso aceitar os documentos para continuar.",
    }),
  }),
  versaoAceita: z.string(),
});

/**
 * Cadastro de escritorio novo, em periodo de teste.
 *
 * So responde no endereco da plataforma: de dentro do subdominio de um
 * escritorio nao se cria outro escritorio.
 */
export async function POST(req: Request) {
  try {
    if (slugDoHost(req.headers.get("host"))) {
      return NextResponse.json(
        { erro: "O cadastro e feito no endereco da plataforma." },
        { status: 400 },
      );
    }

    // Cadastro e a unica rota publica que escreve no banco: sem limite, um
    // script cria escritorios em serie.
    const ip = ipDaRequisicao(req) ?? "sem-ip";
    const limite = await registrarTentativa(`cadastro:${ip}`, 5, 60 * 60);
    if (!limite.permitido) {
      return NextResponse.json(
        { erro: "Muitas tentativas. Tente novamente mais tarde." },
        {
          status: 429,
          headers: { "Retry-After": String(limite.esperarSegundos) },
        },
      );
    }

    const corpo = cadastro.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json(
        { erro: corpo.error.issues[0]?.message ?? "Dados invalidos." },
        { status: 400 },
      );
    }

    // Versao antiga na tela significa que o texto mudou enquanto ela estava
    // aberta: o aceite valeria para um documento que a pessoa nao leu.
    if (corpo.data.versaoAceita !== VERSAO_DOS_DOCUMENTOS) {
      return NextResponse.json(
        {
          erro: "Os documentos foram atualizados. Recarregue a pagina e leia a versao nova.",
        },
        { status: 409 },
      );
    }

    const slug = corpo.data.slug.toLowerCase();
    if (RESERVADOS.has(slug)) {
      return NextResponse.json(
        { erro: "Este endereco e reservado." },
        { status: 409 },
      );
    }

    // Sem escolha, o teste comeca com tudo ligado: quem esta avaliando
    // precisa ver o sistema inteiro, inclusive a leitura por IA. Reduzir o
    // plano depois e conversa comercial; comecar cego nao ajuda ninguem.
    const escolhidos = (
      corpo.data.modulos ?? modulosDoPlano("COMPLETO")
    ).filter((modulo): modulo is Modulo => modulo !== "NUCLEO");
    const conta = contaMontada(escolhidos, FAIXA_INICIAL);
    // A conta pode ter subido para um plano pronto mais barato que a soma; os
    // modulos contratados sao os desse plano, nao so os que foram marcados.
    const contratados = conta.modulos.map((linha) => linha.modulo);

    const escritorio = await prismaPlataforma().escritorio.create({
      data: {
        slug,
        nome: corpo.data.escritorio,
        status: "TESTE",
        faixa: FAIXA_INICIAL,
      },
    });

    await comEscritorio(escritorio.id, async (db) =>
      db.usuario.create({
        data: semEscritorio({
          nome: corpo.data.nome,
          email: corpo.data.email.toLowerCase(),
          senhaHash: await gerarHash(corpo.data.senha),
          papel: "ADMIN",
          advogado: true,
        }),
      }),
    );

    // definirModulos grava tambem a franquia de cada modulo. Sem ela o
    // consumo seria ilimitado e nada viraria excedente.
    await definirModulos(escritorio.id, contratados, FAIXA_INICIAL);

    await registrarAceite(escritorio.id, {
      nome: corpo.data.nome,
      email: corpo.data.email,
      ip,
      navegador: req.headers.get("user-agent"),
    });

    await criarAssinatura(escritorio.id, conta.totalCentavos, DIAS_DE_TESTE);

    const dominio = dominioDaPlataforma();
    return NextResponse.json(
      {
        ok: true,
        endereco: `${slug}.${dominio}`,
        diasDeTeste: DIAS_DE_TESTE,
        plano: conta.plano,
        mensalidadeCentavos: conta.totalCentavos,
      },
      { status: 201 },
    );
  } catch (erro) {
    if (ehDuplicado(erro)) {
      return NextResponse.json(
        { erro: "Este endereco ja esta em uso." },
        { status: 409 },
      );
    }
    return tratarErro(erro);
  }
}
