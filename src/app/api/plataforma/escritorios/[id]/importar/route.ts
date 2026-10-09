import { NextResponse } from "next/server";
import { prismaPlataforma } from "@/lib/prisma";
import { exigirOperador, registrarAcessoSuporte, SemOperador } from "@/lib/plataforma";
import { atenderImportacao } from "@/lib/rota-de-importacao";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** A mesma importacao, feita pela plataforma na implantacao do escritorio. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const operador = await exigirOperador();
    const { id } = await params;
    const existe = await prismaPlataforma().escritorio.findUnique({ where: { id }, select: { id: true } });
    if (!existe) return NextResponse.json({ erro: "Escritorio nao encontrado." }, { status: 404 });
    await registrarAcessoSuporte(operador.operadorId, id, "Implantacao: importacao de clientes");
    return await atenderImportacao(req, id, `${operador.nome} (Blackbird)`);
  } catch (erro) {
    if (erro instanceof SemOperador) return NextResponse.json({ erro: erro.message }, { status: erro.status });
    console.error(erro);
    return NextResponse.json({ erro: "Erro interno." }, { status: 500 });
  }
}
