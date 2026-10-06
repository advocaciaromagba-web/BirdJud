import { NextResponse } from "next/server";
import { ehArquivoEnviado } from "@/lib/formulario";
import { exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { CorpoGrandeDemais, formularioLimitado } from "@/lib/multipart-limitado";
import { importarCsvDaInfinitePay } from "@/lib/extrato";

export const dynamic = "force-dynamic";

/** Extrato de um ano inteiro cabe de sobra. */
const TAMANHO_MAXIMO_MB = 5;

/**
 * Importa o extrato da InfinitePay por CSV.
 *
 * Nao ha API para listar transacoes la — so a exportacao do app. As linhas
 * caem na MESMA fila de conferencia do Asaas: dois extratos, uma tela.
 */
export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirSessao("COBRANCAS");

    const formulario = await formularioLimitado(
      req,
      (TAMANHO_MAXIMO_MB + 1) * 1024 * 1024,
    ).catch((erro) => {
      if (erro instanceof CorpoGrandeDemais) throw erro;
      return null;
    });

    const enviado = formulario?.get("arquivo");
    if (!formulario || !ehArquivoEnviado(enviado)) {
      return NextResponse.json({ erro: "Envie o arquivo .csv." }, { status: 400 });
    }
    if (enviado.size > TAMANHO_MAXIMO_MB * 1024 * 1024) {
      return NextResponse.json(
        { erro: `O arquivo passa de ${TAMANHO_MAXIMO_MB} MB.` },
        { status: 413 },
      );
    }

    const texto = Buffer.from(await enviado.arrayBuffer()).toString("utf8");
    const r = await importarCsvDaInfinitePay(escritorioId, texto);
    if (r.erro) return NextResponse.json({ erro: r.erro }, { status: 422 });

    return NextResponse.json(r);
  } catch (erro) {
    return tratarErro(erro);
  }
}
