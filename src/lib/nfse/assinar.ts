// Assinatura XMLDSig envelopada do elemento com Id (infDPS ou infPedReg),
// inserida logo depois dele — como o XSD manda (infDPS seguido de Signature).
//
// RSA-SHA1 com C14N inclusiva, sem prefixo de namespace: e o que a Sefin
// Nacional aceita em producao (a API rejeita prefixo na area de dados, E1228).
import { SignedXml } from "xml-crypto";
import type { CertificadoCarregado } from "./certificado";

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const RSA_SHA1 = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
const SHA1 = "http://www.w3.org/2000/09/xmldsig#sha1";

export function assinarXml(
  xml: string,
  elemento: "infDPS" | "infPedReg",
  cert: Pick<CertificadoCarregado, "chavePem" | "certPem">,
): string {
  const sig = new SignedXml({
    privateKey: cert.chavePem,
    publicCert: cert.certPem,
    signatureAlgorithm: RSA_SHA1,
    canonicalizationAlgorithm: C14N,
  });
  sig.addReference({
    xpath: `//*[local-name(.)='${elemento}']`,
    transforms: [ENVELOPED, C14N],
    digestAlgorithm: SHA1,
  });
  sig.computeSignature(xml, { location: { reference: `//*[local-name(.)='${elemento}']`, action: "after" } });
  return sig.getSignedXml();
}

/** Confere a propria assinatura. E o que o teste usa para provar o caminho. */
export function conferirAssinatura(xmlAssinado: string, certPem: string): boolean {
  const assinatura = /<Signature[\s\S]*?<\/Signature>/.exec(xmlAssinado);
  if (!assinatura) return false;
  const verificador = new SignedXml({ publicCert: certPem });
  verificador.loadSignature(assinatura[0]);
  return verificador.checkSignature(xmlAssinado);
}
