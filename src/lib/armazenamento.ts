// Onde o byte do arquivo fica.
//
// Hoje: disco, em um volume do Railway. A escolha e proposital — objeto em
// nuvem de terceiro significaria mais uma credencial da plataforma para
// guardar e mais um servico para o escritorio depender. Quando o volume
// apertar, trocar daqui para S3 e trocar este arquivo: o resto do modulo so
// conhece as quatro funcoes abaixo.
//
// REGRA QUE NAO SE QUEBRA: o caminho no disco e montado a partir do
// escritorioId e do id do arquivo — os dois gerados por nos. Nada que veio do
// usuario (nome do arquivo, principalmente) entra no caminho. E o que impede
// "../../etc/passwd" de virar caminho valido.
import { createHash } from "node:crypto";
import { mkdir, rm, readFile, writeFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

export function raiz(): string {
  return process.env.RAIZ_ARQUIVOS ?? resolve(process.cwd(), "dados/arquivos");
}

/** Um identificador nosso, e so isso. Barra, ponto e espaco nao passam. */
function seguro(parte: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(parte)) {
    throw new Error("Identificador invalido para caminho de arquivo.");
  }
  return parte;
}

export function caminhoDo(escritorioId: string, arquivoId: string): string {
  return join(raiz(), seguro(escritorioId), seguro(arquivoId));
}

export async function gravar(
  escritorioId: string,
  arquivoId: string,
  conteudo: Buffer
): Promise<{ tamanhoBytes: number; hash: string }> {
  const caminho = caminhoDo(escritorioId, arquivoId);
  await mkdir(join(raiz(), seguro(escritorioId)), { recursive: true });
  await writeFile(caminho, conteudo);
  return {
    tamanhoBytes: conteudo.byteLength,
    hash: createHash("sha256").update(conteudo).digest("hex"),
  };
}

export async function ler(escritorioId: string, arquivoId: string): Promise<Buffer> {
  return readFile(caminhoDo(escritorioId, arquivoId));
}

export async function apagar(escritorioId: string, arquivoId: string): Promise<void> {
  // force: apagar o que ja nao esta la nao e erro — a linha do banco e que
  // manda, e ela ja vai embora de qualquer jeito.
  await rm(caminhoDo(escritorioId, arquivoId), { force: true });
}

/** Apaga a pasta inteira do escritorio. So a purga usa isto. */
export async function apagarTudoDoEscritorio(escritorioId: string): Promise<void> {
  await rm(join(raiz(), seguro(escritorioId)), { recursive: true, force: true });
}

/** Existe mesmo no disco? Serve a conferencia, nao ao caminho feliz. */
export async function existe(escritorioId: string, arquivoId: string): Promise<boolean> {
  try {
    await stat(caminhoDo(escritorioId, arquivoId));
    return true;
  } catch {
    return false;
  }
}
