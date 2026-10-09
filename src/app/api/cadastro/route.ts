import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio, semEscritorio } from "@/lib/prisma";
import { DIAS_DE_TESTE } from "@/lib/precos";
import { MODULOS } from "@/lib/catalogo";
import { modulosDoPlano } from "@/lib/planos";
import { EnderecoIndisponivel, nascerEscritorio, slugValido } from "@/lib/nascimento";

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



const cadastro = z.object({
  escritorio: z.string().min(2).max(120),
  slug: slugValido,
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

    // Sem escolha, o teste comeca com tudo ligado: quem esta avaliando
    // precisa ver o sistema inteiro, inclusive a leitura por IA.
    const { escritorio, plano, mensalidadeCentavos } = await nascerEscritorio({
      slug: corpo.data.slug,
      nome: corpo.data.escritorio,
      modulos: corpo.data.modulos ?? modulosDoPlano("COMPLETO"),
      faixa: FAIXA_INICIAL,
      diasDeTeste: DIAS_DE_TESTE,
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
    await registrarAceite(escritorio.id, {
      nome: corpo.data.nome,
      email: corpo.data.email,
      ip,
      navegador: req.headers.get("user-agent"),
    });


    const dominio = dominioDaPlataforma();
    return NextResponse.json(
      {
        ok: true,
        endereco: `${escritorio.slug}.${dominio}`,
        diasDeTeste: DIAS_DE_TESTE,
        plano,
        mensalidadeCentavos,
      },
      { status: 201 },
    );
  } catch (erro) {
    if (erro instanceof EnderecoIndisponivel) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    if (ehDuplicado(erro)) {
      return NextResponse.json(
        { erro: "Este endereco ja esta em uso." },
        { status: 409 },
      );
    }
    return tratarErro(erro);
  }
}
