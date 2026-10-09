import { NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { assinaturaConfere } from "@/lib/whatsapp";
import { tratarMensagem } from "@/lib/entrada-whatsapp";
import { registrarStatus } from "@/lib/entrega-do-escritorio";

// Recebe mensagem e nunca e estatica.
export const dynamic = "force-dynamic";

/**
 * O que chega quando nao e texto.
 *
 * Audio, figurinha, foto, localizacao. O sistema NAO tenta adivinhar: vira uma
 * mensagem que uma pessoa precisa ler. Um audio respondendo ao lembrete de
 * audiencia e exatamente o tipo de coisa que nao pode cair no vazio.
 */
const DESCRICAO_DO_TIPO: Record<string, string> = {
  audio: "[audio]",
  image: "[imagem]",
  video: "[video]",
  document: "[documento]",
  sticker: "[figurinha]",
  location: "[localizacao]",
  contacts: "[contato]",
};

const entrada = z.object({
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              value: z.object({
                messages: z
                  .array(
                    z.object({
                      id: z.string(),
                      from: z.string(),
                      type: z.string().optional(),
                      text: z.object({ body: z.string() }).nullish(),
                      // Botao de modelo: o texto do botao e a resposta.
                      button: z.object({ text: z.string() }).nullish(),
                      interactive: z
                        .object({
                          button_reply: z.object({ title: z.string() }).nullish(),
                          list_reply: z.object({ title: z.string() }).nullish(),
                        })
                        .nullish(),
                    }),
                  )
                  .nullish(),
                // O retorno de entrega do que NOS mandamos: sent, delivered,
                // read, failed. Ver docs/ENTREGA-DE-MENSAGENS.md.
                statuses: z
                  .array(
                    z.object({
                      id: z.string(),
                      status: z.string(),
                      timestamp: z.string().nullish(),
                      errors: z
                        .array(z.object({ code: z.number().nullish(), title: z.string().nullish(), message: z.string().nullish() }))
                        .nullish(),
                    }),
                  )
                  .nullish(),
              }),
            }),
          )
          .nullish(),
      }),
    )
    .nullish(),
});

function anotar(desfecho: string, detalhe: Record<string, unknown> = {}): void {
  // Nada de segredo, e nada do texto da mensagem: o corpo e conversa de
  // cliente com advogado, e log nao e lugar disso.
  console.log(
    `webhook whatsapp: ${desfecho} ${JSON.stringify(detalhe)}`.slice(0, 500),
  );
}

function tokenConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * A verificacao da Meta: ela chama uma vez, com um desafio, ao ligar o webhook.
 *
 * Responde texto puro com o desafio — JSON aqui faz a Meta recusar o endereco,
 * e a mensagem de erro dela nao diz por que.
 */
export async function GET(req: Request) {
  const esperado = process.env.WHATSAPP_VERIFICACAO;
  if (!esperado) {
    anotar("sem WHATSAPP_VERIFICACAO");
    return new NextResponse("nao configurado", { status: 503 });
  }

  const url = new URL(req.url);
  const modo = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const desafio = url.searchParams.get("hub.challenge");

  if (modo !== "subscribe" || !tokenConfere(token, esperado) || !desafio) {
    anotar("verificacao recusada");
    return new NextResponse("recusado", { status: 403 });
  }

  anotar("verificacao aceita");
  return new NextResponse(desafio, {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

/**
 * Mensagem recebida no WhatsApp.
 *
 * SEMPRE 200, menos quando a assinatura nao confere. Erro aqui faz a Meta
 * reentregar o mesmo evento por horas, e reentregar nao conserta telefone
 * desconhecido nem token vencido do escritorio. O que deu errado fica gravado
 * na linha da resposta, nao no codigo HTTP.
 */
export async function POST(req: Request) {
  const segredo = process.env.WHATSAPP_APP_SECRET;
  if (!segredo) {
    // Sem segredo nao ha como saber se foi a Meta que chamou. Processar assim
    // deixaria qualquer um confirmar a audiencia de qualquer cliente.
    anotar("sem WHATSAPP_APP_SECRET");
    return new NextResponse("nao configurado", { status: 503 });
  }

  // O corpo CRU, byte a byte: a assinatura e sobre ele. Reserializar o JSON
  // muda espaco e ordem, e a conta nao fecha mais.
  const cru = await req.text();
  if (!assinaturaConfere(cru, req.headers.get("x-hub-signature-256"), segredo)) {
    anotar("assinatura nao confere");
    return new NextResponse("assinatura invalida", { status: 401 });
  }

  const corpo = entrada.safeParse(JSON.parse(cru || "{}"));
  if (!corpo.success) {
    anotar("corpo fora do formato");
    return NextResponse.json({ ok: true });
  }

  const mensagens = (corpo.data.entry ?? []).flatMap((e) =>
    (e.changes ?? []).flatMap((c) => c.value.messages ?? []),
  );

  for (const m of mensagens) {
    const texto =
      m.text?.body ??
      m.button?.text ??
      m.interactive?.button_reply?.title ??
      m.interactive?.list_reply?.title ??
      DESCRICAO_DO_TIPO[m.type ?? ""] ??
      "[mensagem]";
    try {
      const r = await tratarMensagem({ idNaMeta: m.id, de: m.from, texto });
      anotar(r.desfecho, { intencao: r.intencao, respondeu: r.respondeu });
    } catch (erro) {
      anotar("falhou", { motivo: erro instanceof Error ? erro.message : "erro" });
    }
  }

  const statuses = (corpo.data.entry ?? []).flatMap((e) =>
    (e.changes ?? []).flatMap((c) => c.value.statuses ?? []),
  );
  for (const st of statuses) {
    const erro = st.errors?.[0];
    try {
      const d = await registrarStatus({
        idNaMeta: st.id,
        status: st.status,
        timestamp: st.timestamp,
        codigo: erro?.code ?? null,
        titulo: erro?.message ?? erro?.title ?? null,
      });
      if (d !== "DESCONHECIDA" && d !== "SEM_MUDANCA") anotar(`entrega ${d.toLowerCase()}`, { codigo: erro?.code ?? null });
    } catch (falha) {
      anotar("entrega falhou", { motivo: falha instanceof Error ? falha.message : "erro" });
    }
  }

  return NextResponse.json({ ok: true });
}
