// A BirdJud cobrando os escritorios.
//
// NAO CONFUNDIR COM src/lib/cobrancas.ts (plural), que e o escritorio cobrando
// os clientes DELE. Sao duas contas Asaas diferentes, e misturar as duas
// cobraria a pessoa errada:
//
//   cobrancas.ts   -> chave no banco, por escritorio (Integracao ASAAS)
//   este arquivo   -> chave da PLATAFORMA, em variavel de ambiente
//
// Ate aqui a regua gerava a Fatura e parava ali. Ninguem cobrava: quem
// marcava como paga era um operador, na mao. Com um assinante isso e
// defensavel; com dez, o escritorio seria suspenso por nao pagar uma fatura
// que nunca lhe foi apresentada.
import type { Prisma } from "@prisma/client";
import { prismaPlataforma } from "./prisma";
import { DESCONTO_ANUAL, PARCELAS_DO_ANUAL, pagamentoNoCartao } from "./precos";
import { referencia } from "./referencia-cobranca";
import {
  FalhaNoAsaas,
  PedidoInvalido,
  chamarAsaas,
  comoDia,
  emReaisDecimal,
} from "./cobrancas";

export class PlataformaSemCobranca extends Error {
  readonly status = 503;
  constructor() {
    super(
      "A conta de cobrança da plataforma não está configurada (ASAAS_PLATAFORMA_CHAVE).",
    );
    this.name = "PlataformaSemCobranca";
  }
}

export function chaveDaPlataforma(): string | null {
  return process.env.ASAAS_PLATAFORMA_CHAVE?.trim() || null;
}

export function temCobrancaDaPlataforma(): boolean {
  return chaveDaPlataforma() !== null;
}

/** So digitos: e o que a API aceita em CPF/CNPJ. */
function digitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/**
 * Descricao da cobranca, que e o que o escritorio le no boleto.
 *
 * Leva a competencia porque o extrato bancario de quem paga mostra so isso —
 * "BirdJud" sozinho, doze vezes por ano, nao diz qual mes foi pago.
 */
export function descricaoDaFatura(competencia: string, anual = false): string {
  const [ano, mes] = competencia.split("-");
  return anual
    ? `BirdJud — assinatura anual (12 meses) a partir de ${mes}/${ano}`
    : `BirdJud — assinatura ${mes}/${ano}`;
}

/**
 * A fatura e a do plano anual? Le pelos itens (a linha "Assinatura anual"
 * que `anuidade` escreve), para o boleto e o e-mail nao dizerem "assinatura
 * 10/2026" sobre uma cobranca de doze meses.
 */
export function ehFaturaAnual(detalhe: unknown): boolean {
  return Array.isArray(detalhe) && detalhe.some(
    (i) => typeof i?.descricao === "string" && i.descricao.startsWith("Assinatura anual"),
  );
}

export type DadosDoAssinante = {
  nome: string;
  cnpj: string | null;
  email: string | null;
};

export class AssinanteSemDocumento extends Error {
  readonly status = 422;
  constructor(nome: string) {
    super(
      `O escritório ${nome} não tem CNPJ cadastrado. O Asaas exige CPF ou CNPJ para emitir cobrança.`,
    );
    this.name = "AssinanteSemDocumento";
  }
}

/**
 * Garante o escritorio como cliente na conta da plataforma, e devolve o id.
 *
 * Guardado em Escritorio.idNaCobrancaDaPlataforma para nao criar um cadastro
 * novo a cada mes — doze cadastros do mesmo escritorio por ano, e nenhum
 * historico que feche.
 */
export async function assinanteNoAsaas(
  escritorioId: string,
  dados: DadosDoAssinante,
): Promise<string> {
  const chave = chaveDaPlataforma();
  if (!chave) throw new PlataformaSemCobranca();

  const escritorio = await prismaPlataforma().escritorio.findUniqueOrThrow({
    where: { id: escritorioId },
    select: { idNaCobrancaDaPlataforma: true },
  });
  if (escritorio.idNaCobrancaDaPlataforma) {
    return escritorio.idNaCobrancaDaPlataforma;
  }

  const documento = dados.cnpj ? digitos(dados.cnpj) : "";
  if (documento.length !== 11 && documento.length !== 14) {
    throw new AssinanteSemDocumento(dados.nome);
  }

  const criado = await chamarAsaas(chave, "/customers", {
    method: "POST",
    body: JSON.stringify({
      name: dados.nome,
      cpfCnpj: documento,
      ...(dados.email ? { email: dados.email } : {}),
      // Ligar o cliente ao nosso id permite reencontra-lo mesmo se a coluna
      // se perder. A marca do sistema vem na frente porque esta conta Asaas
      // atende varios sistemas da Blackbird: ver referencia-cobranca.ts.
      externalReference: referencia("escritorio", escritorioId),
      notificationDisabled: false,
    }),
  });

  const id = typeof criado.id === "string" ? criado.id : null;
  if (!id) throw new FalhaNoAsaas("O Asaas criou o cliente sem devolver id.");

  await prismaPlataforma().escritorio.update({
    where: { id: escritorioId },
    data: { idNaCobrancaDaPlataforma: id },
  });
  return id;
}

export type CobrancaEmitida = {
  idExterno: string;
  linkPagamento: string | null;
};

/**
 * Emite a cobranca de uma fatura. Idempotente.
 *
 * Tres guardas, porque a regua roda pelo cron E pode ser passada a mao por um
 * operador no mesmo dia:
 *
 *   1. fatura que ja tem idExterno nao emite de novo;
 *   2. fatura que nao esta ABERTA nao emite (paga ou cancelada);
 *   3. o indice unico em idExterno e a rede embaixo das duas primeiras.
 *
 * `billingType: "BOLETO"`: boleto com o QR Code Pix na mesma tela do Asaas.
 * Ate 16/10/2026 era "UNDEFINED" (boleto, Pix E cartao pelo mesmo preco);
 * desde que a tarifa do cartao passou a ser repassada, o cartao e uma
 * cobranca a parte, escolhida na tela Plano (`pagarFaturaNoCartao`) — senao
 * o cartao sairia pelo preco do boleto e a tarifa ficaria com a BirdJud.
 */
export async function emitirCobrancaDaFatura(
  faturaId: string,
): Promise<CobrancaEmitida | null> {
  const chave = chaveDaPlataforma();
  if (!chave) throw new PlataformaSemCobranca();

  const fatura = await prismaPlataforma().fatura.findUniqueOrThrow({
    where: { id: faturaId },
    include: {
      escritorio: {
        select: { id: true, nome: true, cnpj: true, usuarios: false },
      },
    },
  });

  if (fatura.idExterno) {
    return { idExterno: fatura.idExterno, linkPagamento: fatura.linkPagamento };
  }
  if (fatura.status !== "ABERTA") return null;

  // O e-mail do administrador do escritorio, para o Asaas avisar do
  // vencimento. Sem ele a cobranca existe mas ninguem e lembrado.
  const admin = await prismaPlataforma().usuario.findFirst({
    where: { escritorioId: fatura.escritorioId, papel: "ADMIN", ativo: true },
    select: { email: true },
    orderBy: { criadoEm: "asc" },
  });

  const idDoAssinante = await assinanteNoAsaas(fatura.escritorioId, {
    nome: fatura.escritorio.nome,
    cnpj: fatura.escritorio.cnpj,
    email: admin?.email ?? null,
  });

  const criada = await chamarAsaas(chave, "/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: idDoAssinante,
      billingType: "BOLETO",
      value: emReaisDecimal(fatura.valorCentavos),
      dueDate: comoDia(fatura.vencimento),
      description: descricaoDaFatura(fatura.competencia, ehFaturaAnual(fatura.detalhe)),
      // O webhook le este campo para saber qual fatura dar baixa, e a marca
      // do sistema e o que permite separar o nosso pagamento dos outros
      // sistemas que dividem esta conta Asaas. Sem ela, o pagamento chega e
      // ninguem sabe de quem e — nem de qual sistema.
      externalReference: referencia("fatura", fatura.id),
    }),
  });

  const idExterno = typeof criada.id === "string" ? criada.id : null;
  if (!idExterno) {
    throw new FalhaNoAsaas("O Asaas criou a cobrança sem devolver id.");
  }
  const linkPagamento =
    typeof criada.invoiceUrl === "string" ? criada.invoiceUrl : null;

  await prismaPlataforma().fatura.update({
    where: { id: fatura.id },
    data: { idExterno, linkPagamento, emitidaEm: new Date() },
  });

  return { idExterno, linkPagamento };
}

/** A mensagem que vai para o escritorio com o link de pagamento. */
export function mensagemDaFatura(dados: {
  nomeDoEscritorio: string;
  competencia: string;
  valorCentavos: number;
  vencimento: Date;
  link: string | null;
  anual?: boolean;
  /** Tela Plano do escritorio, onde o anual pode ser parcelado. */
  enderecoDoPlano?: string | null;
}): { assunto: string; texto: string } {
  const valor = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(dados.valorCentavos / 100);
  const vence = dados.vencimento.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  return {
    assunto: dados.anual
      ? `BirdJud — fatura do plano anual (vence em ${vence})`
      : `BirdJud — fatura de ${dados.competencia} (vence em ${vence})`,
    texto: [
      `${dados.nomeDoEscritorio},`,
      "",
      dados.anual
        ? `A fatura do plano anual do BirdJud (12 meses a partir de ${dados.competencia}, com ${Math.round(DESCONTO_ANUAL * 100)}% de desconto) está disponível.`
        : `A fatura da assinatura do BirdJud referente a ${dados.competencia} está disponível.`,
      "",
      `Valor: ${valor}`,
      `Vencimento: ${vence}`,
      ...(dados.link
        ? ["", `Pagar (boleto ou Pix): ${dados.link}`]
        : ["", "O link de pagamento será enviado em seguida."]),
      ...(dados.enderecoDoPlano
        ? [
            "",
            dados.anual
              ? `No cartão, à vista ou em até ${PARCELAS_DO_ANUAL}x (com a tarifa do cartão), na tela Plano: ${dados.enderecoDoPlano}`
              : `No cartão (com a tarifa do cartão), na tela Plano: ${dados.enderecoDoPlano}`,
          ]
        : []),
      "",
      "A baixa é automática: não é preciso mandar comprovante.",
      "",
      "BirdJud, by Blackbird",
    ].join("\n"),
  };
}


/** Status do Asaas que querem dizer "ja pagou". */
const PAGO_NO_ASAAS = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);

export type FaturaNoCartao = {
  linkPagamento: string | null;
  parcelas: number;
  valorCentavos: number;
};

/**
 * Troca a cobranca da fatura (boleto ou Pix) por uma no cartao: a vista em
 * qualquer fatura, parcelada (2x a PARCELAS_DO_ANUAL) so na anual. A tarifa
 * do cartao — e, no parcelado, a antecipacao — e repassada (`pagamentoNoCartao`).
 * Quem pede e o administrador do escritorio, na tela Plano.
 *
 * Nunca deixa duas cobrancas vivas para a mesma fatura (o escritorio poderia
 * pagar as duas): primeiro confere que a atual nao foi paga, cancela no
 * Asaas e LIMPA o id na fatura; so depois cria a do cartao. Se o Asaas cair
 * entre uma coisa e outra, a fatura fica ABERTA sem cobranca — e a proxima
 * regua emite de novo a de boleto/Pix. Nada se perde, nada se cobra duas
 * vezes.
 *
 * Idempotente: fatura ja passada para o cartao devolve o link que ja existe.
 */
export async function pagarFaturaNoCartao(
  escritorioId: string,
  faturaId: string,
  parcelas: number,
  agora = new Date(),
): Promise<FaturaNoCartao> {
  const chave = chaveDaPlataforma();
  if (!chave) throw new PlataformaSemCobranca();

  const fatura = await prismaPlataforma().fatura.findFirst({
    where: { id: faturaId, escritorioId },
    include: { escritorio: { select: { nome: true, cnpj: true } } },
  });
  if (!fatura) throw new PedidoInvalido("Fatura não encontrada.");
  if (fatura.status !== "ABERTA") throw new PedidoInvalido("Esta fatura não está em aberto.");
  if (fatura.parcelas) {
    return { linkPagamento: fatura.linkPagamento, parcelas: fatura.parcelas, valorCentavos: fatura.valorCentavos };
  }
  const anual = ehFaturaAnual(fatura.detalhe);
  const maximo = anual ? PARCELAS_DO_ANUAL : 1;
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > maximo) {
    throw new PedidoInvalido(
      anual ? `Escolha de 1 a ${PARCELAS_DO_ANUAL} parcelas.` : "A mensalidade só vai ao cartão a vista.",
    );
  }
  const conta = pagamentoNoCartao(fatura.valorCentavos, parcelas);

  if (fatura.idExterno) {
    const atual = await chamarAsaas(chave, `/payments/${fatura.idExterno}`);
    if (typeof atual.status === "string" && PAGO_NO_ASAAS.has(atual.status)) {
      throw new PedidoInvalido("Esta fatura já foi paga. A baixa chega em instantes.");
    }
    await chamarAsaas(chave, `/payments/${fatura.idExterno}`, { method: "DELETE" });
    await prismaPlataforma().fatura.update({
      where: { id: fatura.id },
      data: { idExterno: null, linkPagamento: null },
    });
  }

  const admin = await prismaPlataforma().usuario.findFirst({
    where: { escritorioId, papel: "ADMIN", ativo: true },
    select: { email: true },
    orderBy: { criadoEm: "asc" },
  });
  const idDoAssinante = await assinanteNoAsaas(escritorioId, {
    nome: fatura.escritorio.nome,
    cnpj: fatura.escritorio.cnpj,
    email: admin?.email ?? null,
  });

  // O Asaas recusa vencimento no passado: fatura vencida vai para hoje.
  const hoje = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora)}T12:00:00Z`);
  const vencimento = fatura.vencimento > hoje ? fatura.vencimento : hoje;
  const forma = parcelas > 1 ? `em ${parcelas}x no cartao` : "no cartão a vista";
  const criada = await chamarAsaas(chave, "/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: idDoAssinante,
      billingType: "CREDIT_CARD",
      // Parcelado: installmentCount + totalValue. A vista: value. Nunca os
      // dois juntos — o Asaas recusa.
      ...(parcelas > 1
        ? { installmentCount: parcelas, totalValue: emReaisDecimal(conta.totalCentavos) }
        : { value: emReaisDecimal(conta.totalCentavos) }),
      dueDate: comoDia(vencimento),
      description: `${descricaoDaFatura(fatura.competencia, anual)}, ${forma} (com a tarifa do cartão)`,
      externalReference: referencia("fatura", fatura.id),
    }),
  });

  const idExterno = typeof criada.id === "string" ? criada.id : null;
  const parcelamentoId = typeof criada.installment === "string" ? criada.installment : null;
  if (!idExterno || (parcelas > 1 && !parcelamentoId)) {
    throw new FalhaNoAsaas("O Asaas criou a cobrança no cartão sem devolver os ids.");
  }
  const linkPagamento = typeof criada.invoiceUrl === "string" ? criada.invoiceUrl : null;

  await prismaPlataforma().fatura.update({
    where: { id: fatura.id },
    data: {
      idExterno,
      parcelamentoId,
      parcelas,
      linkPagamento,
      emitidaEm: new Date(),
      // A tarifa entra na memoria de calculo e no valor: a fatura passa a
      // dizer o que de fato foi cobrado.
      valorCentavos: conta.totalCentavos,
      detalhe: [
        ...(Array.isArray(fatura.detalhe) ? (fatura.detalhe as Prisma.InputJsonValue[]) : []),
        {
          descricao: parcelas > 1
            ? `Tarifa do cartão parcelado em ${parcelas}x e antecipação (repassadas)`
            : "Tarifa do cartão a vista (repassada)",
          valorCentavos: conta.tarifaCentavos,
        },
      ],
    },
  });
  return { linkPagamento, parcelas, valorCentavos: conta.totalCentavos };
}
