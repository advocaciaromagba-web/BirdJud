import { NextResponse } from "next/server";
import { exigirAdmin, recusarSuporte } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { montarVcard } from "@/lib/codigo-de-atendimento";
import { painelDeCodigos } from "@/lib/codigos-do-escritorio";

export const dynamic = "force-dynamic";

/**
 * Arquivo de contatos (.vcf) com o codigo no nome, para o celular de quem
 * atende. E o download mais sensivel do sistema — a lista de todas as chaves
 * numa mao so —, por isso so o administrador, e nunca o suporte.
 */
export async function GET(req: Request) {
  try {
    const contexto = await exigirAdmin();
    recusarSuporte(contexto, "A lista de códigos dos clientes");
    const url = new URL(req.url);
    const curto = url.searchParams.get("nome") === "curto";
    const teste = url.searchParams.get("quais") === "teste";
    const linhas = (await painelDeCodigos(contexto.escritorioId)).filter((l) => l.codigo);
    const { arquivo, quantos } = montarVcard(
      (teste ? linhas.slice(0, 3) : linhas).map((l) => ({ nome: l.nome, telefone: l.telefone, codigo: l.codigo! })),
      curto,
    );
    if (!quantos) return NextResponse.json({ erro: "Nenhum cliente com código e telefone válido." }, { status: 404 });
    return new NextResponse(arquivo, {
      headers: {
        "content-type": "text/vcard; charset=utf-8",
        "content-disposition": `attachment; filename="contatos-com-codigo${teste ? "-teste" : ""}.vcf"`,
        "cache-control": "no-store",
      },
    });
  } catch (erro) {
    return tratarErro(erro);
  }
}
