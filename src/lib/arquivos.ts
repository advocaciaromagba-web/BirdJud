// Modulo NUVEM: os documentos do escritorio, guardados por escritorio.
//
// O que existe aqui e o que um escritorio precisa de verdade — subir a peca,
// achar depois, amarrar ao processo ou ao cliente, e apagar. Versionamento,
// pastas e edicao colaborativa ficam de fora: e o Drive de cada um que faz
// isso, e meia implementacao disso seria pior que nenhuma.
import { comEscritorio, semEscritorio } from "./prisma";
import { definirConsumo } from "./consumo";
import * as disco from "./armazenamento";

/** Teto por arquivo. Peca judicial passa longe disso; video nao entra. */
export const TAMANHO_MAXIMO_MB = 25;

/** Espaco do escritorio quando o modulo nao traz franquia declarada. */
export const FRANQUIA_PADRAO_MB = 1024;

/**
 * Quanto o escritorio pode passar da franquia antes de ser barrado.
 *
 * Nao e generosidade: excedente e cobrado, e barrar no primeiro megabyte a
 * mais faria o escritorio perder documento em dia de audiencia. O teto existe
 * para que engano (ou abuso) nao vire conta impagavel nem disco cheio.
 */
export const FATOR_DO_TETO = 3;

const MB = 1024 * 1024;

/**
 * O que entra.
 *
 * Lista fechada, nao lista de proibidos: tipo novo perigoso aparece toda
 * semana, tipo novo util aparece uma vez por ano. O que falta aqui se
 * acrescenta com uma linha, sabendo o que se esta deixando entrar.
 */
export const TIPOS_ACEITOS: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/heic": ["heic"],
  "text/plain": ["txt"],
  "text/csv": ["csv"],
  "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    "docx",
  ],
  "application/vnd.oasis.opendocument.text": ["odt"],
  "application/vnd.ms-excel": ["xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/zip": ["zip"],
  "application/x-pkcs7-certificates": ["p7b", "p7s"],
};

export class ArquivoRecusado extends Error {
  readonly status: number;
  constructor(motivo: string, status = 422) {
    super(motivo);
    this.name = "ArquivoRecusado";
    this.status = status;
  }
}

export class EspacoEsgotado extends Error {
  readonly status = 507;
  constructor(usadoMb: number, tetoMb: number) {
    super(
      `O espaco do escritorio acabou: ${usadoMb} MB usados de um teto de ${tetoMb} MB. Apague o que nao serve mais ou fale com o suporte para aumentar o plano.`,
    );
    this.name = "EspacoEsgotado";
  }
}

export function extensaoDe(nome: string): string {
  const pedaco = nome.split(".").pop() ?? "";
  return pedaco.toLowerCase();
}

/**
 * O tipo declarado e a extensao contam a mesma historia?
 *
 * O navegador manda o tipo; o nome vem do usuario. Exigir que os dois batam
 * evita o caso simples de renomear "x.exe" para "x.pdf" e torcer.
 */
export function tipoConfere(tipo: string, nome: string): boolean {
  const extensoes = TIPOS_ACEITOS[tipo];
  if (!extensoes) return false;
  return extensoes.includes(extensaoDe(nome));
}

/** Nome que volta para o navegador: sem caminho, sem aspas, sem quebra. */
export function nomeLimpo(nome: string): string {
  const semCaminho = nome.split(/[\\/]/).pop() ?? "arquivo";
  const limpo = semCaminho.replace(/[\u0000-\u001f"\\]/g, "").trim();
  return limpo.slice(0, 120) || "arquivo";
}

export function emMb(bytes: number): number {
  return Math.ceil(bytes / MB);
}

export type EspacoDoEscritorio = {
  usadoMb: number;
  franquiaMb: number;
  tetoMb: number;
  arquivos: number;
};

export async function espacoDoEscritorio(
  escritorioId: string,
): Promise<EspacoDoEscritorio> {
  const { soma, contrato } = await comEscritorio(escritorioId, async (db) => ({
    soma: await db.arquivo.aggregate({
      _sum: { tamanhoBytes: true },
      _count: true,
    }),
    contrato: await db.moduloContratado.findFirst({
      where: { modulo: "NUVEM", ativo: true },
    }),
  }));

  const franquiaMb = contrato?.franquia ?? FRANQUIA_PADRAO_MB;
  return {
    usadoMb: emMb(soma._sum.tamanhoBytes ?? 0),
    franquiaMb,
    tetoMb: franquiaMb * FATOR_DO_TETO,
    arquivos: soma._count,
  };
}

/** Grava o retrato do espaco usado no consumo do mes. */
export async function medirEspaco(escritorioId: string): Promise<number> {
  const espaco = await espacoDoEscritorio(escritorioId);
  await definirConsumo(escritorioId, "ARMAZENAMENTO_MB", espaco.usadoMb);
  return espaco.usadoMb;
}

export type PedidoDeArquivo = {
  nome: string;
  tipo: string;
  conteudo: Buffer;
  usuarioId: string;
  clienteId?: string | null;
  processoId?: string | null;
  descricao?: string | null;
};

/**
 * Guarda o arquivo.
 *
 * Ordem: valida, grava a linha (para ter um id nosso), grava o byte, e so
 * entao completa a linha com tamanho e hash. Se o disco falhar no meio, a
 * linha meia-boca e apagada — nao fica registro apontando para arquivo que
 * nao existe.
 */
export async function guardarArquivo(
  escritorioId: string,
  pedido: PedidoDeArquivo,
): Promise<{ id: string; nome: string; tamanhoBytes: number }> {
  const nome = nomeLimpo(pedido.nome);

  if (pedido.conteudo.byteLength === 0)
    throw new ArquivoRecusado("Arquivo vazio.");
  if (pedido.conteudo.byteLength > TAMANHO_MAXIMO_MB * MB) {
    throw new ArquivoRecusado(
      `Arquivo maior que ${TAMANHO_MAXIMO_MB} MB.`,
      413,
    );
  }
  if (!tipoConfere(pedido.tipo, nome)) {
    throw new ArquivoRecusado(
      `Tipo de arquivo nao aceito (${pedido.tipo || "sem tipo"} / .${extensaoDe(nome)}).`,
    );
  }

  const espaco = await espacoDoEscritorio(escritorioId);
  if (espaco.usadoMb + emMb(pedido.conteudo.byteLength) > espaco.tetoMb) {
    throw new EspacoEsgotado(espaco.usadoMb, espaco.tetoMb);
  }

  const arquivo = await comEscritorio(escritorioId, (db) =>
    db.arquivo.create({
      data: semEscritorio({
        nome,
        tipo: pedido.tipo,
        descricao: pedido.descricao ?? null,
        tamanhoBytes: 0,
        usuarioId: pedido.usuarioId,
        clienteId: pedido.clienteId ?? null,
        processoId: pedido.processoId ?? null,
      }),
    }),
  );

  try {
    const gravado = await disco.gravar(
      escritorioId,
      arquivo.id,
      pedido.conteudo,
    );
    await comEscritorio(escritorioId, (db) =>
      db.arquivo.update({
        where: { id: arquivo.id },
        data: { tamanhoBytes: gravado.tamanhoBytes, hash: gravado.hash },
      }),
    );
    await medirEspaco(escritorioId);
    return { id: arquivo.id, nome, tamanhoBytes: gravado.tamanhoBytes };
  } catch (erro) {
    await comEscritorio(escritorioId, (db) =>
      db.arquivo.delete({ where: { id: arquivo.id } }),
    ).catch(() => {});
    await disco.apagar(escritorioId, arquivo.id).catch(() => {});
    throw erro;
  }
}

export class ArquivoNaoEncontrado extends Error {
  readonly status = 404;
  constructor() {
    super("Arquivo nao encontrado.");
    this.name = "ArquivoNaoEncontrado";
  }
}

/**
 * Le o arquivo para download.
 *
 * A linha do banco vem primeiro e e ela que da o caminho. Sem linha visivel
 * para este escritorio, nao ha leitura — o RLS decide, nao o caminho.
 */
export async function lerArquivo(
  escritorioId: string,
  id: string,
): Promise<{ nome: string; tipo: string; conteudo: Buffer }> {
  const arquivo = await comEscritorio(escritorioId, (db) =>
    db.arquivo.findUnique({ where: { id } }),
  );
  if (!arquivo) throw new ArquivoNaoEncontrado();

  try {
    const conteudo = await disco.ler(escritorioId, arquivo.id);
    return { nome: arquivo.nome, tipo: arquivo.tipo, conteudo };
  } catch {
    throw new ArquivoNaoEncontrado();
  }
}

export async function apagarArquivo(
  escritorioId: string,
  id: string,
): Promise<void> {
  const arquivo = await comEscritorio(escritorioId, (db) =>
    db.arquivo.findUnique({ where: { id } }),
  );
  if (!arquivo) throw new ArquivoNaoEncontrado();

  await comEscritorio(escritorioId, (db) =>
    db.arquivo.delete({ where: { id } }),
  );
  await disco.apagar(escritorioId, id);
  await medirEspaco(escritorioId);
}
