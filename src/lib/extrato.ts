// Importacao do extrato do meio de pagamento do escritorio.
//
// A decisao do que cada lancamento significa mora em conciliacao.ts, que e
// puro e testado. Aqui so se busca, se grava e se lanca.
import type { Prisma } from "@prisma/client";
import { comEscritorio, semEscritorio } from "./prisma";
import { chaveDoEscritorio, chamarAsaas } from "./cobrancas";
import { competenciaDe } from "./consumo";
import { moduloAtivo } from "./modulos";
import { lerCsvDaInfinitePay } from "./infinitepay-extrato";
import {
  emCentavos,
  regraDoTipo,
  sugerir,
  type CobrancaAberta,
  type EntradaDoExtrato,
  type Sugestao,
} from "./conciliacao";

/** Quantos lancamentos buscar por vez. O provedor pagina. */
const POR_PAGINA = 100;

function comoData(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

/**
 * Busca o extrato no provedor e grava o que ainda nao estava gravado.
 *
 * O indice unico por (escritorio, id no provedor) e quem impede o mesmo
 * lancamento virar receita duas vezes: importar o mesmo periodo de novo nao
 * duplica nada, so nao acrescenta.
 */
export async function importarExtrato(
  escritorioId: string,
  de: string,
  ate: string,
): Promise<{ lidos: number; novos: number }> {
  const chave = await chaveDoEscritorio(escritorioId);

  let deslocamento = 0;
  let lidos = 0;
  let novos = 0;

  for (let pagina = 0; pagina < 50; pagina++) {
    const resposta = await chamarAsaas(
      chave,
      `/financialTransactions?startDate=${de}&finishDate=${ate}` +
        `&limit=${POR_PAGINA}&offset=${deslocamento}`,
    );
    const linhas = Array.isArray(resposta.data) ? resposta.data : [];
    if (linhas.length === 0) break;

    for (const bruta of linhas as Record<string, unknown>[]) {
      const id = typeof bruta.id === "string" ? bruta.id : null;
      const tipo = typeof bruta.type === "string" ? bruta.type : "";
      const valor = typeof bruta.value === "number" ? bruta.value : null;
      const data = typeof bruta.date === "string" ? bruta.date : null;
      // Lancamento sem id, tipo, valor ou data nao vira registro: metade de um
      // lancamento no financeiro e pior que lancamento nenhum.
      if (!id || !tipo || valor === null || !data) continue;
      lidos++;

      // CONFERIR ANTES DE CRIAR, em vez de adivinhar depois.
      //
      // A primeira versao disto usava upsert e contava como novo tudo o que
      // tinha nascido ha menos de cinco segundos. Reimportar logo depois dizia
      // "4 novos" quando nenhum era novo — o banco estava certo, o indice
      // unico impediu a duplicata, mas a TELA mentia sobre o que entrou. E a
      // tela e onde alguem decide se o financeiro bate.
      const jaExiste = await comEscritorio(escritorioId, (db) =>
        db.entradaDeExtrato.findFirst({
          where: { provedor: "ASAAS", idNoProvedor: id },
          select: { id: true },
        }),
      );
      if (jaExiste) continue;

      await comEscritorio(escritorioId, (db) =>
        db.entradaDeExtrato.create({
          data: semEscritorio({
            provedor: "ASAAS",
            idNoProvedor: id,
            tipo,
            valorCentavos: emCentavos(valor),
            data: comoData(data),
            descricao:
              typeof bruta.description === "string" ? bruta.description : "",
            idDaCobranca:
              typeof bruta.paymentId === "string" ? bruta.paymentId : null,
            destino: regraDoTipo(tipo).destino,
          }),
          select: { id: true },
        }),
      );
      novos++;
    }

    if (linhas.length < POR_PAGINA) break;
    deslocamento += POR_PAGINA;
  }

  return { lidos, novos };
}

/** As cobrancas em aberto do escritorio, como o motor de sugestao espera. */
export async function cobrancasAbertas(
  escritorioId: string,
): Promise<CobrancaAberta[]> {
  const linhas = await comEscritorio(escritorioId, (db) =>
    db.cobranca.findMany({
      where: { status: { in: ["ABERTA", "VENCIDA"] } },
      select: {
        id: true,
        idNoProvedor: true,
        descricao: true,
        valorCentavos: true,
        valorPagoCentavos: true,
        cliente: { select: { nome: true } },
      },
      take: 500,
    }),
  );
  return linhas.map((c) => ({
    id: c.id,
    idNoProvedor: c.idNoProvedor,
    nomeDoCliente: c.cliente.nome,
    descricao: c.descricao,
    faltaCentavos: c.valorCentavos - (c.valorPagoCentavos ?? 0),
  }));
}

/** As entradas pendentes, com a sugestao de cada uma. */
export async function pendentesComSugestao(escritorioId: string): Promise<{
  entradas: Array<{
    id: string;
    tipo: string;
    rotulo: string;
    valorCentavos: number;
    data: Date;
    descricao: string;
    destino: string;
    automatico: boolean;
    sugestao: Sugestao;
  }>;
  abertas: CobrancaAberta[];
}> {
  const [linhas, abertas] = await Promise.all([
    comEscritorio(escritorioId, (db) =>
      db.entradaDeExtrato.findMany({
        where: { situacao: "PENDENTE" },
        orderBy: { data: "desc" },
        take: 300,
      }),
    ),
    cobrancasAbertas(escritorioId),
  ]);

  const paraSugerir: EntradaDoExtrato[] = linhas.map((l) => ({
    id: l.id,
    tipo: l.tipo,
    valorCentavos: l.valorCentavos,
    data: l.data.toISOString().slice(0, 10),
    descricao: l.descricao,
    idDaCobranca: l.idDaCobranca,
  }));
  const sugestoes = sugerir(paraSugerir, abertas);

  return {
    entradas: linhas.map((l) => {
      const regra = regraDoTipo(l.tipo);
      return {
        id: l.id,
        tipo: l.tipo,
        rotulo: regra.rotulo,
        valorCentavos: l.valorCentavos,
        data: l.data,
        descricao: l.descricao,
        destino: regra.destino,
        automatico: regra.automatico,
        sugestao: sugestoes.get(l.id) ?? { tipo: "NENHUMA" },
      };
    }),
    abertas,
  };
}

export class EntradaNaoEncontrada extends Error {
  readonly status = 404;
  constructor() {
    super("Lancamento do extrato nao encontrado.");
    this.name = "EntradaNaoEncontrada";
  }
}

/**
 * Lanca a entrada no financeiro, ou a marca como ignorada.
 *
 * SO MEXE EM ENTRADA PENDENTE. Decidir duas vezes criaria duas linhas no
 * livro-caixa para o mesmo dinheiro — e e exatamente o que acontece quando
 * duas pessoas abrem a tela ao mesmo tempo.
 */
export async function decidirEntrada(
  escritorioId: string,
  id: string,
  acao: { tipo: "LANCAR"; categoria?: string } | { tipo: "IGNORAR" },
): Promise<{ lancamentoId: string | null }> {
  const entrada = await comEscritorio(escritorioId, (db) =>
    db.entradaDeExtrato.findFirst({ where: { id, situacao: "PENDENTE" } }),
  );
  if (!entrada) throw new EntradaNaoEncontrada();

  if (acao.tipo === "IGNORAR") {
    await comEscritorio(escritorioId, (db) =>
      db.entradaDeExtrato.updateMany({
        where: { id, situacao: "PENDENTE" },
        data: { situacao: "IGNORADO", decididoEm: new Date() },
      }),
    );
    return { lancamentoId: null };
  }

  const regra = regraDoTipo(entrada.tipo);
  if (regra.destino === "IGNORAR") {
    // Saque para o banco e movimentacao interna nao viram linha: o valor ja
    // foi contado quando o cliente pagou, e lancar de novo conta duas vezes.
    await comEscritorio(escritorioId, (db) =>
      db.entradaDeExtrato.updateMany({
        where: { id, situacao: "PENDENTE" },
        data: { situacao: "IGNORADO", decididoEm: new Date() },
      }),
    );
    return { lancamentoId: null };
  }

  if (!(await moduloAtivo(escritorioId, "FINANCEIRO"))) {
    // Sem livro-caixa, criar linha seria dado orfao. A entrada sai da lista
    // do mesmo jeito, para nao ficar pedindo decisao que nao tem efeito.
    await comEscritorio(escritorioId, (db) =>
      db.entradaDeExtrato.updateMany({
        where: { id, situacao: "PENDENTE" },
        data: { situacao: "IGNORADO", decididoEm: new Date() },
      }),
    );
    return { lancamentoId: null };
  }

  const quando = entrada.data;
  // "Tarifa de cobranca: Tarifa de cobranca" nao informa nada. Quando o
  // provedor ja descreve o que o rotulo diria, fica so a descricao dele.
  const descricao =
    entrada.descricao.trim().toLowerCase() === regra.rotulo.toLowerCase()
      ? regra.rotulo
      : `${regra.rotulo}: ${entrada.descricao}`;
  const lancamento = await comEscritorio(escritorioId, (db) =>
    db.lancamento.create({
      data: semEscritorio({
        descricao: descricao.slice(0, 200),
        tipo: regra.destino === "RECEITA" ? "RECEITA" : "DESPESA",
        categoria:
          acao.categoria ??
          regra.categoria ??
          (regra.destino === "RECEITA" ? "OUTRAS_RECEITAS" : "OUTRAS_DESPESAS"),
        competencia: competenciaDe(quando),
        valorCentavos: Math.abs(entrada.valorCentavos),
        pagoEm: quando,
      }) as Prisma.LancamentoUncheckedCreateInput,
      select: { id: true },
    }),
  );

  await comEscritorio(escritorioId, (db) =>
    db.entradaDeExtrato.updateMany({
      where: { id, situacao: "PENDENTE" },
      data: {
        situacao: "LANCADO",
        lancamentoId: lancamento.id,
        decididoEm: new Date(),
      },
    }),
  );
  return { lancamentoId: lancamento.id };
}


/**
 * Importa o extrato da InfinitePay a partir do CSV exportado do app deles.
 *
 * Nao ha API para listar transacoes la — so a exportacao do aplicativo. As
 * linhas caem na MESMA fila de conferencia do Asaas, com as mesmas regras:
 * dois extratos, uma tela, um jeito so de decidir.
 */
export async function importarCsvDaInfinitePay(
  escritorioId: string,
  conteudo: string,
): Promise<{
  lidas: number;
  novas: number;
  jaExistiam: number;
  recusadas: Array<{ linha: number; motivo: string }>;
  erro: string | null;
}> {
  const leitura = lerCsvDaInfinitePay(conteudo);
  if (leitura.erro) {
    return { lidas: 0, novas: 0, jaExistiam: 0, recusadas: [], erro: leitura.erro };
  }

  let novas = 0;
  let jaExistiam = 0;

  for (const linha of leitura.linhas) {
    const jaExiste = await comEscritorio(escritorioId, (db) =>
      db.entradaDeExtrato.findFirst({
        where: { provedor: "INFINITEPAY", idNoProvedor: linha.idNoProvedor },
        select: { id: true },
      }),
    );
    if (jaExiste) {
      jaExistiam++;
      continue;
    }

    await comEscritorio(escritorioId, (db) =>
      db.entradaDeExtrato.create({
        data: semEscritorio({
          provedor: "INFINITEPAY",
          idNoProvedor: linha.idNoProvedor,
          tipo: linha.tipo,
          valorCentavos: linha.valorCentavos,
          data: comoData(linha.data),
          descricao: linha.descricao,
          destino: regraDoTipo(linha.tipo).destino,
        }),
        select: { id: true },
      }),
    );
    novas++;
  }

  return {
    lidas: leitura.lidas,
    novas,
    jaExistiam,
    recusadas: leitura.recusadas,
    erro: null,
  };
}
