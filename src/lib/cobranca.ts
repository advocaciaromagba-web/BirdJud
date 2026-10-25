// Ciclo de vida comercial do escritorio: teste, fatura, atraso e suspensao.
//
// Tudo aqui roda pela fila, um trabalho por escritorio. Nada depende de
// alguem lembrar de rodar um script no fim do mes.
import type { Prisma } from "@prisma/client";
import { comEscritorio, prismaPlataforma, semEscritorio } from "./prisma";
import { competenciaDe, consumoDoMes, type Metrica } from "./consumo";
import { ehFaixa } from "./faixas";
import {
  descontoDaFatura,
  mesesDaFatura,
  emitirCobrancaDaFatura,
  mensagemDaFatura,
  temCobrancaDaPlataforma,
} from "./cobranca-plataforma";
import {
  enviarPelaPlataforma,
  temRemetenteDaPlataforma,
} from "./email-plataforma";
import type { Modulo } from "./modulos";
import { MODULOS } from "./catalogo";
import {
  excedentes,
  PRAZO_MINIMO_DIAS,
  REGUA,
  somar,
  TABELA_PADRAO,
  type ItemDaFatura,
  percentualEmTexto,
  type TabelaDePrecos,
} from "./precos";
import { tabelaVigente } from "./tabela-de-precos";
import { cupomValeEm, linhaDoCupom, mesesCobertos, type CupomNaConta } from "./cupons";
import { contaMontada } from "./planos";
import { avisarCobranca } from "./avisos-de-cobranca";
import { enfileirar } from "./fila";
import type { Faixa } from "./faixas";

/**
 * A mensalidade que a fatura cobra: a MESMA conta da vitrine (contaMontada).
 *
 * Ate 14/10/2026 a fatura somava a faixa e o preco de TABELA de cada modulo —
 * sem o pacote e sem o fator da faixa. Um escritorio no Completo pagaria a
 * soma avulsa, mais cara que o plano que a vitrine mostrou. Agora: plano
 * pronto quando cobre e sai mais barato; senao faixa e modulos com o fator.
 */
export function mensalidadeDaConta(faixa: Faixa, modulos: Modulo[], tabela: TabelaDePrecos = TABELA_PADRAO): ItemDaFatura[] {
  const conta = contaMontada(modulos, faixa, tabela);
  if (conta.plano) {
    return [{ descricao: `Plano ${conta.plano} (${faixa})`, valorCentavos: conta.totalCentavos }];
  }
  return [
    { descricao: `Faixa ${faixa}`, valorCentavos: conta.faixaCentavos },
    ...conta.modulos.map((m) => ({ descricao: `Modulo ${m.modulo}`, valorCentavos: m.valorCentavos })),
  ];
}

/**
 * A mensalidade de UM escritorio: o valor fechado na assinatura.
 *
 * Contrato assinado nao muda com a tabela (Assinatura.valorCentavos, ver
 * docs/PLANOS.md). Ate 14/10/2026 a fatura recalculava pela tabela e ignorava
 * esse valor — baixar a tabela, como se fez nesse dia, mudaria todo contrato.
 * Sem valor gravado (zero), vale a conta da vitrine.
 */
export function mensalidadeDoEscritorio(
  faixa: Faixa,
  modulos: Modulo[],
  valorFechado: number | null | undefined,
  tabela: TabelaDePrecos = TABELA_PADRAO,
): ItemDaFatura[] {
  if (valorFechado && valorFechado > 0) {
    return [{ descricao: "Mensalidade (valor fechado na assinatura)", valorCentavos: valorFechado }];
  }
  return mensalidadeDaConta(faixa, modulos, tabela);
}

/** Doze mensalidades, com o desconto do anual em linha propria. */
export function anuidade(
  faixa: Faixa,
  modulos: Modulo[],
  valorFechado?: number | null,
  tabela: TabelaDePrecos = TABELA_PADRAO,
): ItemDaFatura[] {
  const mensal = somar(mensalidadeDoEscritorio(faixa, modulos, valorFechado, tabela));
  const bruto = mensal * 12;
  const desconto = tabela.descontoAnual;
  return [
    { descricao: `Assinatura anual: 12 x ${(mensal / 100).toFixed(2).replace(".", ",")}`, valorCentavos: bruto },
    { descricao: `Desconto do plano anual (${percentualEmTexto(desconto)})`, valorCentavos: -Math.round(bruto * desconto) },
  ];
}

/**
 * A assinatura esta em cortesia (isencao) nesta data? Cortesia sem prazo vale
 * sempre; com prazo (cortesiaAte), so ate o dia marcado, e depois a regua
 * volta a cobrar sozinha.
 */
export function emCortesia(
  a: { cortesiaDesde?: Date | null; cortesiaAte?: Date | null } | null | undefined,
  agora = new Date(),
): boolean {
  return Boolean(a?.cortesiaDesde && (!a.cortesiaAte || a.cortesiaAte > agora));
}

/** Quantos meses cada ciclo cobre numa fatura. */
export const MESES_DO_CICLO = { MENSAL: 1, TRIMESTRAL: 3, ANUAL: 12 } as const;
export type Ciclo = keyof typeof MESES_DO_CICLO;
export const CICLOS = Object.keys(MESES_DO_CICLO) as Ciclo[];

export function ehCiclo(valor: unknown): valor is Ciclo {
  return typeof valor === "string" && valor in MESES_DO_CICLO;
}

/** Tres mensalidades, com o desconto do trimestral em linha propria. */
export function trimestralidade(
  faixa: Faixa,
  modulos: Modulo[],
  valorFechado?: number | null,
  tabela: TabelaDePrecos = TABELA_PADRAO,
): ItemDaFatura[] {
  const mensal = somar(mensalidadeDoEscritorio(faixa, modulos, valorFechado, tabela));
  const bruto = mensal * 3;
  const desconto = tabela.descontoTrimestral;
  return [
    { descricao: `Assinatura trimestral: 3 x ${(mensal / 100).toFixed(2).replace(".", ",")}`, valorCentavos: bruto },
    ...(desconto > 0
      ? [{ descricao: `Desconto do plano trimestral (${percentualEmTexto(desconto)})`, valorCentavos: -Math.round(bruto * desconto) }]
      : []),
  ];
}

export { percentualEmTexto };

function somarMeses(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + n);
  return r;
}

const DIA = 24 * 60 * 60 * 1000;

/**
 * O dia (no horario de Brasilia) ao meio-dia UTC — o mesmo dia de calendario
 * aqui e no UTC. Sem isto, fatura emitida depois das 21h levava a hora junto
 * e o Asaas recebia o vencimento um dia depois do que a tela e o e-mail
 * mostravam.
 */
export function meioDiaDoDia(d: Date): Date {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  return new Date(`${dia}T12:00:00Z`);
}

/** Tolerancia para emendar o ano novo no anterior (a regua roda todo dia). */
const EMENDA_DO_ANO_EM_DIAS = 35;

export function inicioDoAno(marco: Date, agora: Date): Date {
  return agora.getTime() - marco.getTime() <= EMENDA_DO_ANO_EM_DIAS * DIA ? marco : agora;
}

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
  testeAcabou = false,
  suspensao: { manual?: boolean; adiadaAte?: Date | null; agora?: Date } = {},
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
  // Suspenso pelo operador: fica fora do ar enquanto houver atraso.
  if (suspensao.manual && maiorAtraso > 0) return "SUSPENSO";
  // Adiamento combinado: ate a data, a regua nao suspende (fica inadimplente).
  const adiada = Boolean(suspensao.adiadaAte && suspensao.adiadaAte > (suspensao.agora ?? new Date()));
  if (maiorAtraso >= REGUA.suspenso && !adiada) return "SUSPENSO";
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
  emissao: Date,
): Date {
  const doMes = vencimentoDe(competencia, dia);
  const minimo = meioDiaDoDia(new Date(emissao.getTime() + PRAZO_MINIMO_DIAS * DIA));
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
  agora = new Date(),
): Promise<ResultadoDaRegua> {
  const escritorio = await prismaPlataforma().escritorio.findUniqueOrThrow({
    where: { id: escritorioId },
    include: { assinatura: { include: { cupom: true } } },
  });

  let faturaGerada: string | null = null;
  const assinatura = escritorio.assinatura;

  // Cortesia: usa sem pagar, por tempo indeterminado. Nenhuma fatura e o
  // escritorio fica ATIVO — nem "teste" que nunca acaba, nem inadimplente.
  // Encerrado continua decisao humana.
  if (emCortesia(assinatura, agora)) {
    const statusNovo = escritorio.status === "ENCERRADO" ? "ENCERRADO" : "ATIVO";
    if (statusNovo !== escritorio.status) {
      await prismaPlataforma().escritorio.update({ where: { id: escritorioId }, data: { status: statusNovo } });
    }
    return { faturaGerada: null, statusAnterior: escritorio.status, statusNovo };
  }

  // 1. Fatura do mes — so depois do periodo de teste, e so uma por competencia.
  if (assinatura && !assinatura.canceladaEm && assinatura.fimDoTeste <= agora) {
    const competencia = competenciaDe(agora);
    const existente = await prismaPlataforma().fatura.findUnique({
      where: { escritorioId_competencia: { escritorioId, competencia } },
    });

    if (!existente) {
      // Anual e trimestral: a fatura do periodo (12 ou 3 meses) sai quando o
      // periodo pago acaba (ou na primeira vez); nos meses do meio, so o
      // excedente de consumo, se houver. O periodo ja faturado vale qualquer
      // que seja o ciclo de hoje: quem pagou o anual e voltou ao mensal nao
      // paga mensalidade ate o ano acabar. (anualAte guarda o fim do periodo
      // pago, de qualquer ciclo; o nome ficou do tempo em que so havia anual.)
      const periodoEmCurso = Boolean(assinatura.anualAte && assinatura.anualAte > agora);
      const ciclo: Ciclo = ehCiclo(assinatura.ciclo) ? assinatura.ciclo : "MENSAL";
      const renovaPeriodo = ciclo !== "MENSAL" && !periodoEmCurso;
      const modo = periodoEmCurso ? "SO_EXCEDENTE" : renovaPeriodo ? ciclo : "MENSAL";
      const itens = await itensDaFatura(
        escritorioId,
        escritorio.faixa,
        competencia,
        modo,
        assinatura.valorCentavos,
        {
          cupom:
            assinatura.cupom && cupomValeEm(assinatura.cupomAte, agora)
              ? {
                  codigo: assinatura.cupom.codigo,
                  percentual: assinatura.cupom.percentual,
                  valorCentavos: assinatura.cupom.valorCentavos,
                  cobertos: mesesCobertos(assinatura.cupomAte, agora, modo === "SO_EXCEDENTE" ? 1 : MESES_DO_CICLO[modo]),
                }
              : null,
        },
      );
      if (somar(itens) > 0) {
        const fatura = await prismaPlataforma().fatura.create({
          data: {
            escritorioId,
            competencia,
            valorCentavos: somar(itens),
            detalhe: itens,
            vencimento: vencimentoComPrazo(
              competencia,
              assinatura.diaVencimento,
              agora,
            ),
          },
        });
        faturaGerada = fatura.id;
        if (renovaPeriodo) {
          // O ano conta de onde o anterior acabou (ou do fim do teste): a
          // regua atrasar uns dias nao encurta o ano de quem pagou. Mas se
          // essa data e antiga (quem foi mensal por meses e so agora passou
          // ao anual), o ano conta de hoje — contar do fim do teste daria
          // um "ano" ja meio gasto.
          const inicio = inicioDoAno(assinatura.anualAte ?? assinatura.fimDoTeste, agora);
          await prismaPlataforma().assinatura.update({
            where: { escritorioId },
            data: { anualAte: somarMeses(inicio, MESES_DO_CICLO[ciclo]) },
          });
        }
        await cobrarEAvisar(fatura.id);
      }
    }
  }

  // 2. Status pelo atraso da fatura em aberto mais antiga.
  const maisAntiga = await prismaPlataforma().fatura.findFirst({
    where: { escritorioId, status: "ABERTA" },
    orderBy: { vencimento: "asc" },
  });
  const atraso = maisAntiga ? diasDeAtraso(maisAntiga.vencimento, agora) : null;
  const testeAcabou = Boolean(
    assinatura && !assinatura.canceladaEm && assinatura.fimDoTeste <= agora,
  );
  const emAtraso = atraso !== null && atraso > 0 ? atraso : null;
  const statusNovo = statusPelaRegua(escritorio.status, emAtraso, testeAcabou, {
    manual: escritorio.suspensaoManual,
    adiadaAte: escritorio.suspensaoAdiadaAte,
    agora,
  });

  const mudancas: Prisma.EscritorioUpdateInput = {};
  if (statusNovo !== escritorio.status) mudancas.status = statusNovo;
  if (statusNovo === "SUSPENSO" && escritorio.status !== "SUSPENSO") mudancas.suspensoEm = agora;
  if (statusNovo !== "SUSPENSO" && (escritorio.suspensoEm || escritorio.suspensaoManual)) {
    Object.assign(mudancas, { suspensoEm: null, suspensaoManual: false, suspensaoMotivo: null });
  }
  // Tudo pago: o adiamento combinado acaba junto.
  if (emAtraso === null && escritorio.suspensaoAdiadaAte) mudancas.suspensaoAdiadaAte = null;
  if (Object.keys(mudancas).length) {
    await prismaPlataforma().escritorio.update({ where: { id: escritorioId }, data: mudancas });
  }

  // Avisos ao escritorio: a mudanca de status ou a etapa da fatura em atraso.
  // Um aviso que falha nao derruba a regua.
  await avisarCobranca(escritorioId, { anterior: escritorio.status, novo: statusNovo }, agora).catch((erro) =>
    console.error(`regua: avisos do escritório ${escritorioId} falharam — ${(erro as Error).message}`),
  );

  return { faturaGerada, statusAnterior: escritorio.status, statusNovo };
}

/** Faixa + modulos contratados + excedentes do mes. */
export async function itensDaFatura(
  escritorioId: string,
  faixaBruta: string,
  competencia: string,
  modo: "MENSAL" | "TRIMESTRAL" | "ANUAL" | "SO_EXCEDENTE" = "MENSAL",
  valorFechado: number | null = null,
  opcoes: { cupom?: CupomNaConta | null } = {},
): Promise<ItemDaFatura[]> {
  const faixa = ehFaixa(faixaBruta) ? faixaBruta : "ATE_3";

  const modulos = await comEscritorio(escritorioId, (db) =>
    db.moduloContratado.findMany({ where: { ativo: true } }),
  );
  // So o que esta no catalogo: um nome estranho na tabela (area, modulo
  // antigo) faria o pacote "nao cobrir" e a fatura cair no preco avulso.
  const contratados = modulos
    .map((m) => m.modulo)
    .filter((m): m is Modulo => (MODULOS as readonly string[]).includes(m));

  const consumo = await consumoDoMes(escritorioId, competencia);
  const doConsumo = excedentes(consumo as { metrica: Metrica; excedente: number }[]);

  if (modo === "SO_EXCEDENTE") return doConsumo;
  const tabela = await tabelaVigente();
  const base =
    modo === "ANUAL"
      ? anuidade(faixa, contratados, valorFechado, tabela)
      : modo === "TRIMESTRAL"
        ? trimestralidade(faixa, contratados, valorFechado, tabela)
        : mensalidadeDoEscritorio(faixa, contratados, valorFechado, tabela);
  // Cupom: sobre a mensalidade (ou o periodo), nunca sobre o excedente.
  const doCupom = opcoes.cupom
    ? linhaDoCupom(opcoes.cupom, base, MESES_DO_CICLO[modo], opcoes.cupom.cobertos)
    : null;
  return [...base, ...(doCupom ? [doCupom] : []), ...doConsumo];
}

/** Marca a fatura como paga e devolve o escritorio ao ar, se for o caso. */
export async function registrarPagamento(
  faturaId: string,
  idExterno: string | null = null,
  opcoes: { agora?: Date; baixa?: unknown } = {},
): Promise<{ escritorioId: string; statusNovo: string }> {
  const agora = opcoes.agora ?? new Date();
  const fatura = await prismaPlataforma().fatura.update({
    where: { id: faturaId },
    data: {
      status: "PAGA",
      pagoEm: agora,
      // Sem idExterno recebido NAO apagamos o que ja estava gravado. Antes
      // apagava: a baixa manual de uma fatura ja emitida zerava o id da
      // cobranca no provedor, e com ele o unico caminho de volta ate o
      // pagamento. Quem quer limpar o campo limpa explicitamente.
      ...(idExterno ? { idExterno } : {}),
      // Retrato de quem pagou, quanto e como. Fica na fatura porque a
      // pergunta "de quem foi este dinheiro?" chega depois do prazo dos
      // logs — do provedor e do nosso.
      ...(opcoes.baixa === undefined
        ? {}
        : { baixa: opcoes.baixa as Prisma.InputJsonValue }),
    },
  });

  const resultado = await aplicarRegua(fatura.escritorioId, agora);

  // Nota fiscal da mensalidade, emitida pela Blackbird: pela fila, para nao
  // segurar o webhook do Asaas (a Sefin pode demorar). So com o emissor
  // ligado em "automatica" — ver nota-da-plataforma.ts.
  if (fatura.valorCentavos > 0) {
    const emissor = await prismaPlataforma().fiscalDaPlataforma.findUnique({
      where: { id: "PLATAFORMA" },
      select: { automatica: true },
    });
    if (emissor?.automatica) {
      await enfileirar("EMITIR_NOTA_DA_PLATAFORMA", fatura.escritorioId, { faturaId: fatura.id }).catch((e) =>
        console.error(`regua: fatura ${fatura.id} paga, mas a nota não entrou na fila — ${(e as Error).message}`),
      );
    }
  }

  return {
    escritorioId: fatura.escritorioId,
    statusNovo: resultado.statusNovo,
  };
}

/** Cria a assinatura no cadastro, ja com o periodo de teste correndo. */
export async function criarAssinatura(
  escritorioId: string,
  valorCentavos: number,
  diasDeTeste: number,
  agora = new Date(),
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


/**
 * Emite a cobranca da fatura no provedor e manda o link ao escritorio.
 *
 * NAO DERRUBA A REGUA. Se o Asaas estiver fora, ou a conta nao estiver
 * configurada, a fatura continua existindo e o status continua sendo
 * ajustado — a cobranca e tentada de novo na proxima passada, porque
 * `emitirCobrancaDaFatura` e idempotente e so emite para fatura ABERTA sem
 * idExterno.
 *
 * A alternativa seria deixar a excecao subir, e ai uma indisponibilidade do
 * meio de pagamento pararia a regua de TODOS os escritorios — inclusive a
 * parte que nao tem nada a ver com cobranca.
 */
async function cobrarEAvisar(faturaId: string): Promise<void> {
  if (!temCobrancaDaPlataforma()) {
    console.warn(
      `regua: fatura ${faturaId} criada SEM cobrança — ASAAS_PLATAFORMA_CHAVE ausente. ` +
        "A baixa terá de ser manual.",
    );
    return;
  }

  let emitida;
  try {
    emitida = await emitirCobrancaDaFatura(faturaId);
  } catch (erro) {
    console.error(
      `regua: fatura ${faturaId} criada, mas a cobrança falhou — ${(erro as Error).message}. ` +
        "Será tentada de novo na próxima passada.",
    );
    return;
  }
  if (!emitida) return;

  const fatura = await prismaPlataforma().fatura.findUnique({
    where: { id: faturaId },
    include: { escritorio: { select: { nome: true, slug: true } } },
  });
  if (!fatura) return;

  const admin = await prismaPlataforma().usuario.findFirst({
    where: { escritorioId: fatura.escritorioId, papel: "ADMIN", ativo: true },
    select: { email: true },
    orderBy: { criadoEm: "asc" },
  });
  if (!admin?.email || !temRemetenteDaPlataforma()) return;

  const mensagem = mensagemDaFatura({
    nomeDoEscritorio: fatura.escritorio.nome,
    competencia: fatura.competencia,
    valorCentavos: fatura.valorCentavos,
    vencimento: fatura.vencimento,
    link: emitida.linkPagamento,
    meses: mesesDaFatura(fatura.detalhe),
    desconto: descontoDaFatura(fatura.detalhe),
    enderecoDoPlano: `https://${fatura.escritorio.slug}.${process.env.DOMINIO_PLATAFORMA?.trim() || "birdjud.com.br"}/plano`,
  });

  try {
    await enviarPelaPlataforma({ para: admin.email, ...mensagem });
  } catch (erro) {
    // O e-mail falhar nao desfaz a cobranca: ela existe, e o escritorio pode
    // pagar pelo link no painel. Fica registrado para nao sumir em silencio.
    console.error(
      `regua: fatura ${faturaId} cobrada, mas o aviso não saiu — ${(erro as Error).message}`,
    );
  }
}
