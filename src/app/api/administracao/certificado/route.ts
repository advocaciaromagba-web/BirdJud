import { NextResponse } from "next/server";
import { comEscritorio } from "@/lib/prisma";
import { exigirAdministracao } from "@/lib/sessao";
import { salvarIntegracao, apagarIntegracao, anotarTeste } from "@/lib/integracao";
import { avaliarValidade } from "@/lib/conectores/certificado";
import { carregarCertificado } from "@/lib/nfse/certificado";
import type { CertificadoGuardado } from "@/lib/nfse";
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
 *
 * A SENHA NAO E GUARDADA: serve so para conferir o arquivo. Quem envia vira o
 * TITULAR — so ele assina, cancela e consulta nota com este certificado, e
 * digita a senha a cada assinatura (src/lib/nfse/emissao.ts).
 */
export async function POST(req: Request) {
  try {
    const { escritorioId, usuarioId, nomeUsuario } = await exigirAdministracao("NFSE");

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

    let cert;
    try {
      cert = carregarCertificado(Buffer.from(base64, "base64"), senha);
    } catch (erro) {
      return NextResponse.json({ erro: (erro as Error).message }, { status: 400 });
    }
    // A Sefin so aceita a DPS assinada pelo e-CNPJ do proprio emitente (E0718).
    if (!cert.cnpj) {
      return NextResponse.json(
        { erro: "Este e um e-CPF. Para emitir nota e preciso o e-CNPJ do escritorio." },
        { status: 400 },
      );
    }
    const fiscal = await comEscritorio(escritorioId, (db) => db.fiscal.findFirst({ select: { cnpj: true } }));
    if (fiscal && fiscal.cnpj.replace(/\D/g, "") !== cert.cnpj) {
      return NextResponse.json(
        { erro: `Este certificado e do CNPJ ${cert.cnpj}, diferente do cadastro fiscal. A Receita recusa (E0718).` },
        { status: 400 },
      );
    }

    const leitura = { titular: cert.titular, de: cert.validoDesde, ate: cert.validoAte };
    const validade = avaliarValidade(leitura);
    if (!validade.ok) {
      return NextResponse.json({ erro: validade.detalhe }, { status: 400 });
    }

    const guardado: CertificadoGuardado = {
      arquivo: base64,
      titular: cert.titular,
      cnpj: cert.cnpj,
      validoAte: cert.validoAte.toISOString(),
      titularId: usuarioId,
      titularNome: nomeUsuario,
    };
    await salvarIntegracao(escritorioId, "NFSE_CERT", guardado, "OK");
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
