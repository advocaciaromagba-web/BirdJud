// Rele de e-mail da plataforma, na Vercel.
//
// POR QUE ISTO EXISTE: o Railway bloqueia saida SMTP. As portas 25, 465 e 587
// esgotam o tempo em ~250 ms, sempre, e o sintoma ("connection timeout") e
// identico ao de senha errada — o que ja custou uma troca de senha e uma troca
// de porta antes do diagnostico mostrar que a porta 443 abre em 8 ms e as de
// e-mail nao abrem nunca. Nenhuma senha de aplicativo do Google resolve isso.
//
// A escolha foi manter o Gmail, e nao trocar por um servico de envio. Entao
// alguem precisa falar SMTP com o Gmail de um lugar que consiga, e esse lugar
// e aqui: a aplicacao manda um POST em HTTPS, que o Railway libera, e esta
// funcao entrega no Gmail.
//
// ISTO NAO E UM RELE ABERTO. Sem EMAIL_TOKEN nao passa nada, o remetente e
// fixado aqui pelo ambiente (quem chama nao escolhe de quem o e-mail parece
// vir), e so um destinatario por chamada.
//
// O TOKEN E OUTRO, de proposito: quem comprometer o envio de e-mail nao leva
// junto o token do DJEN, e vice-versa.
import { createHash, timingSafeEqual } from "node:crypto";
import { connect } from "node:net";
import type { IncomingMessage, ServerResponse } from "node:http";
import nodemailer from "nodemailer";

const LIMITE_DO_CORPO = 200_000;
const LIMITE_DO_ASSUNTO = 300;
const LIMITE_DO_TEXTO = 100_000;

/** Compara em tempo constante e sem vazar o tamanho do segredo. */
export function tokenConfere(recebido: string | undefined, esperado: string): boolean {
  if (!recebido) return false;
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

/**
 * Um endereco, e so um.
 *
 * Deliberadamente restritivo: quem chama e a nossa propria aplicacao, e
 * endereco esquisito aqui e sinal de que algo esta errado do outro lado, nao
 * de que precisamos aceitar mais formatos.
 */
export function enderecoValido(valor: unknown): valor is string {
  return (
    typeof valor === "string" &&
    valor.length <= 200 &&
    /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(valor)
  );
}

export type Recusa = { status: number; erro: string };
export type Mensagem = { para: string; assunto: string; texto: string };

/** Confere o pedido e devolve a mensagem que pode seguir. */
export function conferirMensagem(entrada: unknown): Mensagem | Recusa {
  if (typeof entrada !== "object" || entrada === null) {
    return { status: 400, erro: "Corpo precisa ser um objeto JSON." };
  }
  const { para, assunto, texto } = entrada as Record<string, unknown>;
  if (!enderecoValido(para)) return { status: 400, erro: "Destinatario invalido." };
  if (typeof assunto !== "string" || !assunto.trim() || assunto.length > LIMITE_DO_ASSUNTO) {
    return { status: 400, erro: "Assunto ausente ou longo demais." };
  }
  // Cabecalho nao se injeta por assunto: quebra de linha no assunto e recusa.
  if (/[\r\n]/.test(assunto)) return { status: 400, erro: "Assunto com quebra de linha." };
  if (typeof texto !== "string" || !texto.trim() || texto.length > LIMITE_DO_TEXTO) {
    return { status: 400, erro: "Texto ausente ou longo demais." };
  }
  return { para, assunto, texto };
}

function responder(resposta: ServerResponse, status: number, corpo: unknown): void {
  resposta.statusCode = status;
  resposta.setHeader("content-type", "application/json; charset=utf-8");
  resposta.setHeader("cache-control", "no-store");
  resposta.end(JSON.stringify(corpo));
}

function lerCorpo(pedido: IncomingMessage): Promise<string> {
  return new Promise((pronto, falhou) => {
    let texto = "";
    pedido.on("data", (parte: Buffer) => {
      texto += parte.toString("utf8");
      if (texto.length > LIMITE_DO_CORPO) {
        falhou(new Error("corpo longo demais"));
        pedido.destroy();
      }
    });
    pedido.on("end", () => pronto(texto));
    pedido.on("error", falhou);
  });
}

/**
 * Diagnostico: ?diagnostico=1, com token.
 *
 * Existe porque a pergunta "a Vercel alcanca o SMTP do Gmail?" precisa de
 * medida, nao de suposicao — foi supondo que se perdeu tempo no Railway. Nao
 * envia nada e nao mostra segredo: so o tempo de abertura de cada porta.
 */
async function diagnosticar(): Promise<string[]> {
  const alvos: [string, number][] = [
    ["smtp.gmail.com", 465],
    ["smtp.gmail.com", 587],
    ["smtp.gmail.com", 25],
  ];
  const linhas: string[] = [];
  for (const [maquina, porta] of alvos) {
    const comecou = Date.now();
    const r = await new Promise<string>((pronto) => {
      const t = connect({ host: maquina, port: porta, timeout: 8_000 });
      t.on("connect", () => {
        t.destroy();
        pronto("abriu");
      });
      t.on("timeout", () => {
        t.destroy();
        pronto("tempo esgotado");
      });
      t.on("error", (e: NodeJS.ErrnoException) => pronto(e.code ?? e.message));
    });
    linhas.push(`${maquina}:${porta} -> ${r} em ${Date.now() - comecou} ms`);
  }
  return linhas;
}

export default async function handler(
  pedido: IncomingMessage,
  resposta: ServerResponse,
): Promise<void> {
  const esperado = process.env.EMAIL_TOKEN;
  if (!esperado) {
    // Falha fechada: rele sem token nao vira remetente de graca para ninguem.
    return responder(resposta, 503, { erro: "Rele sem EMAIL_TOKEN configurado." });
  }

  const cabecalho = pedido.headers.authorization ?? "";
  const recebido = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : undefined;
  if (!tokenConfere(recebido, esperado)) {
    return responder(resposta, 401, { erro: "Token do rele invalido." });
  }

  const url = new URL(pedido.url ?? "/", "http://rele");
  if (url.searchParams.get("diagnostico") === "1") {
    return responder(resposta, 200, { diagnostico: await diagnosticar() });
  }

  if (pedido.method !== "POST") return responder(resposta, 405, { erro: "Use POST." });

  const usuario = process.env.GMAIL_USUARIO;
  const senha = process.env.GMAIL_SENHA;
  const remetente = process.env.GMAIL_REMETENTE ?? usuario;
  if (!usuario || !senha || !remetente) {
    return responder(resposta, 503, {
      erro: "Rele sem GMAIL_USUARIO/GMAIL_SENHA configurados.",
    });
  }

  let cru: string;
  try {
    cru = await lerCorpo(pedido);
  } catch {
    return responder(resposta, 413, { erro: "Corpo longo demais." });
  }

  let entrada: unknown;
  try {
    entrada = JSON.parse(cru);
  } catch {
    return responder(resposta, 400, { erro: "Corpo nao e JSON." });
  }

  const conferida = conferirMensagem(entrada);
  if ("erro" in conferida) {
    return responder(resposta, conferida.status, { erro: conferida.erro });
  }

  try {
    const transporte = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: usuario, pass: senha },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000,
    });
    const envio = await transporte.sendMail({
      from: remetente,
      to: conferida.para,
      subject: conferida.assunto,
      text: conferida.texto,
      ...(process.env.GMAIL_RESPONDER_PARA
        ? { replyTo: process.env.GMAIL_RESPONDER_PARA }
        : {}),
    });
    return responder(resposta, 200, { ok: true, id: envio.messageId });
  } catch (erro) {
    // O motivo volta para quem chamou porque quem chamou e a nossa aplicacao, e
    // ela registra isso no log. "Nao deu" sem motivo foi o que atrasou o
    // diagnostico do bloqueio de SMTP a primeira vez.
    const motivo = erro instanceof Error ? erro.message : "falha desconhecida";
    return responder(resposta, 502, { erro: `O Gmail recusou o envio: ${motivo}` });
  }
}
