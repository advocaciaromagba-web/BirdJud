import { NextResponse } from "next/server";
import { z } from "zod";
import { comEscritorio, semEscritorio } from "@/lib/prisma";
import { exigirSessao, SemSessao } from "@/lib/sessao";
import { ModuloNaoContratado } from "@/lib/modulos";

const novoCliente = z.object({
  nome: z.string().min(2).max(200),
  documento: z.string().max(20).optional(),
  email: z.string().email().optional(),
  telefone: z.string().max(20).optional(),
});

function tratar(erro: unknown) {
  if (erro instanceof SemSessao) {
    return NextResponse.json({ erro: erro.message }, { status: erro.status });
  }
  if (erro instanceof ModuloNaoContratado) {
    return NextResponse.json({ erro: erro.message }, { status: erro.status });
  }
  console.error(erro);
  return NextResponse.json({ erro: "Erro interno." }, { status: 500 });
}

export async function GET() {
  try {
    const { escritorioId } = await exigirSessao();
    const clientes = await comEscritorio(escritorioId, (db) =>
      db.cliente.findMany({ orderBy: { nome: "asc" }, take: 200 })
    );
    return NextResponse.json({ clientes });
  } catch (erro) {
    return tratar(erro);
  }
}

export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirSessao();
    const corpo = novoCliente.safeParse(await req.json());
    if (!corpo.success) {
      return NextResponse.json({ erro: "Dados invalidos." }, { status: 400 });
    }
    // escritorioId nunca vem do corpo: a extensao injeta o da sessao.
    const cliente = await comEscritorio(escritorioId, (db) =>
      db.cliente.create({ data: semEscritorio(corpo.data) })
    );
    return NextResponse.json({ cliente }, { status: 201 });
  } catch (erro) {
    return tratar(erro);
  }
}
