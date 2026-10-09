import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirAdmin, exigirSessao } from "@/lib/sessao";
import { temRemetenteDaPlataforma } from "@/lib/email-plataforma";
import { convidarPessoa, incluirPessoa } from "@/lib/equipe";
import { PAPEIS } from "@/lib/papeis";
import { FaixaEsgotada } from "@/lib/faixas";
import { ehDuplicado, tratarErro } from "@/lib/respostas";

/*
 * A senha e OPCIONAL de proposito.
 *
 * Sem ela, o usuario nasce com um hash que ninguem consegue reproduzir e
 * recebe um convite por e-mail para escolher a propria senha. Com ela, volta
 * o caminho antigo: o administrador digita uma senha e a passa por fora — o
 * que e ruim (a senha anda por WhatsApp, papel ou voz) mas e a unica saida
 * quando a plataforma ainda nao tem remetente configurado.
 */
const novoUsuario = z.object({
  nome: z.string().min(2).max(120),
  email: z.string().email(),
  senha: z
    .string()
    .min(10, "A senha precisa ter ao menos 10 caracteres.")
    .optional(),
  papel: z.enum(PAPEIS),
  oab: z.string().max(20).optional(),
});

export async function GET() {
  try {
    const { escritorioId } = await exigirSessao();
    const usuarios = await comEscritorio(escritorioId, (db) =>
      db.usuario.findMany({
        orderBy: { nome: "asc" },
        // Nunca devolver hash de senha nem segredo de 2FA.
        select: {
          id: true,
          nome: true,
          email: true,
          papel: true,
          advogado: true,
          ativo: true,
          oab: true,
          ultimoAcesso: true,
          doisFatores: false,
        },
      }),
    );
    return NextResponse.json({ usuarios });
  } catch (erro) {
    return tratarErro(erro);
  }
}

export async function POST(req: Request) {
  try {
    const contexto = await exigirAdmin();
    const { escritorioId } = contexto;
    const corpo = novoUsuario.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json(
        { erro: corpo.error.issues[0]?.message ?? "Dados invalidos." },
        { status: 400 },
      );
    }

    const { senha } = corpo.data;
    const convidar = !senha;
    if (convidar && !temRemetenteDaPlataforma()) {
      return NextResponse.json(
        {
          erro: "Sem remetente de e-mail configurado na plataforma, e preciso definir uma senha aqui e passa-la para a pessoa.",
        },
        { status: 503 },
      );
    }

    // Vaga na faixa, senha impossivel de adivinhar e convite: ver equipe.ts.
    const usuario = await incluirPessoa(escritorioId, corpo.data);
    if (!convidar) return NextResponse.json({ usuario }, { status: 201 });

    const quemConvidou = await comEscritorio(escritorioId, (db) =>
      db.usuario.findFirst({
        where: { id: contexto.usuarioId },
        select: { nome: true },
      }),
    );
    const convite = await convidarPessoa(escritorioId, usuario.id, {
      nomeDoEscritorio: contexto.marca.nome,
      slug: contexto.marca.slug ?? "",
      nomeDeQuemConvidou: quemConvidou?.nome ?? "Quem administra o sistema",
    });
    if (!convite.enviado) {
      // O usuario ja existe; o que falhou foi o convite. Dizer isso, para o
      // administrador reenviar em vez de achar que nada aconteceu.
      return NextResponse.json(
        {
          usuario,
          aviso:
            "Usuario criado, mas o convite nao pode ser enviado. Peca para a pessoa usar 'Esqueci minha senha'.",
        },
        { status: 201 },
      );
    }

    return NextResponse.json(
      { usuario, detalhe: `Convite enviado para ${usuario.email}.` },
      { status: 201 },
    );
  } catch (erro) {
    if (erro instanceof FaixaEsgotada) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    if (ehDuplicado(erro)) {
      return NextResponse.json(
        { erro: "Ja existe um usuario com este e-mail neste escritorio." },
        { status: 409 },
      );
    }
    return tratarErro(erro);
  }
}
