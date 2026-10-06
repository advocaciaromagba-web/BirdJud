// Erro de dominio do modelo -> status proprio.
//
// Em arquivo separado porque rota do App Router so pode exportar o que o Next
// conhece: um ajudante exportado de route.ts quebra o build.
import { NextResponse } from "next/server";
import { DocxInvalido } from "./docx";
import { ModeloNaoEncontrado, ModeloRecusado } from "./modelos-do-escritorio";

export function respostaDoDominio(erro: unknown): NextResponse | null {
  if (
    erro instanceof ModeloRecusado ||
    erro instanceof DocxInvalido ||
    erro instanceof ModeloNaoEncontrado
  ) {
    return NextResponse.json({ erro: erro.message }, { status: erro.status });
  }
  return null;
}
