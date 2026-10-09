// O pedido de importacao, igual para o escritorio e para a plataforma:
// multipart com o arquivo, a acao (analisar | importar) e o mapeamento; ou
// JSON com { acao: "desfazer", importacaoId }.
import { NextResponse } from "next/server";
import { ehArquivoEnviado } from "./formulario";
import { CorpoGrandeDemais, formularioLimitado } from "./multipart-limitado";
import { PlanilhaInvalida } from "./planilha";
import { ehCampoImportavel, type Mapeamento } from "./importacao-clientes";
import {
  analisarPlanilha,
  desfazerImportacao,
  importarPlanilha,
  SemColunaDeNome,
  TAMANHO_MAXIMO_MB,
} from "./importacao-do-escritorio";
import { cutucarNuvem } from "./avisar-nuvem";

function lerMapeamento(bruto: unknown): Mapeamento | null {
  if (typeof bruto !== "string" || !bruto) return null;
  try {
    const v = JSON.parse(bruto);
    if (!Array.isArray(v) || v.length > 200) return null;
    return v.map((x) => (ehCampoImportavel(x) ? x : null));
  } catch {
    return null;
  }
}

export async function atenderImportacao(
  req: Request,
  escritorioId: string,
  feitaPor: string,
): Promise<NextResponse> {
  try {
    if ((req.headers.get("content-type") ?? "").includes("application/json")) {
      const corpo = (await req.json().catch(() => null)) as { acao?: string; importacaoId?: string } | null;
      if (corpo?.acao !== "desfazer" || !corpo.importacaoId) {
        return NextResponse.json({ erro: "Pedido invalido." }, { status: 400 });
      }
      return NextResponse.json(await desfazerImportacao(escritorioId, corpo.importacaoId));
    }

    const formulario = await formularioLimitado(req, (TAMANHO_MAXIMO_MB + 1) * 1024 * 1024);
    const arquivo = formulario.get("arquivo");
    if (!ehArquivoEnviado(arquivo)) {
      return NextResponse.json({ erro: "Envie a planilha (.xlsx ou .csv)." }, { status: 400 });
    }
    if (arquivo.size > TAMANHO_MAXIMO_MB * 1024 * 1024) {
      return NextResponse.json({ erro: `A planilha passa de ${TAMANHO_MAXIMO_MB} MB.` }, { status: 413 });
    }
    const conteudo = Buffer.from(await arquivo.arrayBuffer());
    const mapeamento = lerMapeamento(formulario.get("mapeamento"));

    if (formulario.get("acao") === "importar") {
      if (!mapeamento) return NextResponse.json({ erro: "Confira o mapeamento das colunas antes." }, { status: 400 });
      const r = await importarPlanilha(escritorioId, arquivo.name || "planilha", feitaPor, conteudo, mapeamento);
      if (r.importados > 0) {
        // As pastas dos clientes novos na nuvem do escritorio, se houver.
        await cutucarNuvem(escritorioId);
      }
      return NextResponse.json(r);
    }
    return NextResponse.json(await analisarPlanilha(escritorioId, conteudo, mapeamento));
  } catch (erro) {
    if (erro instanceof CorpoGrandeDemais) {
      return NextResponse.json({ erro: `A planilha passa de ${TAMANHO_MAXIMO_MB} MB.` }, { status: 413 });
    }
    if (erro instanceof PlanilhaInvalida || erro instanceof SemColunaDeNome) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    throw erro;
  }
}
