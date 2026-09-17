// Ciclo de vida comercial do escritorio: teste, fatura, atraso e suspensao.
//
// Tudo aqui roda pela fila, um trabalho por escritorio. Nada depende de
// alguem lembrar de rodar um script no fim do mes.
import { comEscritorio, prismaPlataforma, semEscritorio } from "./prisma";
import { competenciaDe, consumoDoMes, type Metrica } from "./consumo";
import { ehFaixa } from "./faixas";
import type { Modulo } from "./modulos";
import {
  excedentes,
  mensalidade,
  PRAZO_MINIMO_DIAS,
  REGUA,
  somar,
  type ItemDaFatura,
} from "./precos";

const DIA = 24 * 60 * 60 * 1000;

export function diasDeAtraso(vencimento: Date, agora = new Date()): number {
  return Math.floor((agora.getTime() - vencimento.getTime()) / DIA);
}

/**
 * Status que o escritorio deve ter, dadas duas coisas: se o periodo de teste
 * ja acabou e qual o atraso da fatura mais antiga em aberto.
 *
 * Funcao pura — e a regra da regua, testavel sem banco.
 */
export function statusPelaRegua(
  statusAtual: string,
  maiorAtraso: number | null,
  testeAcabou = false
): string {
  // Encerrado e decisao humana: a regua nao reativa nem mexe nele.
  if (statusAtual === "ENCERRADO") return "ENCERRADO";

  // Fim do teste vira cliente pagante, mesmo com a primeira fatura ainda a
  // vencer. Sem isso o escritorio ficaria em TESTE para sempre.
  const base = statusAtual === "TESTE" && testeAcabou ? "ATIVO" : statusAtual;

  if (maiorAtraso === null) {
    // Sem fatura em atraso: quem estava devendo volta a ATIVO.
    return base === "INADIMPLENTE" || base === "SUSPENSO" ? "ATIVO" : base;
  }
  if (maiorAtraso >= REGUA.suspenso) return "SUSPENSO";
  if (maiorAtraso >= REGUA.inadimplente) return "INADIMPLENTE";
  return base === "TESTE" ? "ATIVO" : base;
}

/** Vencimento da competencia, respeitando meses curtos. */
export function vencimentoDe(competencia: string, dia: number): Date {
  const [ano, mes] = competencia.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes - 1, Math.min(dia, ultimoDia), 12));
}

/**
 * Vencimento da primeira fatura ou de uma emitida em cima da data.
 *
 * Nunca antes de PRAZO_MINIMO_DIAS a partir da emissao: fatura que nasce
 * vencida transformaria o fim do teste em inadimplencia imediata.
 */
export function vencimentoComPrazo(
  competencia: string,
  dia: number,
  emissao: Date
): Date {
  const doMes = vencimentoDe(competencia, dia);
  const minimo = new Date(emissao.getTime() + PRAZO_MINIMO_DIAS * DIA);
  return doMes >= minimo ? doMes : minimo;
}

export type ResultadoDaRegua = {
  faturaGerada: string | null;
  statusAnterior: string;
  statusNovo: string;
};

/**
 * Passa a regua em um escritorio: gera a fatura do mes quando o teste acabou,
 * e ajusta o status conforme o atraso.
 */
export async function aplicarRegua(
  escritorioId: string,
  agora = new Date()
): Promise<ResultadoDaRegua> {
  const escritorio = await prismaPlataforma().escritorio.findUniqueOrThrow({
    where: { id: escritorioId },
    include: { assinatura: true },
  });

  let faturaGerada: string | null = null;
  const assinatura = escritorio.assinatura;

  // 1. Fatura do mes — so depois do periodo de teste, e so uma por competencia.
  if (assinatura && !assinatura.canceladaEm && assinatura.fimDoTeste <= agora) {
    const competencia = competenciaDe(agora);
    const existente = await prismaPlataforma().fatura.findUnique({
      where: { escritorioId_competencia: { escritorioId, competencia } },
    });

    if (!existente) {
      const itens = await itensDaFatura(escritorioId, escritorio.faixa, competencia);
      const fatura = await prismaPlataforma().fatura.create({
        data: {
          escritorioId,
          competencia,
          valorCentavos: somar(itens),
          detalhe: itens,
          vencimento: vencimentoComPrazo(competencia, assinatura.diaVencimento, agora),
        },
      });
      faturaGerada = fatura.id;
    }
  }

  // 2. Status pelo atraso da fatura em aberto mais antiga.
  const maisAntiga = await prismaPlataforma().fatura.findFirst({
    where: { escritorioId, status: "ABERTA" },
    orderBy: { vencimento: "asc" },
  });
  const atraso = maisAntiga ? diasDeAtraso(maisAntiga.vencimento, agora) : null;
  const testeAcabou = Boolean(assinatura && !assinatura.canceladaEm && assinatura.fimDoTeste <= agora);
  const statusNovo = statusPelaRegua(
    escritorio.status,
    atraso !== null && atraso > 0 ? atraso : null,
    testeAcabou
  );

  if (statusNovo !== escritorio.status) {
    await prismaPlataforma().escritorio.update({
      where: { id: escritorioId },
      data: { status: statusNovo },
    });
  }

  return { faturaGerada, statusAnterior: escritorio.status, statusNovo };
}

/** Faixa + modulos contratados + excedentes do mes. */
export async function itensDaFatura(
  escritorioId: string,
  faixaBruta: string,
  competencia: string
): Promise<ItemDaFatura[]> {
  const faixa = ehFaixa(faixaBruta) ? faixaBruta : "ATE_3";

  const modulos = await comEscritorio(escritorioId, (db) =>
    db.moduloContratado.findMany({ where: { ativo: true } })
  );

  const consumo = await consumoDoMes(escritorioId, competencia);

  return [
    ...mensalidade(
      faixa,
      modulos.map((m) => m.modulo as Modulo)
    ),
    ...excedentes(consumo as { metrica: Metrica; excedente: number }[]),
  ];
}

/** Marca a fatura como paga e devolve o escritorio ao ar, se for o caso. */
export async function registrarPagamento(
  faturaId: string,
  idExterno: string | null = null,
  agora = new Date()
): Promise<{ escritorioId: string; statusNovo: string }> {
  const fatura = await prismaPlataforma().fatura.update({
    where: { id: faturaId },
    data: { status: "PAGA", pagoEm: agora, idExterno },
  });

  const resultado = await aplicarRegua(fatura.escritorioId, agora);
  return { escritorioId: fatura.escritorioId, statusNovo: resultado.statusNovo };
}

/** Cria a assinatura no cadastro, ja com o periodo de teste correndo. */
export async function criarAssinatura(
  escritorioId: string,
  valorCentavos: number,
  diasDeTeste: number,
  agora = new Date()
) {
  return prismaPlataforma().assinatura.create({
    data: {
      escritorioId,
      valorCentavos,
      fimDoTeste: new Date(agora.getTime() + diasDeTeste * DIA),
    },
  });
}

export { semEscritorio };
