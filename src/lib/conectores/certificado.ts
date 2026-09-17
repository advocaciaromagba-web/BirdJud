// Certificado e-CNPJ A1 do escritorio, usado para assinar a NFS-e.
//
// O teste aqui e de verdade: abre o arquivo com a senha informada, le o titular
// e confere a validade. Certificado vencido ou senha errada nao passa.
import forge from "node-forge";
import { type Conector, type ResultadoTeste } from "./tipos";

export type Leitura = {
  titular: string;
  de: Date;
  ate: Date;
};

/** Abre o PKCS#12 e devolve o primeiro certificado. Lanca se a senha nao abrir. */
export function lerCertificado(pfxBase64: string, senha: string): Leitura {
  const binario = forge.util.decode64(pfxBase64.replace(/\s/g, ""));
  const asn1 = forge.asn1.fromDer(binario);
  // Lanca "Invalid password?" quando a senha nao abre o arquivo.
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, senha);

  const sacos = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];
  const certificado = sacos?.[0]?.cert;
  if (!certificado) throw new Error("O arquivo nao contem certificado.");

  const titular =
    certificado.subject.getField("CN")?.value ?? "titular nao identificado";

  return {
    titular,
    de: certificado.validity.notBefore,
    ate: certificado.validity.notAfter,
  };
}

const DIA = 24 * 60 * 60 * 1000;
const AVISO_DIAS = 30;

/**
 * Regra de validade, separada da leitura do arquivo para poder ser testada com
 * datas escolhidas — gerar um certificado vencido de verdade so com openssl e
 * pouco confiavel entre versoes.
 */
export function avaliarValidade(leitura: Leitura, agora = new Date()): ResultadoTeste {
  const data = (d: Date) => d.toLocaleDateString("pt-BR");

  if (leitura.ate < agora) {
    return { ok: false, detalhe: `Certificado vencido em ${data(leitura.ate)}.` };
  }
  if (leitura.de > agora) {
    return { ok: false, detalhe: "Certificado ainda nao esta valido." };
  }

  const diasRestantes = Math.floor((leitura.ate.getTime() - agora.getTime()) / DIA);
  const aviso = diasRestantes <= AVISO_DIAS ? ` Atencao: vence em ${diasRestantes} dia(s).` : "";
  return {
    ok: true,
    detalhe: `${leitura.titular}, valido ate ${data(leitura.ate)}.${aviso}`,
  };
}

export const conectorCertificado: Conector = {
  tipo: "NFSE_CERT",
  rotulo: "Certificado e-CNPJ (NFS-e)",
  descricao: "Assinatura das notas fiscais com o certificado A1 do escritorio.",
  modulo: "NFSE",
  campos: [
    {
      nome: "arquivo",
      rotulo: "Arquivo .pfx em base64",
      tipo: "textarea",
      obrigatorio: true,
      ajuda: "Converta o .pfx para base64 antes de colar.",
    },
    { nome: "senha", rotulo: "Senha do certificado", tipo: "password", obrigatorio: true },
  ],
  resumo: (dados) => {
    try {
      const leitura = lerCertificado(dados.arquivo, dados.senha);
      return `${leitura.titular} · vence em ${leitura.ate.toLocaleDateString("pt-BR")}`;
    } catch {
      return "Certificado nao pode ser lido.";
    }
  },

  async testar(dados) {
    let leitura: Leitura;
    try {
      leitura = lerCertificado(dados.arquivo, dados.senha);
    } catch (erro) {
      const mensagem = (erro as Error).message;
      return {
        ok: false,
        detalhe: /password/i.test(mensagem)
          ? "Senha do certificado incorreta."
          : `Arquivo invalido: ${mensagem}`,
      };
    }

    return avaliarValidade(leitura);
  },
};
