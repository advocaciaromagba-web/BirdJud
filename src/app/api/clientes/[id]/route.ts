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
  rg: z.string().max(30).nullable().optional(),
  // "AAAA-MM-DD", como o campo de data do navegador manda. "" apaga.
  nascimento: z.string().max(10).nullable().optional(),
  nacionalidade: z.string().max(60).nullable().optional(),
  estadoCivil: z.string().max(60).nullable().optional(),
  profissao: z.string().max(120).nullable().optional(),
  observacoes: z.string().max(4000).nullable().optional(),
  endereco: z
    .object({
      cep: z.string().max(12).optional(),
      logradouro: z.string().max(200).optional(),
      numero: z.string().max(20).optional(),
      complemento: z.string().max(120).optional(),
      bairro: z.string().max(120).optional(),
      cidade: z.string().max(120).optional(),
      uf: z.string().max(2).optional(),
    })
    .optional(),
});

const UM_EMAIL = z.string().email();

/** "1980-03-15" -> data, ou null quando nao e uma data de verdade. */
function dataDoCampo(texto: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const ok = d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCFullYear() >= 1900 && d.getTime() <= Date.now();
  return ok ? d : null;
}

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

    let nascimento: Date | null | undefined = undefined;
    const bruto = limpar(corpo.data.nascimento);
    if (bruto !== undefined) {
      nascimento = bruto ? dataDoCampo(bruto) : null;
      if (bruto && !nascimento) {
        return NextResponse.json({ erro: "Data de nascimento invalida." }, { status: 400 });
      }
    }

    // O endereco e um so objeto: o que veio por cima do que havia. Mandar so
    // o numero da casa nao pode apagar a rua.
    let endereco: Record<string, string | null> | undefined;
    if (corpo.data.endereco) {
      const atual = await comEscritorio(escritorioId, (db) =>
        db.cliente.findFirst({ where: { id }, select: { endereco: true } }),
      );
      const antes = (atual?.endereco ?? {}) as Record<string, string | null>;
      endereco = { ...antes };
      for (const [campo, valor] of Object.entries(corpo.data.endereco)) {
        let v = limpar(valor) ?? null;
        if (v && campo === "uf") v = v.toUpperCase();
        if (v && campo === "cep") v = v.replace(/\D/g, "");
        endereco[campo] = v;
      }
      // A rua tem dois nomes no codigo: "logradouro" (qualificacao do
      // cliente) e "rua" (representante que usa o endereco da empresa).
      // Gravar nos dois faz as duas pecas dizerem a mesma rua.
      if (corpo.data.endereco.logradouro !== undefined) endereco.rua = endereco.logradouro ?? null;
      if (endereco.uf && !/^[A-Z]{2}$/.test(endereco.uf)) {
        return NextResponse.json({ erro: "UF invalida: use a sigla, como SP." }, { status: 400 });
      }
      if (endereco.cep && endereco.cep.length !== 8) {
        return NextResponse.json({ erro: "CEP invalido: sao 8 digitos." }, { status: 400 });
      }
    }

    const opcional = (campo: "rg" | "nacionalidade" | "estadoCivil" | "profissao" | "observacoes") =>
      corpo.data[campo] === undefined ? {} : { [campo]: limpar(corpo.data[campo]) };

    const dados = {
      ...opcional("rg"),
      ...opcional("nacionalidade"),
      ...opcional("estadoCivil"),
      ...opcional("profissao"),
      ...opcional("observacoes"),
      ...(nascimento === undefined ? {} : { nascimento }),
      ...(endereco === undefined ? {} : { endereco }),
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
