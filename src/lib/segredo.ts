// Criptografia das credenciais de escritorio (AES-256-GCM).
//
// Credencial de escritorio nunca fica em variavel de ambiente nem em texto
// puro no banco: e serializada em JSON, cifrada com SEGREDO_CHAVE e guardada
// no campo Integracao.dados.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITMO = "aes-256-gcm";
const TAMANHO_IV = 12;

/** Le uma chave de 32 bytes em base64 de uma variavel de ambiente. */
export function chaveDaVariavel(nome: string): Buffer {
  const bruta = process.env[nome];
  if (!bruta) throw new Error(`${nome} não definida.`);
  const buf = Buffer.from(bruta, "base64");
  if (buf.length !== 32) {
    throw new Error(`${nome} precisa ter 32 bytes em base64.`);
  }
  return buf;
}

function chave(): Buffer {
  return chaveDaVariavel("SEGREDO_CHAVE");
}

/** Formato guardado: [iv (12) | tag (16) | texto cifrado]. */
export function cifrar(valor: unknown): Buffer {
  return cifrarCom(valor, chave());
}

export function decifrar<T = unknown>(pacote: Buffer | Uint8Array): T {
  return decifrarCom<T>(pacote, chave());
}

/**
 * As mesmas operacoes com a chave em maos. Existe para a troca de chave
 * (scripts/trocar-segredo-chave.ts): decifra com a antiga, cifra com a nova.
 */
export function cifrarCom(valor: unknown, chave: Buffer): Buffer {
  const iv = randomBytes(TAMANHO_IV);
  const cipher = createCipheriv(ALGORITMO, chave, iv);
  const dados = Buffer.concat([
    cipher.update(JSON.stringify(valor), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), dados]);
}

export function decifrarCom<T = unknown>(pacote: Buffer | Uint8Array, chave: Buffer): T {
  const buf = Buffer.from(pacote);
  const iv = buf.subarray(0, TAMANHO_IV);
  const tag = buf.subarray(TAMANHO_IV, TAMANHO_IV + 16);
  const decipher = createDecipheriv(ALGORITMO, chave, iv);
  decipher.setAuthTag(tag);
  const texto = Buffer.concat([
    decipher.update(buf.subarray(TAMANHO_IV + 16)),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(texto) as T;
}
