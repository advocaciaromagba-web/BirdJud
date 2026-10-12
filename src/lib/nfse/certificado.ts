// Certificado ICP-Brasil (.pfx/.p12) pronto para os dois usos da NFS-e:
//
//  - conexao com a API nacional (TLS mutuo — o Node/OpenSSL 3 recusa .pfx
//    gerado com as cifras antigas RC2/3DES, que e como a maioria das AC ainda
//    entrega; por isso o arquivo e reempacotado com AES so em memoria);
//  - assinatura XML da DPS e do pedido de cancelamento (chave e certificado
//    em PEM).
//
// A API exige que a DPS seja assinada pelo certificado do PROPRIO emitente
// (rejeicao E0718): para emitir pela sociedade, o certificado tem de ser o
// e-CNPJ dela. e-CPF do advogado conecta e consulta, mas nao emite.
//
// A SENHA NAO FICA GUARDADA. O titular digita a cada assinatura; o arquivo
// fica cifrado em Integracoes (NFSE_CERT). Assim ninguem alem dele emite,
// cancela ou consulta com o certificado da sociedade.
import forge from "node-forge";

export type CertificadoCarregado = {
  pfxTls: Buffer;
  senha: string;
  chavePem: string;
  certPem: string;
  titular: string;
  /** CNPJ do titular quando e e-CNPJ (so digitos), senao null. */
  cnpj: string | null;
  /** CPF do titular quando e e-CPF (so digitos), senao null. */
  cpf: string | null;
  validoDesde: Date;
  validoAte: Date;
};

export class CertificadoInvalido extends Error {
  readonly status = 422;
  constructor(motivo: string) {
    super(motivo);
    this.name = "CertificadoInvalido";
  }
}

export function carregarCertificado(pfx: Buffer, senha: string): CertificadoCarregado {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(pfx.toString("binary")), false, senha);
  } catch (e) {
    if (/mac|invalid password|integrity/i.test(String((e as Error)?.message))) {
      throw new CertificadoInvalido("Senha do certificado incorreta.");
    }
    throw new CertificadoInvalido("Nao foi possivel abrir o certificado. Confira o arquivo (.pfx) e a senha.");
  }

  const chaves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  const chave = chaves.find((b) => b.key)?.key as forge.pki.rsa.PrivateKey | undefined;
  if (!chave) throw new CertificadoInvalido("O arquivo nao contem a chave privada do certificado.");

  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => !!c);
  // O certificado do titular e o que corresponde a chave privada (os demais
  // sao da cadeia da AC).
  const titularCert =
    certs.find((c) => (c.publicKey as forge.pki.rsa.PublicKey).n.equals(chave.n)) ??
    certs.find((c) => !(c.getExtension("basicConstraints") as { cA?: boolean } | undefined)?.cA);
  if (!titularCert) throw new CertificadoInvalido("Nao foi encontrado o certificado do titular dentro do arquivo.");

  const cn = String(titularCert.subject.getField("CN")?.value ?? "");
  // Padrao ICP-Brasil: "NOME:CPF(11)" no e-CPF e "RAZAO SOCIAL:CNPJ(14)" no e-CNPJ.
  const doc = cn.match(/:(\d{11}|\d{14})$/)?.[1] ?? null;

  const novo = forge.pkcs12.toPkcs12Asn1(chave, certs, senha, { algorithm: "aes256" });
  return {
    pfxTls: Buffer.from(forge.asn1.toDer(novo).getBytes(), "binary"),
    senha,
    chavePem: forge.pki.privateKeyToPem(chave),
    certPem: forge.pki.certificateToPem(titularCert),
    titular: cn.replace(/:\d+$/, ""),
    cnpj: doc && doc.length === 14 ? doc : null,
    cpf: doc && doc.length === 11 ? doc : null,
    validoDesde: titularCert.validity.notBefore,
    validoAte: titularCert.validity.notAfter,
  };
}

/** O arquivo como fica guardado em Integracoes (base64). */
export function carregarDeBase64(pfxBase64: string, senha: string): CertificadoCarregado {
  return carregarCertificado(Buffer.from(pfxBase64.replace(/\s/g, ""), "base64"), senha);
}
