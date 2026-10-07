// Duplicados no banco.
//
// A regra do que e repeticao mora em duplicados.ts, pura e testada. Aqui so se
// busca e se marca — e marcar, nunca apagar.
import { comEscritorio } from "./prisma";
import {
  acharRepeticoes,
  conflitoDeCliente,
  JANELA_EM_DIAS,
  type Conflito,
} from "./duplicados";

export { mensagemDoConflito } from "./duplicados";

export class ClienteRepetido extends Error {
  readonly status = 409;
  readonly conflito: Conflito;
  constructor(conflito: Conflito, mensagem: string) {
    super(mensagem);
    this.name = "ClienteRepetido";
    this.conflito = conflito;
  }
}

/**
 * Procura cliente repetido antes de gravar.
 *
 * So os campos que decidem: um escritorio com milhares de clientes nao precisa
 * trazer o cadastro inteiro de cada um para comparar nome e documento.
 */
export async function conferirClienteRepetido(
  escritorioId: string,
  novo: { nome: string; documento?: string | null },
  ignorarId?: string,
): Promise<Conflito | null> {
  const existentes = await comEscritorio(escritorioId, (db) =>
    db.cliente.findMany({
      where: ignorarId ? { id: { not: ignorarId } } : undefined,
      select: { id: true, nome: true, documento: true },
      take: 20_000,
    }),
  );
  return conflitoDeCliente(novo, existentes);
}

function emISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Marca as repeticoes entre as publicacoes recentes.
 *
 * So olha a janela em que uma repeticao pode aparecer, e so o que ainda nao
 * foi decidido: publicacao ja marcada, ou ja negada por alguem, nao volta a
 * ser comparada — senao a conferencia de uma pessoa seria desfeita na captura
 * seguinte.
 */
export async function marcarPublicacoesRepetidas(
  escritorioId: string,
  agora = new Date(),
): Promise<{ comparadas: number; repetidas: number; pareceRepetida: number }> {
  const desde = new Date(agora);
  // O dobro da janela: uma publicacao de hoje pode repetir uma de tres dias
  // atras, e essa precisa estar no lote para ser a original.
  desde.setUTCDate(desde.getUTCDate() - JANELA_EM_DIAS * 2 - 1);

  const linhas = await comEscritorio(escritorioId, (db) =>
    db.publicacao.findMany({
      where: {
        dataDisponibilizacao: { gte: desde },
        duplicataDe: null,
        repeticaoNegadaEm: null,
        numeroProcesso: { not: null },
      },
      select: {
        id: true,
        numeroProcesso: true,
        dataDisponibilizacao: true,
        texto: true,
      },
      take: 1000,
    }),
  );

  const marcacoes = acharRepeticoes(
    linhas.map((p) => ({
      id: p.id,
      numeroProcesso: p.numeroProcesso,
      dia: emISO(p.dataDisponibilizacao),
      texto: p.texto,
    })),
  );

  for (const m of marcacoes) {
    await comEscritorio(escritorioId, (db) =>
      db.publicacao.updateMany({
        // So marca o que continua sem decisao: outra rodada pode ter chegado
        // antes, e uma pessoa pode ter negado no meio.
        where: { id: m.id, duplicataDe: null, repeticaoNegadaEm: null },
        data: { duplicataDe: m.duplicataDe, vereditoDeRepeticao: m.veredito },
      }),
    );
  }

  return {
    comparadas: linhas.length,
    repetidas: marcacoes.filter((m) => m.veredito === "REPETIDA").length,
    pareceRepetida: marcacoes.filter((m) => m.veredito === "PARECE_REPETIDA").length,
  };
}

/**
 * Alguem olhou e disse que NAO e repeticao.
 *
 * Fica registrado para a captura seguinte nao marcar de novo: refazer a
 * marcacao desfaria a conferencia de uma pessoa, que e justamente o que vale
 * mais aqui.
 */
export async function negarRepeticao(
  escritorioId: string,
  publicacaoId: string,
): Promise<void> {
  await comEscritorio(escritorioId, (db) =>
    db.publicacao.updateMany({
      where: { id: publicacaoId },
      data: {
        duplicataDe: null,
        vereditoDeRepeticao: null,
        repeticaoNegadaEm: new Date(),
      },
    }),
  );
}

/** Alguem confirmou que e repeticao mesmo. */
export async function confirmarRepeticao(
  escritorioId: string,
  publicacaoId: string,
): Promise<void> {
  await comEscritorio(escritorioId, (db) =>
    db.publicacao.updateMany({
      where: { id: publicacaoId, duplicataDe: { not: null } },
      data: { vereditoDeRepeticao: "REPETIDA", lida: true },
    }),
  );
}
