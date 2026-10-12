// Processos cadastrados a partir do DJEN.
//
// Quando o escritorio cadastra uma OAB, o sistema varre o DJEN dos ultimos
// 12 meses daquela OAB e cadastra cada processo encontrado. Depois, em toda
// captura, processo novo que aparece numa publicacao ja entra cadastrado e
// ligado a ela. O cliente vem pelas PARTES intimadas: quando o nome de uma
// delas bate com um unico cliente do escritorio, o processo nasce ligado a
// ele; quando nao bate (ou bate com mais de um), fica sem cliente, com as
// partes guardadas, e liga sozinho quando o cliente for cadastrado.
//
// SEGREDO DE JUSTICA NAO E CADASTRADO SOZINHO. O DJEN publica esses atos com
// as partes em iniciais ou sem o conteudo, e cadastrar com nome errado (ou
// ligar ao cliente errado) e pior que nao cadastrar. Fica para a pessoa, com
// o botao "Cadastrar processo" na publicacao.
//
// A reconferencia da OAB (a API devolve comunicacao de outro advogado junto)
// esta em djen.ts — e o que impede cadastrar processo que nao e do escritorio.
import { Prisma } from "@prisma/client";
import { comEscritorio, semEscritorio } from "./prisma";
import { buscarPeriodo, FalhaNoDjen, type Comunicacao, type ParteDaComunicacao } from "./djen";
import { normalizarNumeroProcesso } from "./leitura-publicacao";
import { mesmoNome, normalizarNome } from "./conciliacao";

const DIA = 24 * 60 * 60 * 1000;
/** Quanto para tras a primeira busca de uma OAB alcanca. */
export const MESES_DA_IMPORTACAO = 12;
/** Janela de cada consulta: o DJEN responde melhor a periodos curtos. */
export const DIAS_POR_JANELA = 30;

/**
 * A comunicacao parece de processo em segredo de justica.
 *
 * O texto diz, ou as partes vem so com iniciais ("J. S. S.", "M.A.S.") ou
 * mascaradas ("***"). Na duvida, trata como segredo: o custo e alguem
 * cadastrar a mao; o do erro e um processo com o cliente errado.
 */
export function pareceSegredo(c: Pick<Comunicacao, "texto" | "partes">): boolean {
  if (/segredo de justi[cç]a|sigilo(so)?\b|tramita em sigilo/i.test(c.texto)) return true;
  return (c.partes ?? []).some((p) => {
    const nome = p.nome.trim();
    if (/\*{2,}/.test(nome)) return true;
    // So iniciais: letras soltas com ponto ou espaco.
    return /^([A-ZÀ-Ý]\.?\s*){2,6}$/.test(nome);
  });
}

/** O cliente das partes, quando o nome bate com UM cliente so. */
export function clienteDasPartes(
  partes: ParteDaComunicacao[],
  clientes: { id: string; nome: string }[],
): string | null {
  const achados = new Set<string>();
  for (const parte of partes) {
    const nomeDaParte = normalizarNome(parte.nome);
    if (nomeDaParte.split(" ").length < 2) continue;
    for (const c of clientes) {
      const nomeDoCliente = normalizarNome(c.nome);
      if (nomeDoCliente.split(" ").length < 2) continue;
      // Igual, ou um contido no outro quando o mais curto tem 3+ palavras:
      // "JOSE DA SILVA" nao pode virar "JOSE DA SILVA SANTOS", que e outra
      // pessoa; "MARIA APARECIDA SOUZA" em "MARIA APARECIDA SOUZA LIMA" e a
      // mesma com o sobrenome de casada.
      const curto = nomeDaParte.length <= nomeDoCliente.length ? nomeDaParte : nomeDoCliente;
      if (nomeDaParte === nomeDoCliente || (palavrasDoNome(curto) >= 3 && mesmoNome(nomeDaParte, nomeDoCliente))) {
        achados.add(c.id);
      }
    }
  }
  return achados.size === 1 ? [...achados][0]! : null;
}

/** Palavras que identificam: "JOSE DA SILVA" tem duas, nao tres. */
function palavrasDoNome(nome: string): number {
  return nome.split(" ").filter((p) => p && !["DA", "DE", "DO", "DAS", "DOS", "E"].includes(p)).length;
}

export type ProcessoDaComunicacao = {
  processoId: string | null;
  criado: boolean;
  clienteId: string | null;
  segredo: boolean;
};

/**
 * O processo da comunicacao: o que ja existe, ou um cadastrado agora. Nao
 * cadastra sem numero nem em segredo de justica.
 */
export async function processoDaComunicacao(
  escritorioId: string,
  c: Comunicacao,
): Promise<ProcessoDaComunicacao> {
  const numero = normalizarNumeroProcesso(c.numeroProcesso);
  const segredo = pareceSegredo(c);
  if (!numero) return { processoId: null, criado: false, clienteId: null, segredo };

  const andamento = {
    ultimoAndamentoEm: c.dataDisponibilizacao,
    ultimoAndamentoTipo: c.tipoComunicacao,
    ultimoAndamentoTexto: c.texto.slice(0, 2000),
  };

  return comEscritorio(escritorioId, async (db) => {
    const existente = await db.processo.findFirst({
      where: { numero },
      select: { id: true, clienteId: true, ultimoAndamentoEm: true, partes: true },
    });
    if (existente) {
      // O andamento so anda para a frente: comunicacao antiga (a busca do ano
      // vem do mais recente para o mais antigo) nao sobrescreve a nova.
      const maisNovo = !existente.ultimoAndamentoEm || existente.ultimoAndamentoEm <= c.dataDisponibilizacao;
      const semPartes = !Array.isArray(existente.partes) || existente.partes.length === 0;
      if (maisNovo || (semPartes && (c.partes ?? []).length > 0)) {
        await db.processo.update({
          where: { id: existente.id },
          data: {
            ...(maisNovo ? andamento : {}),
            ...(semPartes && (c.partes ?? []).length > 0 && !segredo
              ? { partes: c.partes as unknown as Prisma.InputJsonValue }
              : {}),
          },
        });
      }
      return { processoId: existente.id, criado: false, clienteId: existente.clienteId, segredo };
    }
    if (segredo) return { processoId: null, criado: false, clienteId: null, segredo };

    const partes = c.partes ?? [];
    const clientes = partes.length
      ? await db.cliente.findMany({ select: { id: true, nome: true }, take: 5000 })
      : [];
    const clienteId = clienteDasPartes(partes, clientes);
    // Duas capturas ao mesmo tempo: o indice unico (escritorio, numero) segura,
    // e quem perde a corrida le o que a outra criou.
    try {
      const criado = await db.processo.create({
        data: semEscritorio({
          numero,
          tribunal: c.tribunal,
          vara: c.orgao,
          classe: c.classe ?? null,
          origem: "DJEN",
          partes: partes as unknown as Prisma.InputJsonValue,
          clienteId,
          ...andamento,
        }),
        select: { id: true },
      });
      return { processoId: criado.id, criado: true, clienteId, segredo };
    } catch {
      const outro = await db.processo.findFirst({ where: { numero }, select: { id: true, clienteId: true } });
      return { processoId: outro?.id ?? null, criado: false, clienteId: outro?.clienteId ?? null, segredo };
    }
  });
}

export type ResultadoDaImportacao = {
  comunicacoes: number;
  criados: number;
  comCliente: number;
  segredos: number;
  falhas: string[];
};

/**
 * A busca dos processos de uma OAB: 12 meses de DJEN, de 30 em 30 dias, um
 * pedido por vez (limite de taxa). So cadastra processo — nao enche a lista
 * de publicacoes com o historico do ano.
 */
export async function importarProcessosDaOab(
  escritorioId: string,
  oabId: string,
  agora = new Date(),
): Promise<ResultadoDaImportacao> {
  const oab = await comEscritorio(escritorioId, (db) => db.oabMonitorada.findFirst({ where: { id: oabId } }));
  const r: ResultadoDaImportacao = { comunicacoes: 0, criados: 0, comCliente: 0, segredos: 0, falhas: [] };
  if (!oab) return r;

  const inicio = new Date(agora);
  inicio.setMonth(inicio.getMonth() - MESES_DA_IMPORTACAO);
  const vistos = new Set<string>();

  for (let ate = agora; ate > inicio; ) {
    const de = new Date(Math.max(inicio.getTime(), ate.getTime() - DIAS_POR_JANELA * DIA));
    let comunicacoes: Comunicacao[] = [];
    try {
      comunicacoes = await buscarPeriodo({ numeroOab: oab.numero, ufOab: oab.uf, de, ate });
    } catch (erro) {
      r.falhas.push(`${de.toISOString().slice(0, 10)}: ${erro instanceof FalhaNoDjen ? erro.message : String(erro)}`);
    }
    for (const c of comunicacoes) {
      r.comunicacoes += 1;
      const numero = normalizarNumeroProcesso(c.numeroProcesso);
      if (!numero || vistos.has(numero)) continue;
      vistos.add(numero);
      const p = await processoDaComunicacao(escritorioId, c);
      if (p.criado) r.criados += 1;
      if (p.criado && p.clienteId) r.comCliente += 1;
      if (p.segredo && !p.processoId) {
        r.segredos += 1;
        // Segredo de justica fica para a pessoa — mas tem de aparecer: a
        // comunicacao mais recente dele entra em Publicacoes, marcada, com o
        // botao "Cadastrar processo". So uma por processo, e nunca repetida.
        await comEscritorio(escritorioId, async (db) => {
          const ja = await db.publicacao.findFirst({
            where: { OR: [{ idExterno: c.idExterno }, { numeroProcesso: numero, segredo: true }] },
            select: { id: true },
          });
          if (ja) return;
          await db.publicacao.create({
            data: semEscritorio({
              idExterno: c.idExterno,
              numeroProcesso: numero,
              tribunal: c.tribunal,
              orgao: c.orgao,
              tipoComunicacao: c.tipoComunicacao,
              texto: c.texto,
              link: c.link,
              oab: `${oab.numero}/${oab.uf}`,
              dataDisponibilizacao: c.dataDisponibilizacao,
              partes: (c.partes ?? []) as unknown as Prisma.InputJsonValue,
              segredo: true,
            }),
          });
        });
      }
    }
    ate = new Date(de.getTime() - DIA);
  }

  // Marca como importada mesmo com falha de alguma janela: a captura diaria
  // continua cadastrando processo novo, e repetir o ano inteiro a cada falha
  // isolada martelaria o DJEN. A falha fica no log do trabalho.
  if (r.falhas.length < Math.ceil((MESES_DA_IMPORTACAO * 30) / DIAS_POR_JANELA)) {
    await comEscritorio(escritorioId, (db) =>
      db.oabMonitorada.update({ where: { id: oab.id }, data: { processosImportadosEm: agora } }),
    );
  }
  return r;
}

/** Toda OAB ativa que ainda nao teve os processos buscados. */
export async function importarProcessosPendentes(escritorioId: string): Promise<ResultadoDaImportacao> {
  const oabs = await comEscritorio(escritorioId, (db) =>
    db.oabMonitorada.findMany({ where: { ativo: true, processosImportadosEm: null }, select: { id: true } }),
  );
  const total: ResultadoDaImportacao = { comunicacoes: 0, criados: 0, comCliente: 0, segredos: 0, falhas: [] };
  for (const o of oabs) {
    const r = await importarProcessosDaOab(escritorioId, o.id);
    total.comunicacoes += r.comunicacoes;
    total.criados += r.criados;
    total.comCliente += r.comCliente;
    total.segredos += r.segredos;
    total.falhas.push(...r.falhas);
  }
  return total;
}

/**
 * Cliente novo: liga a ele os processos sem cliente cujas partes trazem o
 * nome dele — o processo que o DJEN trouxe antes de o cliente existir.
 */
export async function vincularProcessosAoCliente(escritorioId: string, clienteId: string): Promise<number> {
  return comEscritorio(escritorioId, async (db) => {
    const cliente = await db.cliente.findFirst({ where: { id: clienteId }, select: { id: true, nome: true } });
    if (!cliente) return 0;
    const soltos = await db.processo.findMany({
      where: { clienteId: null, NOT: { partes: { equals: Prisma.DbNull } } },
      select: { id: true, partes: true },
      take: 2000,
    });
    let ligados = 0;
    for (const p of soltos) {
      const partes = (Array.isArray(p.partes) ? p.partes : []) as ParteDaComunicacao[];
      if (clienteDasPartes(partes, [cliente]) === cliente.id) {
        await db.processo.update({ where: { id: p.id }, data: { clienteId: cliente.id } });
        // As publicacoes do processo ja apontam para ele; o cliente vem junto.
        ligados += 1;
      }
    }
    return ligados;
  });
}
