import { NextResponse } from "next/server";
import { lerEstado } from "@/lib/nuvem";
import { baseDoEscritorio, provedorDoCaminho } from "@/lib/nuvem/enderecos";

export const dynamic = "force-dynamic";

/**
 * Retorno, no dominio da plataforma: so le o bilhete para saber de qual
 * escritorio e, e devolve a pessoa ao subdominio dele com o codigo.
 *
 * NAO troca o codigo aqui. Quem troca e o subdominio, onde estao a sessao do
 * administrador e o cookie do nonce. O bilhete e assinado: ninguem consegue
 * mandar alguem a um subdominio que nao seja o do escritorio que pediu.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ provedor: string }> },
) {
  const caminho = (await params).provedor;
  const provedor = provedorDoCaminho(caminho);
  const url = new URL(req.url);
  const estado = lerEstado(url.searchParams.get("state"));

  if (!provedor || !estado || estado.p !== provedor) {
    return new NextResponse(
      "Este link de conexao venceu ou nao e valido. Volte ao sistema e clique em Conectar de novo.",
      { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const destino = new URL(`${baseDoEscritorio(estado.s)}/api/nuvem/concluir/${caminho}`);
  destino.searchParams.set("state", url.searchParams.get("state")!);
  const codigo = url.searchParams.get("code");
  if (codigo) destino.searchParams.set("code", codigo);
  const recusa = url.searchParams.get("error");
  if (recusa) destino.searchParams.set("error", recusa.slice(0, 100));
  return NextResponse.redirect(destino.toString());
}
