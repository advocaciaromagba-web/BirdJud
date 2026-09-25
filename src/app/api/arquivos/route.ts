import { NextResponse } from "next/server";
import { comEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import {
  ArquivoRecusado,
  EspacoEsgotado,
  espacoDoEscritorio,
  guardarArquivo,
  TAMANHO_MAXIMO_MB,
} from "@/lib/arquivos";

/** Erro de dominio do modulo -> status proprio. */
function respostaDoDominio(erro: unknown): NextResponse | null {
  if (erro instanceof ArquivoRecusado || erro instanceof EspacoEsgotado) {
    return NextResponse.json({ erro: erro.message }, { status: erro.status });
  }
  return null;
}

export async function GET() {
  try {
    const { escritorioId } = await exigirSessao("NUVEM");
    const [arquivos, espaco] = await Promise.all([
      comEscritorio(escritorioId, (db) =>
        db.arquivo.findMany({ orderBy: { criadoEm: "desc" }, take: 200 }),
      ),
      espacoDoEscritorio(escritorioId),
    ]);
    return NextResponse.json({ arquivos, espaco });
  } catch (erro) {
    return tratarErro(erro);
  }
}

/**
 * Sobe um arquivo.
 *
 * Multipart, nao JSON: e o que o navegador faz sem gambiarra, e evita inchar
 * o arquivo em base64 no caminho.
 */
export async function POST(req: Request) {
  try {
    const { escritorioId, usuarioId } = await exigirSessao("NUVEM");

    const formulario = await req.formData().catch(() => null);
    const enviado = formulario?.get("arquivo");
    if (!formulario || !(enviado instanceof File)) {
      return NextResponse.json({ erro: "Envie um arquivo." }, { status: 400 });
    }
    // Barra pelo tamanho declarado antes de ler o corpo inteiro na memoria.
    if (enviado.size > TAMANHO_MAXIMO_MB * 1024 * 1024) {
      return NextResponse.json(
        { erro: `Arquivo maior que ${TAMANHO_MAXIMO_MB} MB.` },
        { status: 413 },
      );
    }

    const texto = (campo: string): string | null => {
      const valor = formulario.get(campo);
      return typeof valor === "string" && valor.trim() ? valor.trim() : null;
    };

    const arquivo = await guardarArquivo(escritorioId, {
      nome: enviado.name,
      tipo: enviado.type,
      conteudo: Buffer.from(await enviado.arrayBuffer()),
      usuarioId,
      descricao: texto("descricao"),
      clienteId: texto("clienteId"),
      processoId: texto("processoId"),
    });
    return NextResponse.json({ arquivo }, { status: 201 });
  } catch (erro) {
    return respostaDoDominio(erro) ?? tratarErro(erro);
  }
}
