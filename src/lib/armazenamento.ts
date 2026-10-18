// Onde o byte do arquivo fica.
//
// Hoje: disco, em um volume do Railway. A escolha e proposital — objeto em
// nuvem de terceiro significaria mais uma credencial da plataforma para
// guardar e mais um servico para o escritorio depender. Quando o volume
// apertar, trocar daqui para S3 e trocar este arquivo: o resto do modulo so
// conhece as quatro funcoes abaixo.
//
// UM DISCO SO, DOIS SERVICOS. O volume do Railway fica preso a UM servico (a
// aplicacao) e nao se compartilha. O trabalhador, que copia para a nuvem e faz
// a purga, nao enxerga esse disco: ate 14/10/2026 ele procurava os arquivos no
// proprio disco, vazio, e a copia para a nuvem falhava (ENOENT). Agora, com
// ARQUIVOS_DA_APLICACAO definido (so no trabalhador), as mesmas funcoes pedem
// a aplicacao pela rede interna — /api/interno/arquivos, com ARQUIVOS_SEGREDO.
// Quem chama nao muda nada.
//
// REGRA QUE NAO SE QUEBRA: o caminho no disco e montado a partir do
// escritorioId e do id do arquivo — os dois gerados por nos. Nada que veio do
// usuario (nome do arquivo, principalmente) entra no caminho. E o que impede
// "../../etc/passwd" de virar caminho valido.
import { createHash } from "node:crypto";
import { appendFile, mkdir, readdir, rename, rm, readFile, writeFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
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

export async function gravarNoDisco(
  escritorioId: string,
  arquivoId: string,
  conteudo: Buffer,
): Promise<{ tamanhoBytes: number; hash: string }> {
  const caminho = caminhoDo(escritorioId, arquivoId);
  await mkdir(join(raiz(), seguro(escritorioId)), { recursive: true });
  await writeFile(caminho, conteudo);
  return {
    tamanhoBytes: conteudo.byteLength,
    hash: createHash("sha256").update(conteudo).digest("hex"),
  };
}

export async function lerDoDisco(
  escritorioId: string,
  arquivoId: string,
): Promise<Buffer> {
  return readFile(caminhoDo(escritorioId, arquivoId));
}

export async function apagarDoDisco(
  escritorioId: string,
  arquivoId: string,
): Promise<void> {
  // force: apagar o que ja nao esta la nao e erro — a linha do banco e que
  // manda, e ela ja vai embora de qualquer jeito.
  await rm(caminhoDo(escritorioId, arquivoId), { force: true });
}

/** Apaga a pasta inteira do escritorio. So a purga usa isto. */
export async function apagarTudoDoDisco(
  escritorioId: string,
): Promise<void> {
  await rm(join(raiz(), seguro(escritorioId)), {
    recursive: true,
    force: true,
  });
}

/** Existe mesmo no disco? Serve a conferencia, nao ao caminho feliz. */
export async function existeNoDisco(
  escritorioId: string,
  arquivoId: string,
): Promise<boolean> {
  try {
    await stat(caminhoDo(escritorioId, arquivoId));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Envio em partes (17/10/2026): arquivo grande — a gravacao inteira de uma
// entrevista — chega em pedacos de alguns MB e vai sendo juntado no disco,
// numa pasta "_envios" do escritorio. Nada disso passa pela memoria inteira
// de uma vez, e nenhum pedido carrega centenas de MB (limite de proxy,
// conexao que cai no meio). So na aplicacao, que e quem tem o disco.
// ---------------------------------------------------------------------------

function pastaDosEnvios(escritorioId: string): string {
  return join(raiz(), seguro(escritorioId), "_envios");
}

function caminhoDoEnvio(escritorioId: string, envio: string): string {
  return join(pastaDosEnvios(escritorioId), seguro(envio));
}

export class EnvioInvalido extends Error {
  constructor(motivo: string, readonly status = 400) {
    super(motivo);
    this.name = "EnvioInvalido";
  }
}

async function tamanhoDe(caminho: string): Promise<number> {
  try {
    return (await stat(caminho)).size;
  } catch {
    return 0;
  }
}

/**
 * Junta mais um pedaco ao envio. `inicio` e onde o pedaco comeca: se ja foi
 * juntado (o navegador reenviou depois de perder a resposta), nao junta de
 * novo; se esta fora de ordem, recusa. Passar do limite apaga o envio.
 */
export async function anexarAoEnvio(
  escritorioId: string,
  envio: string,
  inicio: number,
  pedaco: Buffer,
  limiteBytes: number,
): Promise<number> {
  const caminho = caminhoDoEnvio(escritorioId, envio);
  await mkdir(pastaDosEnvios(escritorioId), { recursive: true });
  const atual = await tamanhoDe(caminho);
  if (inicio === atual - pedaco.byteLength && pedaco.byteLength > 0) return atual;
  if (inicio !== atual) throw new EnvioInvalido(`Pedaco fora de ordem: esperado ${atual}, chegou ${inicio}.`, 409);
  if (atual + pedaco.byteLength > limiteBytes) {
    await rm(caminho, { force: true });
    throw new EnvioInvalido(`O arquivo passou de ${Math.round(limiteBytes / (1024 * 1024))} MB.`, 413);
  }
  await appendFile(caminho, pedaco);
  return atual + pedaco.byteLength;
}

export async function tamanhoDoEnvio(escritorioId: string, envio: string): Promise<number> {
  return tamanhoDe(caminhoDoEnvio(escritorioId, envio));
}

/** O envio completo vira o arquivo `arquivoId`. Hash calculado lendo aos poucos. */
export async function concluirEnvio(
  escritorioId: string,
  envio: string,
  arquivoId: string,
): Promise<{ tamanhoBytes: number; hash: string }> {
  const origem = caminhoDoEnvio(escritorioId, envio);
  const tamanhoBytes = await tamanhoDe(origem);
  if (!tamanhoBytes) throw new EnvioInvalido("Envio vazio ou inexistente.", 404);
  const hash = createHash("sha256");
  for await (const parte of createReadStream(origem)) hash.update(parte as Buffer);
  await rename(origem, caminhoDo(escritorioId, arquivoId));
  return { tamanhoBytes, hash: hash.digest("hex") };
}

export async function descartarEnvio(escritorioId: string, envio: string): Promise<void> {
  await rm(caminhoDoEnvio(escritorioId, envio), { force: true });
}

/** Envio abandonado (a pessoa fechou a tela no meio) ha mais de um dia: apaga. */
export async function limparEnviosVelhos(escritorioId: string, agora = Date.now()): Promise<number> {
  let nomes: string[];
  try {
    nomes = await readdir(pastaDosEnvios(escritorioId));
  } catch {
    return 0;
  }
  let apagados = 0;
  for (const nome of nomes) {
    const caminho = join(pastaDosEnvios(escritorioId), nome);
    const info = await stat(caminho).catch(() => null);
    if (info && agora - info.mtimeMs > 24 * 60 * 60 * 1000) {
      await rm(caminho, { force: true });
      apagados += 1;
    }
  }
  return apagados;
}

/**
 * O arquivo para download, lido aos poucos do disco. null quando o disco nao
 * e local (trabalhador): quem chama cai no `ler` de sempre.
 */
export async function fluxoDoDisco(
  escritorioId: string,
  arquivoId: string,
): Promise<{ fluxo: ReadableStream<Uint8Array>; tamanho: number } | null> {
  if (viaAplicacao()) return null;
  const caminho = caminhoDo(escritorioId, arquivoId);
  const tamanho = (await stat(caminho)).size;
  return { fluxo: Readable.toWeb(createReadStream(caminho)) as ReadableStream<Uint8Array>, tamanho };
}

// ---------------------------------------------------------------------------
// As funcoes que o resto do sistema usa: disco local, ou a aplicacao.
// ---------------------------------------------------------------------------

/** No trabalhador: o endereco interno da aplicacao. Na aplicacao: vazio. */
function viaAplicacao(): { base: string; segredo: string } | null {
  const base = process.env.ARQUIVOS_DA_APLICACAO?.trim();
  if (!base) return null;
  const segredo = process.env.ARQUIVOS_SEGREDO?.trim();
  if (!segredo) throw new Error("ARQUIVOS_DA_APLICACAO definido sem ARQUIVOS_SEGREDO.");
  return { base: base.replace(/\/+$/, ""), segredo };
}

async function pedir(
  metodo: "GET" | "PUT" | "DELETE" | "HEAD",
  escritorioId: string,
  arquivoId: string | null,
  corpo?: Buffer,
): Promise<Response> {
  const remoto = viaAplicacao()!;
  const consulta = new URLSearchParams({ e: seguro(escritorioId) });
  if (arquivoId) consulta.set("a", seguro(arquivoId));
  const r = await fetch(`${remoto.base}/api/interno/arquivos?${consulta}`, {
    method: metodo,
    headers: { "x-segredo-arquivos": remoto.segredo, ...(corpo ? { "content-type": "application/octet-stream" } : {}) },
    body: corpo ? new Uint8Array(corpo) : undefined,
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok && !(metodo === "HEAD" && r.status === 404)) {
    // ENOENT no texto: quem ja trata "arquivo sumido" continua tratando igual.
    throw new Error(`arquivo ${arquivoId ?? "(pasta)"} pela aplicacao: HTTP ${r.status}${r.status === 404 ? " (ENOENT)" : ""}`);
  }
  return r;
}

export async function gravar(
  escritorioId: string,
  arquivoId: string,
  conteudo: Buffer,
): Promise<{ tamanhoBytes: number; hash: string }> {
  if (!viaAplicacao()) return gravarNoDisco(escritorioId, arquivoId, conteudo);
  await pedir("PUT", escritorioId, arquivoId, conteudo);
  return {
    tamanhoBytes: conteudo.byteLength,
    hash: createHash("sha256").update(conteudo).digest("hex"),
  };
}

export async function ler(escritorioId: string, arquivoId: string): Promise<Buffer> {
  if (!viaAplicacao()) return lerDoDisco(escritorioId, arquivoId);
  const r = await pedir("GET", escritorioId, arquivoId);
  return Buffer.from(await r.arrayBuffer());
}

export async function apagar(escritorioId: string, arquivoId: string): Promise<void> {
  if (!viaAplicacao()) return apagarDoDisco(escritorioId, arquivoId);
  await pedir("DELETE", escritorioId, arquivoId);
}

/** Apaga a pasta inteira do escritorio. So a purga usa isto. */
export async function apagarTudoDoEscritorio(escritorioId: string): Promise<void> {
  if (!viaAplicacao()) return apagarTudoDoDisco(escritorioId);
  await pedir("DELETE", escritorioId, null);
}

export async function existe(escritorioId: string, arquivoId: string): Promise<boolean> {
  if (!viaAplicacao()) return existeNoDisco(escritorioId, arquivoId);
  const r = await pedir("HEAD", escritorioId, arquivoId);
  return r.ok;
}

/** O trabalhador consegue falar com a aplicacao? Para o log da partida. */
export async function conferirViaAplicacao(): Promise<string | null> {
  const remoto = viaAplicacao();
  if (!remoto) return null;
  try {
    const r = await fetch(`${remoto.base}/api/interno/arquivos`, {
      method: "HEAD",
      headers: { "x-segredo-arquivos": remoto.segredo },
      signal: AbortSignal.timeout(10_000),
    });
    return r.status === 204 ? `arquivos pela aplicacao: ok (${remoto.base})` : `arquivos pela aplicacao: HTTP ${r.status} (${remoto.base})`;
  } catch (e) {
    return `arquivos pela aplicacao: SEM RESPOSTA (${remoto.base}): ${(e as Error).message}`;
  }
}
