import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio, prismaPlataforma, semEscritorio } from "@/lib/prisma";
import { criarAssinatura } from "@/lib/cobranca";
import { DIAS_DE_TESTE, PRECO_DA_FAIXA } from "@/lib/precos";
import { gerarHash } from "@/lib/senhas";
import { slugDoHost } from "@/lib/subdominio";
import { ehDuplicado, tratarErro } from "@/lib/respostas";

const RESERVADOS = new Set(["www", "app", "api", "admin", "painel", "plataforma", "suporte"]);

const cadastro = z.object({
  escritorio: z.string().min(2).max(120),
  slug: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "O endereco aceita letras minusculas, numeros e hifen."),
  nome: z.string().min(2).max(120),
  email: z.string().email(),
  senha: z.string().min(10, "A senha precisa ter ao menos 10 caracteres."),
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
        { status: 400 }
      );
    }

    const corpo = cadastro.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json(
        { erro: corpo.error.issues[0]?.message ?? "Dados invalidos." },
        { status: 400 }
      );
    }

    const slug = corpo.data.slug.toLowerCase();
    if (RESERVADOS.has(slug)) {
      return NextResponse.json({ erro: "Este endereco e reservado." }, { status: 409 });
    }

    const escritorio = await prismaPlataforma().escritorio.create({
      data: { slug, nome: corpo.data.escritorio, status: "TESTE", faixa: "ATE_3" },
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
      })
    );

    await criarAssinatura(escritorio.id, PRECO_DA_FAIXA.ATE_3, DIAS_DE_TESTE);

    const dominio = process.env.DOMINIO_PLATAFORMA ?? "birdjud.com.br";
    return NextResponse.json(
      {
        ok: true,
        endereco: `${slug}.${dominio}`,
        diasDeTeste: DIAS_DE_TESTE,
      },
      { status: 201 }
    );
  } catch (erro) {
    if (ehDuplicado(erro)) {
      return NextResponse.json({ erro: "Este endereco ja esta em uso." }, { status: 409 });
    }
    return tratarErro(erro);
  }
}
