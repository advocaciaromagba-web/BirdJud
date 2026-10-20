// Honorarios no banco e no provedor.
//
// A regra de quanto e quando mora em honorarios.ts, pura e testada. Aqui so se
// busca o contrato, se pergunta ao plano o que falta e se emite — uma parcela
// por vez, perto do vencimento.
import type { ContratoDeHonorarios, Cliente } from "@prisma/client";
import { comEscritorio, semEscritorio } from "./prisma";
import { emitirCobranca, PedidoInvalido, type Forma } from "./cobrancas";
import { moduloAtivo } from "./modulos";
import {
  impedimentos,
  naJanela,
  planoDoContrato,
  proximaParcela,
  type Contrato,
  type Parcela,
  type Plano,
  vencida,
} from "./honorarios";

/** O contrato do banco, do jeito que o modulo puro entende. */
function comoContrato(c: ContratoDeHonorarios): Contrato {
  return {
    tipo: c.tipo as Contrato["tipo"],
    valorCentavos: c.valorCentavos,
    entradaCentavos: c.entradaCentavos,
    percentualBp: c.percentualBp,
    parcelas: c.parcelas,
    primeiroVencimento: c.primeiroVencimento
      ? c.primeiroVencimento.toISOString().slice(0, 10)
      : null,
    descricao: c.descricao,
    ativo: c.ativo,
  };
}

/** Hoje em Brasilia, como "AAAA-MM-DD". O escritorio nao vive em UTC. */
export function hojeNoEscritorio(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

export type SituacaoDoContrato = {
  contrato: ContratoDeHonorarios;
  plano: Plano;
  /** Numeros de parcela que ja viraram cobranca. */
  jaGeradas: number[];
  proxima: Parcela | null;
  /** A proxima ja chegou perto do vencimento. */
  naJanela: boolean;
  /** A proxima ja venceu sem nunca ter sido emitida. */
  atrasada: boolean;
  /** O que falta no cadastro do cliente para a cobranca sair. */
  impedimentos: string[];
};

export async function situacaoDoContrato(
  escritorioId: string,
  contrato: ContratoDeHonorarios & { cliente: Cliente },
  hoje = hojeNoEscritorio(),
): Promise<SituacaoDoContrato> {
  const plano = planoDoContrato(comoContrato(contrato));

  const geradas = plano.emiteSozinho
    ? await comEscritorio(escritorioId, (db) =>
        db.cobranca.findMany({
          where: { contratoId: contrato.id, NOT: { status: "CANCELADA" } },
          select: { parcelaNumero: true },
        }),
      )
    : [];
  const jaGeradas = geradas
    .map((g) => g.parcelaNumero)
    .filter((n): n is number => typeof n === "number")
    .sort((a, b) => a - b);

  const proxima = proximaParcela(plano, jaGeradas);

  return {
    contrato,
    plano,
    jaGeradas,
    proxima,
    naJanela: !!proxima && naJanela(proxima.vencimento, hoje),
    atrasada: !!proxima && vencida(proxima.vencimento, hoje),
    impedimentos: plano.emiteSozinho ? impedimentos(contrato.cliente) : [],
  };
}

export class ContratoNaoEncontrado extends Error {
  readonly status = 404;
  constructor() {
    super("Contrato de honorários não encontrado.");
    this.name = "ContratoNaoEncontrado";
  }
}

export type ResultadoDaParcela =
  | { ok: true; cobrancaId: string; parcela: Parcela }
  | { ok: false; erro: string };

/**
 * Emite uma parcela do contrato.
 *
 * A chave de operacao e derivada do contrato e do numero da parcela, de
 * proposito: duas chamadas para a mesma parcela sao a MESMA tentativa, nao
 * duas. Quem ganha a corrida emite; quem perde recebe a cobranca que ja
 * existe. O indice unico (contrato, parcela) e a segunda tranca.
 */
export async function gerarParcela(
  escritorioId: string,
  contrato: ContratoDeHonorarios & { cliente: Cliente },
  parcela: Parcela,
): Promise<ResultadoDaParcela> {
  const faltas = impedimentos(contrato.cliente);
  if (faltas.length > 0) return { ok: false, erro: faltas.join("; ") };

  const jaTem = await comEscritorio(escritorioId, (db) =>
    db.cobranca.findFirst({
      where: { contratoId: contrato.id, parcelaNumero: parcela.numero },
      select: { id: true, status: true },
    }),
  );
  if (jaTem && jaTem.status !== "CANCELADA") {
    return { ok: false, erro: `A parcela ${parcela.numero} já tem cobrança.` };
  }

  try {
    const r = await emitirCobranca(escritorioId, {
      chaveOperacao: `contrato:${contrato.id}:parcela:${parcela.numero}`,
      clienteId: contrato.clienteId,
      processoId: contrato.processoId,
      descricao: parcela.descricao,
      valorCentavos: parcela.valorCentavos,
      vencimento: new Date(`${parcela.vencimento}T00:00:00Z`),
      forma: contrato.forma as Forma,
      contrato: { id: contrato.id, numero: parcela.numero, total: parcela.total },
    });
    return { ok: true, cobrancaId: r.id, parcela };
  } catch (erro) {
    if (erro instanceof PedidoInvalido) return { ok: false, erro: erro.message };
    throw erro;
  }
}

/** Emite a proxima parcela de um contrato, se houver e se ja for hora. */
export async function gerarProximaParcela(
  escritorioId: string,
  contratoId: string,
  opcoes: { forcar?: boolean } = {},
): Promise<ResultadoDaParcela> {
  const contrato = await comEscritorio(escritorioId, (db) =>
    db.contratoDeHonorarios.findFirst({
      where: { id: contratoId },
      include: { cliente: true },
    }),
  );
  if (!contrato) throw new ContratoNaoEncontrado();

  const s = await situacaoDoContrato(escritorioId, contrato);
  if (!s.plano.emiteSozinho) return { ok: false, erro: s.plano.motivo };
  if (!s.proxima) return { ok: false, erro: "Todas as parcelas já foram emitidas." };
  // Forcar e decisao de quem olha a tela: "sei que falta, quero antecipar".
  // O cron nunca forca.
  if (s.atrasada) {
    return {
      ok: false,
      erro: `A parcela ${s.proxima.numero} venceu em ${s.proxima.vencimento} e nunca foi emitida: escolha a data da cobrança.`,
    };
  }
  if (!s.naJanela && !opcoes.forcar) {
    return { ok: false, erro: `A parcela ${s.proxima.numero} vence em ${s.proxima.vencimento}: ainda fora da janela.` };
  }
  return gerarParcela(escritorioId, contrato, s.proxima);
}

/**
 * Rotina do dia: emite o que entrou na janela, em um escritorio.
 *
 * So mexe em contrato com emissao automatica ligada. Contrato com a emissao
 * desligada aparece na tela pedindo decisao, e so sai por clique — e e o
 * padrao, porque emitir cobranca no nome do escritorio sem ele mandar e o tipo
 * de automatismo que se descobre pelo cliente reclamando.
 */
export async function emitirParcelasDevidas(
  escritorioId: string,
  hoje = hojeNoEscritorio(),
): Promise<{ analisados: number; emitidas: string[]; falhas: string[] }> {
  const contratos = await comEscritorio(escritorioId, (db) =>
    db.contratoDeHonorarios.findMany({
      where: { ativo: true, emissaoAutomatica: true },
      include: { cliente: true },
    }),
  );

  const emitidas: string[] = [];
  const falhas: string[] = [];

  for (const contrato of contratos) {
    const s = await situacaoDoContrato(escritorioId, contrato, hoje);
    if (!s.plano.emiteSozinho || !s.proxima || !s.naJanela) continue;
    if (s.atrasada) {
      falhas.push(
        `${contrato.cliente.nome}: a parcela ${s.proxima.numero} venceu em ${s.proxima.vencimento} e nunca foi emitida.`,
      );
      continue;
    }
    if (s.impedimentos.length > 0) {
      falhas.push(`${contrato.cliente.nome}: ${s.impedimentos.join("; ")}`);
      continue;
    }
    const r = await gerarParcela(escritorioId, contrato, s.proxima);
    if (r.ok) {
      emitidas.push(
        `${contrato.cliente.nome} — parcela ${r.parcela.numero}/${r.parcela.total} (${r.parcela.vencimento})`,
      );
    } else {
      falhas.push(`${contrato.cliente.nome}: ${r.erro}`);
    }
  }

  return { analisados: contratos.length, emitidas, falhas };
}

export type NovoContrato = {
  clienteId: string;
  processoId?: string | null;
  tipo: Contrato["tipo"];
  valorCentavos?: number | null;
  entradaCentavos?: number | null;
  percentualBp?: number | null;
  parcelas: number;
  primeiroVencimento?: string | null;
  forma: Forma;
  emissaoAutomatica: boolean;
  descricao?: string | null;
};

export async function salvarContrato(
  escritorioId: string,
  dados: NovoContrato,
  contratoId?: string,
): Promise<{ id: string }> {
  const cliente = await comEscritorio(escritorioId, (db) =>
    db.cliente.findFirst({ where: { id: dados.clienteId }, select: { id: true } }),
  );
  if (!cliente) throw new PedidoInvalido("Cliente não encontrado.");

  if (dados.processoId) {
    const processoId = dados.processoId;
    const processo = await comEscritorio(escritorioId, (db) =>
      db.processo.findFirst({ where: { id: processoId }, select: { id: true } }),
    );
    if (!processo) throw new PedidoInvalido("Processo não encontrado.");
  }

  const campos = {
    clienteId: dados.clienteId,
    processoId: dados.processoId ?? null,
    tipo: dados.tipo,
    valorCentavos: dados.valorCentavos ?? null,
    entradaCentavos: dados.entradaCentavos ?? null,
    percentualBp: dados.percentualBp ?? null,
    parcelas: dados.parcelas,
    primeiroVencimento: dados.primeiroVencimento
      ? new Date(`${dados.primeiroVencimento}T00:00:00Z`)
      : null,
    forma: dados.forma,
    emissaoAutomatica: dados.emissaoAutomatica,
    descricao: dados.descricao?.trim() || null,
  };

  if (contratoId) {
    const atual = await comEscritorio(escritorioId, (db) =>
      db.contratoDeHonorarios.findFirst({ where: { id: contratoId }, select: { id: true } }),
    );
    if (!atual) throw new ContratoNaoEncontrado();
    await comEscritorio(escritorioId, (db) =>
      db.contratoDeHonorarios.update({ where: { id: contratoId }, data: campos }),
    );
    await preverRecebimentos(escritorioId, contratoId);
    return { id: contratoId };
  }

  const criado = await comEscritorio(escritorioId, (db) =>
    db.contratoDeHonorarios.create({ data: semEscritorio(campos), select: { id: true } }),
  );
  await preverRecebimentos(escritorioId, criado.id);
  return { id: criado.id };
}

/**
 * Poe as parcelas do contrato no financeiro, A RECEBER.
 *
 * Gravado o contrato na ficha do cliente, cada parcela vira uma linha de
 * receita com vencimento e sem pagamento (pagoEm nulo), ligada ao contrato e
 * ao numero da parcela. E isso que o financeiro mostra como "a receber" e
 * que a conferencia do extrato encontra quando o dinheiro entra.
 *
 * Idempotente e conservadora:
 *  - parcela ja recebida nunca e mexida;
 *  - parcela a receber acompanha o contrato (valor e data editados);
 *  - parcela que saiu do plano (contrato encerrado ou com menos parcelas) so
 *    sai do financeiro se nao tiver cobranca emitida — boleto na rua continua
 *    previsto ate alguem resolver;
 *  - exito (percentual) nao entra: o valor so existe quando a acao termina.
 *
 * Sem o modulo FINANCEIRO nao ha livro-caixa, e nada e criado.
 */
export async function preverRecebimentos(
  escritorioId: string,
  contratoId: string,
): Promise<{ criadas: number; atualizadas: number; removidas: number }> {
  const nada = { criadas: 0, atualizadas: 0, removidas: 0 };
  if (!(await moduloAtivo(escritorioId, "FINANCEIRO"))) return nada;

  return comEscritorio(escritorioId, async (db) => {
    const contrato = await db.contratoDeHonorarios.findFirst({
      where: { id: contratoId },
      include: { cliente: { select: { nome: true } } },
    });
    if (!contrato) return nada;

    const plano = planoDoContrato(comoContrato(contrato));
    const existentes = await db.lancamento.findMany({
      where: { contratoId },
      select: { id: true, parcelaNumero: true, pagoEm: true },
    });
    const cobradas = new Set(
      (
        await db.cobranca.findMany({
          where: { contratoId, NOT: { status: "CANCELADA" } },
          select: { parcelaNumero: true },
        })
      ).map((c) => c.parcelaNumero),
    );

    let criadas = 0;
    let atualizadas = 0;
    let removidas = 0;
    const noPlano = new Set<number>();

    for (const p of plano.parcelas) {
      noPlano.add(p.numero);
      const dados = {
        descricao: `Honorários: ${contrato.cliente.nome} — ${p.descricao}`.slice(0, 200),
        valorCentavos: p.valorCentavos,
        competencia: p.vencimento.slice(0, 7),
        vencimento: new Date(`${p.vencimento}T12:00:00Z`),
      };
      const ja = existentes.find((e) => e.parcelaNumero === p.numero);
      if (!ja) {
        await db.lancamento.create({
          data: semEscritorio({
            ...dados,
            tipo: "RECEITA",
            categoria: "HONORARIOS",
            contratoId,
            parcelaNumero: p.numero,
          }),
        });
        criadas += 1;
      } else if (!ja.pagoEm) {
        await db.lancamento.update({ where: { id: ja.id }, data: dados });
        atualizadas += 1;
      }
    }

    for (const e of existentes) {
      if (e.pagoEm || e.parcelaNumero === null || noPlano.has(e.parcelaNumero)) continue;
      if (cobradas.has(e.parcelaNumero)) continue;
      await db.lancamento.delete({ where: { id: e.id } });
      removidas += 1;
    }

    return { criadas, atualizadas, removidas };
  });
}

/** Todos os contratos do escritorio no financeiro. Roda na rotina diaria. */
export async function preverTodosOsRecebimentos(escritorioId: string): Promise<number> {
  if (!(await moduloAtivo(escritorioId, "FINANCEIRO"))) return 0;
  const contratos = await comEscritorio(escritorioId, (db) =>
    db.contratoDeHonorarios.findMany({ select: { id: true }, take: 2000 }),
  );
  let criadas = 0;
  for (const c of contratos) criadas += (await preverRecebimentos(escritorioId, c.id)).criadas;
  return criadas;
}

/**
 * Encerra o contrato. NAO cancela cobranca ja emitida: boleto na rua e
 * dinheiro que o cliente ja pode ter pago, e desfazer isso e decisao de quem
 * olha a cobranca, uma a uma.
 */
export async function encerrarContrato(
  escritorioId: string,
  contratoId: string,
): Promise<void> {
  const r = await comEscritorio(escritorioId, (db) =>
    db.contratoDeHonorarios.updateMany({
      where: { id: contratoId, ativo: true },
      data: { ativo: false, emissaoAutomatica: false, encerradoEm: new Date() },
    }),
  );
  if (r.count > 0) {
    // As parcelas que ainda nao sairam deixam de ser esperadas no financeiro.
    await preverRecebimentos(escritorioId, contratoId);
    return;
  }

  // Nao mudou nada: ou nao existe, ou ja estava encerrado. Dizer "nao
  // encontrado" para um contrato que a pessoa esta vendo na tela so confunde.
  const existe = await comEscritorio(escritorioId, (db) =>
    db.contratoDeHonorarios.findFirst({ where: { id: contratoId }, select: { id: true } }),
  );
  if (!existe) throw new ContratoNaoEncontrado();
}
