import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { atenderImportacao } from "@/lib/rota-de-importacao";
import { importacoesDoEscritorio } from "@/lib/importacao-do-escritorio";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Importar clientes de planilha. So administrador: e cadastro em massa. */
export async function POST(req: Request) {
  try {
    const { escritorioId, nomeUsuario } = await exigirAdmin();
    return await atenderImportacao(req, escritorioId, nomeUsuario);
  } catch (erro) {
    return tratarErro(erro);
  }
}

export async function GET() {
  try {
    const { escritorioId } = await exigirAdmin();
    return NextResponse.json({ importacoes: await importacoesDoEscritorio(escritorioId) });
  } catch (erro) {
    return tratarErro(erro);
  }
}
