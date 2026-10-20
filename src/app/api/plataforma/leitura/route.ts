import { NextResponse } from "next/server";
import { exigirOperador, SemOperador } from "@/lib/plataforma";
import { arquivosDoCampo } from "@/lib/formulario";
import { CorpoGrandeDemais, formularioLimitado } from "@/lib/multipart-limitado";
import { registrarTentativa } from "@/lib/limite";
import {
  AnexoRecusado,
  IARecusou,
  MAXIMO_DE_ANEXOS,
  MAXIMO_DE_BYTES,
  pedirSobreDocumentos,
  SemChaveDeIA,
  type Anexo,
} from "@/lib/ia";
import { buscarCep } from "@/lib/cep";
import { completarCadastroFiscal, interpretar, LeituraIlegivel, montarInstrucao } from "@/lib/leitura-documento";

export const dynamic = "force-dynamic";

const POR_OPERADOR = 30;
const JANELA = 60 * 60;

const SISTEMA =
  "Você é um assistente de cadastro da plataforma BirdJud. " +
  "Você nunca grava nada: sua saída é uma proposta que uma pessoa vai conferir.";

/**
 * Leitura por IA no console: cartao CNPJ, contrato social ou ficha municipal
 * preenchem o cadastro fiscal da Blackbird e os dados do escritorio na
 * implantacao. So o perfil FISCAL; o codigo IBGE sai do CEP.
 */
export async function POST(req: Request) {
  try {
    const operador = await exigirOperador();
    const limite = await registrarTentativa(`ia-leitura:operador:${operador.operadorId}`, POR_OPERADOR, JANELA);
    if (!limite.permitido) {
      return NextResponse.json(
        { erro: "Muitas leituras em pouco tempo. Tente de novo mais tarde." },
        { status: 429, headers: { "Retry-After": String(limite.esperarSegundos) } },
      );
    }

    const formulario = await formularioLimitado(req, MAXIMO_DE_BYTES + 1024 * 1024);
    if (String(formulario.get("perfil") ?? "") !== "FISCAL") {
      return NextResponse.json({ erro: "No console, só a leitura do cadastro fiscal." }, { status: 400 });
    }
    const arquivos = arquivosDoCampo(formulario, "arquivos");
    if (arquivos.length === 0) return NextResponse.json({ erro: "Envie ao menos um documento." }, { status: 400 });
    if (arquivos.length > MAXIMO_DE_ANEXOS) {
      return NextResponse.json({ erro: `Envie no máximo ${MAXIMO_DE_ANEXOS} documentos por leitura.` }, { status: 400 });
    }
    if (arquivos.reduce((t, a) => t + a.size, 0) > MAXIMO_DE_BYTES) {
      return NextResponse.json(
        { erro: `Os documentos somam mais de ${Math.round(MAXIMO_DE_BYTES / (1024 * 1024))} MB.` },
        { status: 413 },
      );
    }
    const anexos: Anexo[] = [];
    for (const a of arquivos) {
      anexos.push({ nome: a.name.slice(0, 120), tipo: a.type, dados: Buffer.from(await a.arrayBuffer()) });
    }

    const resultado = await pedirSobreDocumentos(SISTEMA, anexos, montarInstrucao("FISCAL"), "medium");
    let leitura = interpretar("FISCAL", resultado.texto);
    const cep = leitura.campos.cep?.valor;
    const endereco = cep ? await buscarCep(cep).catch(() => null) : null;
    leitura = completarCadastroFiscal(leitura, endereco?.ibge ?? null);
    return NextResponse.json({ leitura });
  } catch (erro) {
    if (erro instanceof SemOperador) return NextResponse.json({ erro: erro.message }, { status: erro.status });
    if (erro instanceof CorpoGrandeDemais) return NextResponse.json({ erro: "Documentos grandes demais." }, { status: 413 });
    if (erro instanceof SemChaveDeIA || erro instanceof IARecusou || erro instanceof AnexoRecusado || erro instanceof LeituraIlegivel) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    console.error(erro);
    return NextResponse.json({ erro: "Erro interno." }, { status: 500 });
  }
}
