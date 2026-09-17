// Hash de senha (bcrypt). Nenhuma senha em texto puro sai daqui.
import bcrypt from "bcryptjs";

const CUSTO = 12;

export async function gerarHash(senha: string): Promise<string> {
  if (senha.length < 10) {
    throw new Error("A senha precisa ter ao menos 10 caracteres.");
  }
  return bcrypt.hash(senha, CUSTO);
}

export async function conferirSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}
