import { NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { prismaPlataforma } from "@/lib/prisma";
import { registrarPagamento } from "@/lib/cobranca";

// Recebe evento de pagamento e nunca e estatica.
export const dynamic = "force-dynamic";

/** Eventos que significam dinheiro na conta. */
const EVENTOS_DE_BAIXA = new Set([
  "PAYMENT_RECEIVED",
  "PAYMENT_CONFIRMED",
]);

const evento = z.object({
  event: z.string(),
  payment: z
    .object({
      id: z.string().optional(),
      // Guardamos o id da nossa fatura aqui ao criar a cobranca no provedor.
      externalReference: z.string().optional(),
    })
    .optional(),
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
    return NextResponse.json({ erro: "Webhook nao configurado." }, { status: 503 });
  }

  if (!tokenConfere(req.headers.get("asaas-access-token"), esperado)) {
    return NextResponse.json({ erro: "Token invalido." }, { status: 401 });
  }

  const corpo = evento.safeParse(await req.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json({ erro: "Evento invalido." }, { status: 400 });
  }

  // Evento que nao e de baixa e reconhecido com 200: o provedor nao precisa
  // reenviar o que nao nos interessa.
  if (!EVENTOS_DE_BAIXA.has(corpo.data.event)) {
    return NextResponse.json({ ok: true, ignorado: corpo.data.event });
  }

  const faturaId = corpo.data.payment?.externalReference;
  if (!faturaId) {
    return NextResponse.json({ erro: "Evento sem referencia da fatura." }, { status: 400 });
  }

  const fatura = await prismaPlataforma().fatura.findUnique({
    where: { id: faturaId },
    select: { id: true, status: true },
  });
  if (!fatura) {
    return NextResponse.json({ erro: "Fatura nao encontrada." }, { status: 404 });
  }

  // Provedor reenvia evento quando nao recebe 200. Fatura ja paga responde ok
  // sem mexer em nada — senao um reenvio reabriria a conversa.
  if (fatura.status !== "ABERTA") {
    return NextResponse.json({ ok: true, jaProcessada: true });
  }

  const resultado = await registrarPagamento(fatura.id, corpo.data.payment?.id ?? null);
  return NextResponse.json({ ok: true, status: resultado.statusNovo });
}
