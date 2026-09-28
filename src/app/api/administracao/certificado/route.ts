import { NextResponse } from "next/server";
import { comEscritorio } from "@/lib/prisma";
import { exigirAdministracao } from "@/lib/sessao";
import { salvarIntegracao, apagarIntegracao, anotarTeste } from "@/lib/integracao";
import { avaliarValidade, lerCertificado } from "@/lib/conectores/certificado";
import { arquivosDoCampo } from "@/lib/formulario";
import { tratarErro } from "@/lib/respostas";

export const dynamic = "force-dynamic";

// Um A1 tem alguns kilobytes. Este teto e generoso e ainda assim impede que
// alguem mande um filme pelo campo do certificado.
const MAXIMO_DE_BYTES = 512 * 1024;

/**
 * Envio do certificado A1 do escritorio, como ARQUIVO.
 *
 * Por que esta rota existe: o conector ja aceitava o certificado, mas pedia o
 * .pfx "em base64" — o que na pratica ninguem faz. Advogado tem o arquivo que
 * a certificadora entregou, e e esse que precisa caber aqui.
 *
 * O arquivo e aberto AGORA, com a senha informada, e so e guardado se abrir e
 * estiver valido. Certificado que nao abre guardado no banco vira descoberta
 * no dia da primeira nota, que e o pior dia para descobrir.
 */
export async function POST(req: Request) {
  try {
    const { escritorioId } = await exigirAdministracao("NFSE");

    const formulario = await req.formData();
    const arquivos = arquivosDoCampo(formulario, "arquivo");
    const arquivo = arquivos[0];
    const senha = String(formulario.get("senha") ?? "");

    if (!arquivo) {
      return NextResponse.json(
        { erro: "Escolha o arquivo do certificado (.pfx ou .p12)." },
        { status: 400 },
      );
    }
    if (!senha) {
      return NextResponse.json(
        { erro: "Informe a senha do certificado." },
        { status: 400 },
      );
    }
    if (arquivo.size > MAXIMO_DE_BYTES) {
      return NextResponse.json(
        { erro: "Arquivo grande demais para ser um certificado." },
        { status: 413 },
      );
    }
    if (!/\.(pfx|p12)$/i.test(arquivo.name)) {
      return NextResponse.json(
        { erro: "O certificado A1 e um arquivo .pfx ou .p12." },
        { status: 400 },
      );
    }

    const base64 = Buffer.from(await arquivo.arrayBuffer()).toString("base64");

    let leitura;
    try {
      leitura = lerCertificado(base64, senha);
    } catch (erro) {
      // A causa quase sempre e senha errada, e dizer isso poupa meia hora de
      // suspeita do arquivo.
      const motivo = (erro as Error).message;
      return NextResponse.json(
        {
          erro: /password/i.test(motivo)
            ? "A senha nao abre este certificado."
            : `Nao foi possivel ler o certificado: ${motivo}`,
        },
        { status: 400 },
      );
    }

    const validade = avaliarValidade(leitura);
    if (!validade.ok) {
      return NextResponse.json({ erro: validade.detalhe }, { status: 400 });
    }

    await salvarIntegracao(
      escritorioId,
      "NFSE_CERT",
      { arquivo: base64, senha },
      "OK",
    );
    await anotarTeste(escritorioId, "NFSE_CERT", true, validade.detalhe);

    return NextResponse.json({
      ok: true,
      titular: leitura.titular,
      validoAte: leitura.ate,
      detalhe: validade.detalhe,
    });
  } catch (erro) {
    return tratarErro(erro);
  }
}

/** Remover o certificado do escritorio. */
export async function DELETE() {
  try {
    const { escritorioId } = await exigirAdministracao("NFSE");
    await apagarIntegracao(escritorioId, "NFSE_CERT");
    return NextResponse.json({ ok: true });
  } catch (erro) {
    return tratarErro(erro);
  }
}
