// Traducao de erro de dominio para resposta HTTP, usada por todas as rotas.
import { NextResponse } from "next/server";
import { SemSessao } from "./sessao";
import { SemPermissao } from "./papeis";
import { ModuloNaoContratado } from "./modulos";

export function tratarErro(erro: unknown): NextResponse {
  if (erro instanceof SemSessao || erro instanceof SemPermissao || erro instanceof ModuloNaoContratado) {
    return NextResponse.json({ erro: erro.message }, { status: erro.status });
  }
  // Nao vazar detalhe interno para o cliente.
  console.error(erro);
  return NextResponse.json({ erro: "Erro interno." }, { status: 500 });
}

/** Chave unica violada no Prisma (e-mail repetido, numero de processo repetido). */
export function ehDuplicado(erro: unknown): boolean {
  return (
    typeof erro === "object" &&
    erro !== null &&
    (erro as { code?: string }).code === "P2002"
  );
}
