// Baixa manual de cobranca (parcial e retroativa) e reemissao do boleto
// (02/11/2026, vindo do sistema da Advocacia Roma).
//
// Baixa manual e para o dinheiro que nao passou pelo boleto: pago em especie
// no escritorio, transferencia direta, parte agora e parte depois. Cada
// recebimento guarda a data em que de fato aconteceu, quem registrou e uma
// observacao, e gera a propria receita no livro-caixa (com o Financeiro).
//
// Duas travas contra contar dinheiro duas vezes:
// - quitada por aqui, a cobranca do Asaas e marcada como recebida em dinheiro
//   la tambem: senao o boleto seguiria valendo e o cliente poderia pagar de
//   novo;
// - recebida em parte por aqui e paga inteira depois no boleto, a
//   sincronizacao so lanca como receita o que faltava (ver sincronizarCobrancas).
import { comEscritorio, semEscritorio } from "./prisma";
import { moduloAtivo } from "./modulos";
import { competenciaDe } from "./consumo";
import { PedidoInvalido, chamarAsaas, chaveDoEscritorio, comoDia, darBaixa, emReaisDecimal, paraCentavosDoAsaas } from "./cobrancas";

const ABERTAS = new Set(["ABERTA", "VENCIDA", "PARCIAL"]);

export const FORMAS_DE_RECEBIMENTO = ["DINHEIRO", "PIX", "TRANSFERENCIA", "CARTAO", "BOLETO", "CHEQUE", "OUTRO"] as const;
export type FormaDeRecebimento = (typeof FORMAS_DE_RECEBIMENTO)[number];
export const ROTULO_DA_FORMA: Record<FormaDeRecebimento, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  TRANSFERENCIA: "Transferência",
  CARTAO: "Cartão",
  BOLETO: "Boleto",
  CHEQUE: "Cheque",
  OUTRO: "Outro",
};

/** Soma das baixas manuais de uma cobranca. */
export async function somaDasBaixas(escritorioId: string, cobrancaId: string): Promise<number> {
  const r = await comEscritorio(escritorioId, (db) =>
    db.baixaDeCobranca.aggregate({ where: { cobrancaId }, _sum: { valorCentavos: true } }),
  );
  return r._sum.valorCentavos ?? 0;
}

export async function registrarBaixaManual(
  escritorioId: string,
  cobrancaId: string,
  pedido: {
    valorCentavos: number;
    data: Date;
    observacao?: string | null;
    forma?: FormaDeRecebimento | null;
    /** Quem recebeu o dinheiro. Nao e quem lancou: nunca se presume. */
    recebidoPor?: string | null;
  },
  quemRegistrou: string,
): Promise<{ baixa: { id: string }; quitou: boolean; avisoDoAsaas: string | null }> {
  const cobranca = await comEscritorio(escritorioId, (db) => db.cobranca.findFirst({ where: { id: cobrancaId } }));
  if (!cobranca) throw new PedidoInvalido("Cobrança não encontrada.");
  if (!ABERTAS.has(cobranca.status)) throw new PedidoInvalido("Só cobrança em aberto, vencida ou paga em parte recebe baixa.");
  if (pedido.valorCentavos <= 0) throw new PedidoInvalido("O valor precisa ser maior que zero.");
  const amanha = new Date(Date.now() + 86_400_000);
  if (pedido.data > amanha) throw new PedidoInvalido("A data do pagamento não pode estar no futuro.");

  const jaRecebido = await somaDasBaixas(escritorioId, cobrancaId);
  const falta = cobranca.valorCentavos - jaRecebido;
  if (pedido.valorCentavos > falta) {
    throw new PedidoInvalido(`Falta receber ${(falta / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}: a baixa não pode passar disso.`);
  }
  const quita = pedido.valorCentavos === falta;

  // Parcela de contrato ja prevista no financeiro tem a propria linha de
  // receita; dividida em pedacos, a previsao ficaria pela metade. Inteira.
  if (!quita && cobranca.contratoId) {
    throw new PedidoInvalido("Parcela de contrato de honorários: dê baixa do valor inteiro.");
  }

  // Receita no livro-caixa. A baixa que quita sem parcial antes vai pelo
  // caminho de sempre (darBaixa), que sabe da parcela de contrato prevista.
  let lancamentoId: string | null = null;
  if (quita && jaRecebido === 0) {
    lancamentoId = await darBaixa(escritorioId, cobranca, pedido.valorCentavos, pedido.data);
  } else if (await moduloAtivo(escritorioId, "FINANCEIRO")) {
    const l = await comEscritorio(escritorioId, (db) =>
      db.lancamento.create({
        data: semEscritorio({
          descricao: `Recebimento${quita ? "" : " parcial"}: ${cobranca.descricao}`,
          tipo: "RECEITA",
          categoria: "HONORARIOS",
          competencia: competenciaDe(pedido.data),
          valorCentavos: pedido.valorCentavos,
          pagoEm: pedido.data,
        }),
      }),
    );
    lancamentoId = l.id;
  }

  const baixa = await comEscritorio(escritorioId, async (db) => {
    const b = await db.baixaDeCobranca.create({
      data: semEscritorio({
        cobrancaId,
        valorCentavos: pedido.valorCentavos,
        data: pedido.data,
        observacao: pedido.observacao?.trim() || null,
        forma: pedido.forma ?? null,
        recebidoPor: pedido.recebidoPor?.trim() || null,
        registradoPor: quemRegistrou,
        lancamentoId,
      }),
    });
    await db.cobranca.update({
      where: { id: cobrancaId },
      data: quita
        ? {
            status: "PAGA",
            pagoEm: pedido.data,
            valorPagoCentavos: cobranca.valorCentavos,
            // So guarda aqui o lancamento quando ele e o unico (darBaixa).
            ...(jaRecebido === 0 && lancamentoId ? { lancamentoId } : {}),
          }
        : { status: "PARCIAL", valorPagoCentavos: jaRecebido + pedido.valorCentavos },
    });
    return b;
  });

  // Quitada por aqui, o Asaas fica sabendo e o boleto deixa de valer — senao
  // o cliente seguiria cobrado e poderia pagar de novo. Depois de gravar, de
  // proposito: falha do Asaas nao desfaz a baixa (o dinheiro entrou de
  // verdade), mas a tela avisa que o boleto ficou aberto la. Parcial nao fecha
  // nada: o boleto segue valendo pelo restante.
  let avisoDoAsaas: string | null = null;
  if (quita && cobranca.provedor === "ASAAS" && !cobranca.idNoProvedor.startsWith("pendente:")) {
    try {
      const chave = await chaveDoEscritorio(escritorioId);
      await chamarAsaas(chave, `/payments/${cobranca.idNoProvedor}/receiveInCash`, {
        method: "POST",
        body: JSON.stringify({ paymentDate: comoDia(pedido.data), value: emReaisDecimal(cobranca.valorCentavos), notifyCustomer: false }),
      });
      await comEscritorio(escritorioId, (db) => db.baixaDeCobranca.update({ where: { id: baixa.id }, data: { noProvedor: true } }));
    } catch (erro) {
      avisoDoAsaas = `A baixa foi registrada, mas o boleto ficou aberto no Asaas (${(erro as Error).message}). Cancele ou dê baixa nele pelo painel do Asaas, para o cliente não pagar de novo.`;
    }
  }
  return { baixa, quitou: quita, avisoDoAsaas };
}

/**
 * Desfazer uma baixa manual: apaga a baixa e a receita que ela gerou, e a
 * cobranca volta a ser o que era. Se a baixa tinha avisado o Asaas, o
 * recebimento em dinheiro e desfeito la tambem.
 */
export async function desfazerBaixa(escritorioId: string, cobrancaId: string, baixaId: string) {
  const baixa = await comEscritorio(escritorioId, (db) => db.baixaDeCobranca.findFirst({ where: { id: baixaId, cobrancaId } }));
  if (!baixa) throw new PedidoInvalido("Baixa não encontrada.");
  const cobranca = await comEscritorio(escritorioId, (db) => db.cobranca.findFirstOrThrow({ where: { id: cobrancaId } }));

  if (baixa.noProvedor) {
    const chave = await chaveDoEscritorio(escritorioId);
    await chamarAsaas(chave, `/payments/${cobranca.idNoProvedor}/undoReceivedInCash`, { method: "POST" });
  }

  await comEscritorio(escritorioId, async (db) => {
    await db.baixaDeCobranca.delete({ where: { id: baixa.id } });
    if (baixa.lancamentoId) {
      // Parcela de contrato prevista: a linha e a previsao, volta a ser "a receber".
      const l = await db.lancamento.findFirst({ where: { id: baixa.lancamentoId }, select: { contratoId: true } });
      if (l?.contratoId) await db.lancamento.update({ where: { id: baixa.lancamentoId }, data: { pagoEm: null } });
      else if (l) await db.lancamento.delete({ where: { id: baixa.lancamentoId } });
    }
    const restante = await db.baixaDeCobranca.aggregate({ where: { cobrancaId }, _sum: { valorCentavos: true } });
    const soma = restante._sum.valorCentavos ?? 0;
    const vencida = cobranca.vencimento < new Date();
    await db.cobranca.update({
      where: { id: cobrancaId },
      data: {
        status: soma > 0 ? "PARCIAL" : vencida ? "VENCIDA" : "ABERTA",
        valorPagoCentavos: soma > 0 ? soma : null,
        pagoEm: null,
        ...(cobranca.lancamentoId === baixa.lancamentoId ? { lancamentoId: null } : {}),
      },
    });
  });
}

/**
 * Reemite o boleto com vencimento novo (e, se quiser, valor novo). O cliente
 * NAO e avisado pelo sistema: o link e a linha digitavel aparecem na tela
 * para o escritorio repassar como quiser.
 */
export async function reemitirBoleto(
  escritorioId: string,
  cobrancaId: string,
  pedido: { vencimento: Date; valorCentavos?: number | null },
): Promise<{ linkPagamento: string | null; linkBoleto: string | null; linhaDigitavel: string | null }> {
  const cobranca = await comEscritorio(escritorioId, (db) => db.cobranca.findFirst({ where: { id: cobrancaId } }));
  if (!cobranca) throw new PedidoInvalido("Cobrança não encontrada.");
  if (cobranca.provedor !== "ASAAS") throw new PedidoInvalido("Reemissão de boleto só para cobrança do Asaas.");
  if (cobranca.status !== "ABERTA" && cobranca.status !== "VENCIDA") {
    throw new PedidoInvalido("Só cobrança em aberto ou vencida pode ser reemitida.");
  }
  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0);
  if (pedido.vencimento < hoje) throw new PedidoInvalido("O novo vencimento não pode estar no passado.");
  if (pedido.valorCentavos != null && pedido.valorCentavos < 500) throw new PedidoInvalido("O valor mínimo do Asaas é R$ 5,00.");

  const chave = await chaveDoEscritorio(escritorioId);
  const novo = await chamarAsaas(chave, `/payments/${cobranca.idNoProvedor}`, {
    method: "PUT",
    body: JSON.stringify({
      dueDate: comoDia(pedido.vencimento),
      ...(pedido.valorCentavos != null ? { value: emReaisDecimal(pedido.valorCentavos) } : {}),
    }),
  });
  let linhaDigitavel: string | null = null;
  try {
    const campo = await chamarAsaas(chave, `/payments/${cobranca.idNoProvedor}/identificationField`);
    linhaDigitavel = typeof campo.identificationField === "string" ? campo.identificationField : null;
  } catch {
    linhaDigitavel = null; // Pix ou cartao: nao ha linha digitavel.
  }
  const linkPagamento = typeof novo.invoiceUrl === "string" ? novo.invoiceUrl : cobranca.linkPagamento;
  const linkBoleto = typeof novo.bankSlipUrl === "string" ? novo.bankSlipUrl : cobranca.linkBoleto;
  await comEscritorio(escritorioId, (db) =>
    db.cobranca.update({
      where: { id: cobrancaId },
      data: {
        vencimento: pedido.vencimento,
        status: "ABERTA",
        linkPagamento,
        linkBoleto,
        ...(pedido.valorCentavos != null ? { valorCentavos: paraCentavosDoAsaas(novo.value) ?? pedido.valorCentavos } : {}),
        sincronizadoEm: new Date(),
      },
    }),
  );
  return { linkPagamento, linkBoleto, linhaDigitavel };
}
