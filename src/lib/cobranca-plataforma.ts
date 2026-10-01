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
import { prismaPlataforma } from "./prisma";
import {
  FalhaNoAsaas,
  chamarAsaas,
  comoDia,
  emReaisDecimal,
} from "./cobrancas";

export class PlataformaSemCobranca extends Error {
  readonly status = 503;
  constructor() {
    super(
      "A conta de cobranca da plataforma nao esta configurada (ASAAS_PLATAFORMA_CHAVE).",
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
export function descricaoDaFatura(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `BirdJud — assinatura ${mes}/${ano}`;
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
      `O escritorio ${nome} nao tem CNPJ cadastrado. O Asaas exige CPF ou CNPJ para emitir cobranca.`,
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
      // se perder.
      externalReference: escritorioId,
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
 * `billingType: "UNDEFINED"` e o que entrega boleto, Pix E cartao na mesma
 * tela, com o pagador escolhendo. Fixar um deles obrigaria a decidir pelo
 * cliente qual lhe serve.
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
      billingType: "UNDEFINED",
      value: emReaisDecimal(fatura.valorCentavos),
      dueDate: comoDia(fatura.vencimento),
      description: descricaoDaFatura(fatura.competencia),
      // O webhook le este campo para saber qual fatura dar baixa. Sem ele, o
      // pagamento chega e ninguem sabe de quem e.
      externalReference: fatura.id,
    }),
  });

  const idExterno = typeof criada.id === "string" ? criada.id : null;
  if (!idExterno) {
    throw new FalhaNoAsaas("O Asaas criou a cobranca sem devolver id.");
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
}): { assunto: string; texto: string } {
  const valor = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(dados.valorCentavos / 100);
  const vence = dados.vencimento.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  return {
    assunto: `BirdJud — fatura de ${dados.competencia} (vence em ${vence})`,
    texto: [
      `${dados.nomeDoEscritorio},`,
      "",
      `A fatura da assinatura do BirdJud referente a ${dados.competencia} esta disponivel.`,
      "",
      `Valor: ${valor}`,
      `Vencimento: ${vence}`,
      ...(dados.link
        ? ["", `Pagar (boleto, Pix ou cartao): ${dados.link}`]
        : ["", "O link de pagamento sera enviado em seguida."]),
      "",
      "A baixa e automatica: nao e preciso mandar comprovante.",
      "",
      "BirdJud, by Blackbird",
    ].join("\n"),
  };
}
