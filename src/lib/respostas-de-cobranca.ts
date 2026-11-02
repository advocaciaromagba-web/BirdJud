// Erros de dominio da cobranca -> resposta HTTP com o status proprio de cada um.
import { NextResponse } from "next/server";
import { ClienteSemDocumento, FalhaNoAsaas, PedidoInvalido, SemContaDeCobranca } from "./cobrancas";

export function respostaDaCobranca(erro: unknown): NextResponse | null {
  if (
    erro instanceof SemContaDeCobranca ||
    erro instanceof ClienteSemDocumento ||
    erro instanceof FalhaNoAsaas ||
    erro instanceof PedidoInvalido
  ) {
    return NextResponse.json({ erro: erro.message }, { status: erro.status });
  }
  return null;
}
