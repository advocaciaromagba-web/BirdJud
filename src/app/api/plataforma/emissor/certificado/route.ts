import { NextResponse } from "next/server";
import { exigirOperador, SemOperador } from "@/lib/plataforma";
import { arquivosDoCampo } from "@/lib/formulario";
import {
  CertificadoRecusado,
  guardarCertificadoDaPlataforma,
  removerCertificadoDaPlataforma,
} from "@/lib/nota-da-plataforma";

export const dynamic = "force-dynamic";

// Um A1 tem alguns kilobytes; o teto so impede que mandem outra coisa.
const MAXIMO_DE_BYTES = 512 * 1024;

/**
 * Envio do e-CNPJ A1 da Blackbird pelo console, como ARQUIVO, em vez de
 * variavel do Railway: quem emite tem o .pfx que a certificadora entregou,
 * nao um base64. O arquivo e aberto agora com a senha e so e guardado se
 * abrir, for e-CNPJ do CNPJ cadastrado e estiver na validade.
 */
export async function POST(req: Request) {
  try {
    await exigirOperador();
    const formulario = await req.formData();
    const arquivo = arquivosDoCampo(formulario, "arquivo")[0];
    const senha = String(formulario.get("senha") ?? "");
    if (!arquivo) return NextResponse.json({ erro: "Escolha o arquivo do certificado (.pfx ou .p12)." }, { status: 400 });
    if (!senha) return NextResponse.json({ erro: "Informe a senha do certificado." }, { status: 400 });
    if (arquivo.size > MAXIMO_DE_BYTES) return NextResponse.json({ erro: "Arquivo grande demais para ser um certificado." }, { status: 413 });
    if (!/\.(pfx|p12)$/i.test(arquivo.name)) return NextResponse.json({ erro: "O certificado A1 é um arquivo .pfx ou .p12." }, { status: 400 });

    const r = await guardarCertificadoDaPlataforma(Buffer.from(await arquivo.arrayBuffer()), senha);
    return NextResponse.json({ ok: true, titular: r.titular, validoAte: r.validoAte });
  } catch (erro) {
    if (erro instanceof SemOperador || erro instanceof CertificadoRecusado) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    console.error(erro);
    return NextResponse.json({ erro: "Erro interno." }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await exigirOperador();
    await removerCertificadoDaPlataforma();
    return NextResponse.json({ ok: true });
  } catch (erro) {
    if (erro instanceof SemOperador) return NextResponse.json({ erro: erro.message }, { status: erro.status });
    console.error(erro);
    return NextResponse.json({ erro: "Erro interno." }, { status: 500 });
  }
}
