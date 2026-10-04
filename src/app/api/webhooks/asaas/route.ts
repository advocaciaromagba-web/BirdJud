import { NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { prismaPlataforma } from "@/lib/prisma";
import { registrarPagamento } from "@/lib/cobranca";
import { SISTEMA, lerReferencia } from "@/lib/referencia-cobranca";

// Recebe evento de pagamento e nunca e estatica.
export const dynamic = "force-dynamic";

/** Eventos que significam dinheiro na conta. */
const EVENTOS_DE_BAIXA = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);

const evento = z.object({
  event: z.string(),
  payment: z
    .object({
      id: z.string().optional(),
      // Guardamos "birdjud:fatura:<id>" aqui ao criar a cobranca. A marca do
      // sistema e o que separa o nosso pagamento dos dos outros sistemas que
      // dividem esta conta Asaas: ver referencia-cobranca.ts.
      externalReference: z.string().nullish(),
      // O resto e o retrato da baixa: quem pagou, quanto, como e quando.
      // Guardamos para poder responder "de quem foi este dinheiro?" meses
      // depois, sem depender do log do provedor nem do nosso.
      customer: z.string().nullish(),
      value: z.number().nullish(),
      netValue: z.number().nullish(),
      billingType: z.string().nullish(),
      paymentDate: z.string().nullish(),
      invoiceNumber: z.string().nullish(),
    })
    .nullish(),
});

/** Comparacao em tempo constante, para o token nao vazar por cronometragem. */
function tokenConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Uma linha por chamada, sempre.
 *
 * POR QUE: este webhook libera escritorio suspenso. Ate aqui ele so falava
 * quando dava errado, e chamada que deu certo nao deixava rastro nenhum — nao
 * havia como responder "o Asaas chamou?" nem depois de um pagamento sumir.
 *
 * Nada de segredo entra aqui: nem o token, nem valor, nem dado do pagador. So
 * o que permite reconstruir o que aconteceu.
 */
function anotar(desfecho: string, detalhe: Record<string, unknown> = {}): void {
  console.log(
    `webhook asaas: ${desfecho} ${JSON.stringify(detalhe)}`.slice(0, 500),
  );
}

/**
 * Webhook do Asaas: a baixa automatica da fatura da plataforma.
 *
 * O caminho de baixa e o MESMO do painel do operador (registrarPagamento), de
 * proposito: uma unica funcao decide o que acontece com o escritorio quando a
 * fatura e paga.
 */
export async function POST(req: Request) {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!esperado) {
    console.error("ASAAS_WEBHOOK_TOKEN nao definido: webhook recusado.");
    return NextResponse.json(
      { erro: "Webhook nao configurado." },
      { status: 503 },
    );
  }

  if (!tokenConfere(req.headers.get("asaas-access-token"), esperado)) {
    // Sem o token recebido no log: quem esta tentando adivinhar nao ganha
    // confirmacao de quanto chegou perto.
    anotar("token invalido");
    return NextResponse.json({ erro: "Token invalido." }, { status: 401 });
  }

  const corpo = evento.safeParse(await req.json().catch(() => null));
  if (!corpo.success) {
    anotar("corpo invalido");
    return NextResponse.json({ erro: "Evento invalido." }, { status: 400 });
  }

  // Evento que nao e de baixa e reconhecido com 200: o provedor nao precisa
  // reenviar o que nao nos interessa.
  if (!EVENTOS_DE_BAIXA.has(corpo.data.event)) {
    anotar("evento ignorado", { evento: corpo.data.event });
    return NextResponse.json({ ok: true, ignorado: corpo.data.event });
  }

  const pagamento = corpo.data.payment ?? {};
  const leitura = lerReferencia(pagamento.externalReference);

  // Pagamento de outro sistema da mesma conta Asaas. Isto NAO e erro nosso, e
  // responder erro seria o pior caminho possivel: o Asaas reenvia o que nao
  // recebeu 200, e este webhook esta em fila (sendType SEQUENTIALLY). Um
  // pagamento alheio recusado travaria a fila e as nossas proprias baixas
  // parariam de chegar.
  if (leitura.dono === "outro") {
    anotar("pagamento de outro sistema", {
      sistema: leitura.sistema,
      evento: corpo.data.event,
    });
    return NextResponse.json({ ok: true, deOutroSistema: leitura.sistema });
  }

  // Sem marca: pode ser nossa, de antes da marca existir, ou de um sistema que
  // tambem nao marca. Quem decide e o banco, logo abaixo.
  const faturaId = leitura.dono === "nosso" ? leitura.id : leitura.bruto;
  if (!faturaId) {
    anotar("evento sem referencia", { evento: corpo.data.event });
    // Tambem 200: referencia ausente nao aparece por reenvio.
    return NextResponse.json({ ok: true, semReferencia: true });
  }
  if (leitura.dono === "nosso" && leitura.tipo !== "fatura") {
    anotar("referencia nossa que nao e de fatura", {
      tipo: leitura.tipo,
      evento: corpo.data.event,
    });
    return NextResponse.json({ ok: true, ignorado: leitura.tipo });
  }

  const fatura = await prismaPlataforma().fatura.findUnique({
    where: { id: faturaId },
    include: {
      escritorio: { select: { id: true, nome: true, slug: true, cnpj: true } },
    },
  });
  if (!fatura) {
    // Com a nossa marca e sem fatura, o problema e nosso e e grave: alguem
    // pagou uma cobranca que o nosso banco nao conhece. Sem a marca, o mais
    // provavel e que o pagamento seja de outro sistema da conta.
    anotar(
      leitura.dono === "nosso"
        ? "fatura marcada como nossa nao existe no banco"
        : "pagamento sem marca e sem fatura nossa: de outro sistema",
      { faturaId, evento: corpo.data.event },
    );
    // 200 nos dois casos. Reenviar nao faz a fatura existir, e recusar
    // travaria a fila para todos os outros eventos.
    return NextResponse.json({ ok: true, naoEnossa: true });
  }

  // Provedor reenvia evento quando nao recebe 200. Fatura ja paga responde ok
  // sem mexer em nada — senao um reenvio reabriria a conversa.
  if (fatura.status !== "ABERTA") {
    anotar("fatura ja processada", { faturaId, status: fatura.status });
    return NextResponse.json({ ok: true, jaProcessada: true });
  }

  // Quem pagou, quanto, como e quando — guardado na propria fatura. O log do
  // provedor tem prazo e o nosso tambem; a pergunta "de quem foi este
  // dinheiro?" costuma chegar depois dos dois.
  const baixa = {
    sistema: SISTEMA,
    referencia: pagamento.externalReference ?? null,
    marcada: leitura.dono === "nosso",
    evento: corpo.data.event,
    pagamentoId: pagamento.id ?? null,
    clienteNoProvedor: pagamento.customer ?? null,
    escritorio: {
      id: fatura.escritorio.id,
      nome: fatura.escritorio.nome,
      slug: fatura.escritorio.slug,
      cnpj: fatura.escritorio.cnpj,
    },
    valor: pagamento.value ?? null,
    valorLiquido: pagamento.netValue ?? null,
    forma: pagamento.billingType ?? null,
    pagoEm: pagamento.paymentDate ?? null,
    recebidoEm: new Date().toISOString(),
  };

  const resultado = await registrarPagamento(fatura.id, pagamento.id ?? null, {
    baixa,
  });
  anotar("baixa registrada", {
    faturaId,
    evento: corpo.data.event,
    sistema: SISTEMA,
    escritorioId: resultado.escritorioId,
    escritorio: fatura.escritorio.slug,
    forma: baixa.forma,
    valor: baixa.valor,
    statusNovo: resultado.statusNovo,
  });
  return NextResponse.json({ ok: true, status: resultado.statusNovo });
}
