// Assinatura digital do DPS com o certificado A1 do escritorio.
//
// Aqui NAO se improvisa. Assinatura XML tem canonicalizacao, e canonicalizacao
// escrita a mao gera assinatura que parece certa e e recusada no balcao. Quem
// faz isso e a xml-crypto, biblioteca usada de pe pelo ecossistema fiscal
// brasileiro; o que este arquivo faz e abrir o PKCS#12 e dizer a ela o que
// assinar.
//
// O certificado e a senha sao do escritorio (Integracoes > Certificado e-CNPJ),
// guardados cifrados. A plataforma nao tem certificado proprio: assinar nota de
// terceiro com certificado da plataforma seria falsidade, nao conveniencia.
import forge from "node-forge";
import { SignedXml } from "xml-crypto";

export type ChaveDoCertificado = {
  chavePrivadaPem: string;
  certificadoPem: string;
  titular: string;
  validoAte: Date;
};

export class CertificadoInvalido extends Error {
  readonly status = 422;
  constructor(motivo: string) {
    super(motivo);
    this.name = "CertificadoInvalido";
  }
}

/** Abre o .pfx e devolve chave e certificado em PEM, prontos para assinar. */
export function abrirCertificado(
  pfxBase64: string,
  senha: string,
): ChaveDoCertificado {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const binario = forge.util.decode64(pfxBase64.replace(/\s/g, ""));
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(binario), senha);
  } catch (erro) {
    const mensagem = (erro as Error).message;
    throw new CertificadoInvalido(
      /password/i.test(mensagem)
        ? "Senha do certificado incorreta."
        : `Certificado ilegivel: ${mensagem}`,
    );
  }

  const certificado = p12.getBags({ bagType: forge.pki.oids.certBag })[
    forge.pki.oids.certBag
  ]?.[0]?.cert;

  // O .pfx pode guardar a chave de dois jeitos; os dois aparecem em
  // certificado emitido por AC brasileira, entao os dois sao procurados.
  const chave =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ]?.[0]?.key ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0]
      ?.key;

  if (!certificado || !chave) {
    throw new CertificadoInvalido(
      "O arquivo nao traz certificado e chave privada.",
    );
  }

  return {
    chavePrivadaPem: forge.pki.privateKeyToPem(chave as forge.pki.PrivateKey),
    certificadoPem: forge.pki.certificateToPem(certificado),
    titular:
      certificado.subject.getField("CN")?.value ?? "titular nao identificado",
    validoAte: certificado.validity.notAfter,
  };
}

/** O certificado em base64 sem cabecalho, que e como vai dentro do XML. */
export function certificadoEmBase64(pem: string): string {
  return pem
    .replace(/-----(BEGIN|END) CERTIFICATE-----/g, "")
    .replace(/\s/g, "");
}

/**
 * Assina o DPS.
 *
 * Referencia vazia com enveloped + c14n exclusiva e o que o padrao fiscal
 * brasileiro usa. O `Id` do infDPS e o que a assinatura aponta, entao trocar o
 * formato do Id em layout.ts quebra a assinatura junto — os dois andam juntos
 * de proposito.
 */
export function assinarDps(
  xml: string,
  certificado: ChaveDoCertificado,
  idDoInfDps: string,
): string {
  return assinar(xml, certificado, idDoInfDps, "infDPS", "DPS");
}

/** Mesma assinatura, no pedido de evento (cancelamento). */
export function assinarEvento(
  xml: string,
  certificado: ChaveDoCertificado,
  idDoEvento: string,
): string {
  return assinar(xml, certificado, idDoEvento, "infPedReg", "pedRegEvento");
}

function assinar(
  xml: string,
  certificado: ChaveDoCertificado,
  id: string,
  elementoAssinado: string,
  raiz: string,
): string {
  const assinador = new SignedXml({
    privateKey: certificado.chavePrivadaPem,
    publicCert: certificado.certificadoPem,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
  });

  assinador.addReference({
    xpath: `//*[local-name(.)='${elementoAssinado}']`,
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/2001/10/xml-exc-c14n#",
    ],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    uri: `#${id}`,
  });

  assinador.computeSignature(xml, {
    location: { reference: `//*[local-name(.)='${raiz}']`, action: "append" },
  });

  return assinador.getSignedXml();
}

/** Confere a propria assinatura. E o que o teste usa para provar o caminho. */
export function conferirAssinatura(
  xmlAssinado: string,
  certificadoPem: string,
): boolean {
  const extrair = /<(?:\w+:)?Signature[\s\S]*?<\/(?:\w+:)?Signature>/.exec(
    xmlAssinado,
  );
  if (!extrair) return false;

  const verificador = new SignedXml({ publicCert: certificadoPem });
  verificador.loadSignature(extrair[0]);
  return verificador.checkSignature(xmlAssinado);
}
