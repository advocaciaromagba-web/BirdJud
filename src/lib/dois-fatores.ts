// Segundo fator por TOTP (Google Authenticator, Authy, 1Password...).
import { generateSecret, generateURI, verify } from "otplib";

// Tolerancia de 30s para tras e para frente: relogios raramente batem no
// segundo, e um passo de folga e o que os aplicativos assumem.
const TOLERANCIA_SEGUNDOS = 30;

export function gerarSegredo(): string {
  return generateSecret();
}

/** URI do QR Code. O emissor e o nome do escritorio, nao "BirdJud". */
export function urlDeCadastro(emissor: string, email: string, segredo: string): string {
  return generateURI({ issuer: emissor, label: email, secret: segredo });
}

export async function conferirCodigo(codigo: string, segredo: string): Promise<boolean> {
  const limpo = codigo.replace(/\D/g, "");
  if (limpo.length !== 6) return false;
  try {
    const resultado = await verify({
      secret: segredo,
      token: limpo,
      epochTolerance: TOLERANCIA_SEGUNDOS,
    });
    return resultado.valid;
  } catch {
    return false;
  }
}
