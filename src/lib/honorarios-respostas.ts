// Erro de dominio do contrato -> status proprio.
//
// Em arquivo separado porque rota do App Router so pode exportar o que o Next
// conhece (GET, POST, dynamic...): um ajudante exportado de route.ts quebra o
// build.
import { NextResponse } from "next/server";
import {
  ClienteSemDocumento,
  FalhaNoAsaas,
  PedidoInvalido,
  SemContaDeCobranca,
} from "./cobrancas";
import { ContratoNaoEncontrado } from "./honorarios-do-escritorio";

export function erroDeDominio(erro: unknown): NextResponse | null {
  if (
    erro instanceof PedidoInvalido ||
    erro instanceof ContratoNaoEncontrado ||
    erro instanceof SemContaDeCobranca ||
    erro instanceof ClienteSemDocumento ||
    erro instanceof FalhaNoAsaas
  ) {
    return NextResponse.json({ erro: erro.message }, { status: erro.status });
  }
  return null;
}
