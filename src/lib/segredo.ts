// Criptografia das credenciais de escritorio (AES-256-GCM).
//
// Credencial de escritorio nunca fica em variavel de ambiente nem em texto
// puro no banco: e serializada em JSON, cifrada com SEGREDO_CHAVE e guardada
// no campo Integracao.dados.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITMO = "aes-256-gcm";
const TAMANHO_IV = 12;

function chave(): Buffer {
  const bruta = process.env.SEGREDO_CHAVE;
  if (!bruta) throw new Error("SEGREDO_CHAVE nao definida.");
  const buf = Buffer.from(bruta, "base64");
  if (buf.length !== 32) {
    throw new Error("SEGREDO_CHAVE precisa ter 32 bytes em base64.");
  }
  return buf;
}

/** Formato guardado: [iv (12) | tag (16) | texto cifrado]. */
export function cifrar(valor: unknown): Buffer {
  const iv = randomBytes(TAMANHO_IV);
  const cipher = createCipheriv(ALGORITMO, chave(), iv);
  const dados = Buffer.concat([
    cipher.update(JSON.stringify(valor), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), dados]);
}

export function decifrar<T = unknown>(pacote: Buffer | Uint8Array): T {
  const buf = Buffer.from(pacote);
  const iv = buf.subarray(0, TAMANHO_IV);
  const tag = buf.subarray(TAMANHO_IV, TAMANHO_IV + 16);
  const decipher = createDecipheriv(ALGORITMO, chave(), iv);
  decipher.setAuthTag(tag);
  const texto = Buffer.concat([
    decipher.update(buf.subarray(TAMANHO_IV + 16)),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(texto) as T;
}
