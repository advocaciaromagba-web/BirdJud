import { NextResponse } from "next/server";
import { ehArquivoEnviado } from "@/lib/formulario";
import { exigirAdmin, exigirSessao } from "@/lib/sessao";
import { tratarErro } from "@/lib/respostas";
import { CorpoGrandeDemais, formularioLimitado } from "@/lib/multipart-limitado";
import {
  TAMANHO_MAXIMO_MB,
  ehEspecie,
  guardarModelo,
  modelosVigentes,
} from "@/lib/modelos-do-escritorio";
import { respostaDoDominio } from "@/lib/modelos-respostas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { escritorioId } = await exigirSessao();
    return NextResponse.json({ modelos: await modelosVigentes(escritorioId) });
  } catch (erro) {
    return tratarErro(erro);
  }
}

/** Sobe o modelo do escritorio. Multipart: e um .docx, nao um JSON. */
export async function POST(req: Request) {
  try {
    // Trocar o papel em que sai contrato e procuracao e decisao de quem
    // responde pelo escritorio, nao de quem digita cadastro.
    const { escritorioId, usuarioId } = await exigirAdmin();

    const formulario = await formularioLimitado(
      req,
      (TAMANHO_MAXIMO_MB + 1) * 1024 * 1024,
    ).catch((erro) => {
      if (erro instanceof CorpoGrandeDemais) throw erro;
      return null;
    });

    const especie = String(formulario?.get("especie") ?? "");
    if (!ehEspecie(especie)) {
      return NextResponse.json({ erro: "Especie invalida." }, { status: 400 });
    }

    const enviado = formulario?.get("arquivo");
    if (!formulario || !ehArquivoEnviado(enviado)) {
      return NextResponse.json({ erro: "Envie um arquivo .docx." }, { status: 400 });
    }
    if (enviado.size > TAMANHO_MAXIMO_MB * 1024 * 1024) {
      return NextResponse.json(
        { erro: `O modelo passa de ${TAMANHO_MAXIMO_MB} MB.` },
        { status: 413 },
      );
    }

    const r = await guardarModelo(
      escritorioId,
      especie,
      {
        nome: enviado.name,
        conteudo: Buffer.from(await enviado.arrayBuffer()),
      },
      usuarioId,
    );
    return NextResponse.json(r);
  } catch (erro) {
    return respostaDoDominio(erro) ?? tratarErro(erro);
  }
}
