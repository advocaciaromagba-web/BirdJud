// Erro de dominio do modelo -> status proprio.
//
// Em arquivo separado porque rota do App Router so pode exportar o que o Next
// conhece: um ajudante exportado de route.ts quebra o build.
import { NextResponse } from "next/server";
import { AutentiqueRecusou } from "./autentique";
import { DocxInvalido } from "./docx";
import { IntegracaoAusente } from "./integracao";
import { ModeloNaoEncontrado, ModeloRecusado } from "./modelos-do-escritorio";

export function respostaDoDominio(erro: unknown): NextResponse | null {
  if (
    erro instanceof ModeloRecusado ||
    erro instanceof DocxInvalido ||
    erro instanceof ModeloNaoEncontrado ||
    erro instanceof AutentiqueRecusou
  ) {
    return NextResponse.json({ erro: erro.message }, { status: erro.status });
  }
  // Integracao nao conectada nao e erro do sistema: e o escritorio que ainda
  // nao ligou a assinatura eletronica. A tela precisa dizer isso, e dizer
  // onde se liga — nao mostrar "erro inesperado".
  if (erro instanceof IntegracaoAusente) {
    return NextResponse.json(
      {
        erro: "A assinatura eletronica nao esta conectada. Ligue o Autentique em Integracoes.",
      },
      { status: 409 },
    );
  }
  return null;
}
