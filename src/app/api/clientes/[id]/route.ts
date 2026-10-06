import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";

export const dynamic = "force-dynamic";

/**
 * Edicao do cliente.
 *
 * Ate aqui o cadastro era so de ida: errou o nome, digitou o CPF torto, mudou
 * o telefone — nao havia como corrigir pela tela. Em um sistema de escritorio
 * isso nao e incomodo pequeno: o cadastro errado vai junto para a cobranca, a
 * nota fiscal e a peca.
 *
 * Campo em branco APAGA o valor, de proposito: cliente que trocou de e-mail e
 * nao tem outro precisa poder ficar sem. Campo ausente no corpo nao e tocado.
 */
const edicao = z.object({
  nome: z.string().min(2).max(200).optional(),
  documento: z.string().max(20).nullable().optional(),
  // NAO use z.string().email() aqui. Ele recusa "", e "" e exatamente o que o
  // formulario manda quando alguem APAGA o e-mail — a pessoa levava "dados
  // invalidos" e ficava sem conseguir remover um endereco que nao vale mais.
  // O formato e conferido abaixo, so quando ha texto.
  email: z.string().max(200).nullable().optional(),
  telefone: z.string().max(20).nullable().optional(),
});

const UM_EMAIL = z.string().email();

/** "" vira null; ausente fica ausente. */
function limpar(valor: string | null | undefined): string | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { escritorioId } = await exigirSessao();
    const { id } = await params;

    const corpo = edicao.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }

    // Conferido so quando ha texto: vazio quer dizer apagar.
    const email = limpar(corpo.data.email);
    if (email && !UM_EMAIL.safeParse(email).success) {
      // Mensagem do campo, nao "dados invalidos": quem esta no formulario
      // precisa saber QUAL campo recusar.
      return NextResponse.json(
        { erro: "E-mail invalido." },
        { status: 400 },
      );
    }

    const dados = {
      ...(corpo.data.nome === undefined ? {} : { nome: corpo.data.nome.trim() }),
      ...(corpo.data.documento === undefined
        ? {}
        : { documento: limpar(corpo.data.documento) }),
      ...(corpo.data.email === undefined ? {} : { email }),
      ...(corpo.data.telefone === undefined
        ? {}
        : { telefone: limpar(corpo.data.telefone) }),
    };
    if (Object.keys(dados).length === 0) {
      return NextResponse.json({ erro: "Nada para mudar." }, { status: 400 });
    }

    // updateMany com o id NO FILTRO, nao update por id: a extensao poe o
    // escritorio no where, e cliente de outro escritorio simplesmente nao e
    // encontrado. Com update por id, um id adivinhado de outro escritorio
    // produziria erro — e erro diferente de "nao achei" ja conta que aquele
    // id existe em algum lugar.
    const resultado = await comEscritorio(escritorioId, (db) =>
      db.cliente.updateMany({ where: { id }, data: dados }),
    );
    if (resultado.count === 0) {
      return NextResponse.json(
        { erro: "Cliente nao encontrado." },
        { status: 404 },
      );
    }

    const cliente = await comEscritorio(escritorioId, (db) =>
      db.cliente.findFirst({ where: { id } }),
    );
    return NextResponse.json({ cliente });
  } catch (erro) {
    return tratarErro(erro);
  }
}
