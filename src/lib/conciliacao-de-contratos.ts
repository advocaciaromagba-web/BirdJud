import { comEscritorio } from "./prisma";
import { planoDoContrato } from "./honorarios";
import { comoContrato } from "./honorarios-do-escritorio";
import { emReais } from "./dinheiro";

export type LinhaDaConciliacao = {
  contratoId: string;
  clienteId: string;
  cliente: string;
  descricao: string;
  ativo: boolean;
  /** O que o contrato preve (parte fixa). Zero quando o plano nao fecha sozinho. */
  previstoCentavos: number;
  /** O que esta no livro-caixa ligado ao contrato, recebido ou nao. */
  lancadoCentavos: number;
  /** Cobrancas emitidas (nao canceladas) ligadas ao contrato. */
  cobradoCentavos: number;
  /** O que de fato entrou. */
  recebidoCentavos: number;
  problemas: string[];
};

export type Conciliacao = {
  /** Toda receita com baixa, de qualquer origem. */
  recebidoCentavos: number;
  /** A parte do recebido que veio de parcela de contrato. */
  deContratoCentavos: number;
  /** Receita que entrou sem contrato por tras (lancamento avulso, extrato). */
  avulsoCentavos: number;
  contratos: LinhaDaConciliacao[];
  comProblema: number;
};

/**
 * Confronta o que os CONTRATOS preveem com o que esta LANCADO no financeiro.
 *
 * Tres perguntas que o escritorio nao tinha como responder olhando uma tela
 * de cada vez: de tudo que entrou, quanto veio de contrato? Cada contrato
 * tem no financeiro o que ele preve? Ha cobranca ou lancamento de parcela
 * com valor fora do contrato?
 *
 * So le: nao corrige nada. O conserto e decisao de quem olha o contrato.
 */
export async function conciliarContratos(escritorioId: string): Promise<Conciliacao> {
  const { contratos, lancamentos, cobrancas, receitas } = await comEscritorio(
    escritorioId,
    async (db) => ({
      contratos: await db.contratoDeHonorarios.findMany({
        include: { cliente: { select: { nome: true } } },
        orderBy: [{ ativo: "desc" }, { criadoEm: "asc" }],
        take: 2000,
      }),
      lancamentos: await db.lancamento.findMany({
        where: { contratoId: { not: null } },
        select: { contratoId: true, parcelaNumero: true, valorCentavos: true, pagoEm: true },
      }),
      cobrancas: await db.cobranca.findMany({
        where: { contratoId: { not: null }, NOT: { status: "CANCELADA" } },
        select: { contratoId: true, parcelaNumero: true, valorCentavos: true },
      }),
      receitas: await db.lancamento.findMany({
        where: { tipo: "RECEITA", pagoEm: { not: null } },
        select: { valorCentavos: true, contratoId: true },
      }),
    }),
  );

  const recebidoCentavos = receitas.reduce((t, r) => t + r.valorCentavos, 0);
  const deContratoCentavos = receitas
    .filter((r) => r.contratoId)
    .reduce((t, r) => t + r.valorCentavos, 0);

  const linhas: LinhaDaConciliacao[] = contratos.map((c) => {
    const plano = planoDoContrato(comoContrato(c));
    const doContrato = lancamentos.filter((l) => l.contratoId === c.id);
    const cobradas = cobrancas.filter((x) => x.contratoId === c.id);
    const problemas: string[] = [];

    const previstoCentavos = plano.parcelas.reduce((t, p) => t + p.valorCentavos, 0);
    if (!plano.emiteSozinho && c.ativo && (c.valorCentavos ?? 0) > 0) {
      problemas.push(`Contrato sem plano de parcelas: ${plano.motivo}`);
    }

    for (const p of plano.parcelas) {
      const l = doContrato.find((x) => x.parcelaNumero === p.numero);
      if (!l) {
        if (c.ativo) problemas.push(`Parcela ${p.numero} sem lançamento no financeiro`);
      } else if (l.valorCentavos !== p.valorCentavos) {
        problemas.push(
          `Parcela ${p.numero}: ${l.pagoEm ? "recebido" : "lançado"} ${emReais(l.valorCentavos)}, o contrato prevê ${emReais(p.valorCentavos)}`,
        );
      }
      const cob = cobradas.find((x) => x.parcelaNumero === p.numero);
      if (cob && cob.valorCentavos !== p.valorCentavos) {
        problemas.push(
          `Parcela ${p.numero}: cobrança de ${emReais(cob.valorCentavos)}, o contrato prevê ${emReais(p.valorCentavos)}`,
        );
      }
    }
    for (const cob of cobradas) {
      if (cob.parcelaNumero !== null && !plano.parcelas.some((p) => p.numero === cob.parcelaNumero)) {
        problemas.push(`Cobrança da parcela ${cob.parcelaNumero} (${emReais(cob.valorCentavos)}) não está mais no contrato`);
      }
    }

    return {
      contratoId: c.id,
      clienteId: c.clienteId,
      cliente: c.cliente.nome,
      descricao: c.descricao ?? "",
      ativo: c.ativo,
      previstoCentavos,
      lancadoCentavos: doContrato.reduce((t, l) => t + l.valorCentavos, 0),
      cobradoCentavos: cobradas.reduce((t, x) => t + x.valorCentavos, 0),
      recebidoCentavos: doContrato.filter((l) => l.pagoEm).reduce((t, l) => t + l.valorCentavos, 0),
      problemas,
    };
  });

  return {
    recebidoCentavos,
    deContratoCentavos,
    avulsoCentavos: recebidoCentavos - deContratoCentavos,
    contratos: linhas,
    comProblema: linhas.filter((l) => l.problemas.length > 0).length,
  };
}
