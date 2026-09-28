// O remetente da PLATAFORMA.
//
// E diferente de src/lib/email.ts de proposito. Aquele envia pelo SMTP que
// cada escritorio conectou, porque o cliente do escritorio tem de receber do
// advogado, nao de nos. Este aqui e para o punhado de mensagens que a
// plataforma manda por conta propria: recuperacao de senha, convite de
// usuario e aviso do vigia.
//
// POR QUE HA DOIS TRANSPORTES
//
// O primeiro que escrevi foi SMTP, e ele nao funciona no Railway: as portas
// 25, 465 e 587 esgotam o tempo em cerca de 250 ms — bloqueio de saida do
// provedor, para conter spam. O sintoma ("connection timeout") e igual ao de
// senha errada, o que custou uma troca de senha e uma porta antes de o
// diagnostico mostrar que a porta 443 abre em 8 ms e as de e-mail nao abrem
// nunca.
//
// Por isso todo caminho preferido sai por HTTPS, que nenhum provedor bloqueia.
// Sao tres, nesta ordem:
//
//   1. RELE — POST no nosso proprio rele na Vercel, que fala SMTP com o Gmail
//      de um lugar que consegue. E o caminho escolhido aqui: mantem o Gmail e
//      nao entrega a lista de e-mails dos escritorios a mais ninguem;
//   2. HTTPS — servico de envio (Resend), para quem preferir nao manter rele;
//   3. SMTP direto — funciona em servidor proprio, e nao depende de terceiro.
//
// O rele vem primeiro porque, com ele configurado, e o que o dono do sistema
// escolheu de proposito.
import nodemailer from "nodemailer";

export type MensagemDaPlataforma = {
  para: string;
  assunto: string;
  texto: string;
};

export class PlataformaSemRemetente extends Error {
  readonly status = 503;
  constructor() {
    super(
      "A plataforma ainda nao tem remetente de e-mail configurado. Fale com o administrador do escritorio.",
    );
    this.name = "PlataformaSemRemetente";
  }
}

export class FalhaNoEnvio extends Error {
  readonly status = 502;
  constructor(motivo: string) {
    super(`O e-mail nao pode ser enviado: ${motivo}`);
    this.name = "FalhaNoEnvio";
  }
}

type PorRele = {
  tipo: "rele";
  endereco: string;
  token: string;
};
type PorHttps = {
  tipo: "https";
  chave: string;
  remetente: string;
  responderPara?: string;
};
type PorSmtp = {
  tipo: "smtp";
  host: string;
  porta: number;
  usuario: string;
  senha: string;
  remetente: string;
  responderPara?: string;
};

export type Transporte = PorRele | PorHttps | PorSmtp;

/**
 * Qual transporte usar, na ordem de preferencia.
 *
 * Rele primeiro; depois servico de envio; SMTP direto por ultimo. Os dois
 * primeiros saem por HTTPS, que e o que funciona em nuvem.
 *
 * O rele NAO exige PLATAFORMA_REMETENTE: quem fixa o remetente e o proprio
 * rele, pelo ambiente dele, justamente para que ninguem consiga escolher de
 * quem o e-mail parece vir. Por isso ele e conferido antes.
 */
export function transporteDaPlataforma(): Transporte | null {
  const endereco = process.env.EMAIL_RELE_URL?.trim();
  const tokenDoRele = process.env.EMAIL_RELE_TOKEN?.trim();
  if (endereco && tokenDoRele) {
    return { tipo: "rele", endereco: endereco.replace(/\/+$/, ""), token: tokenDoRele };
  }

  const remetente = process.env.PLATAFORMA_REMETENTE;
  if (!remetente) return null;
  const responderPara = process.env.PLATAFORMA_RESPONDER_PARA || undefined;

  const chave = process.env.RESEND_API_KEY;
  if (chave) return { tipo: "https", chave, remetente, responderPara };

  const host = process.env.PLATAFORMA_SMTP_HOST;
  const usuario = process.env.PLATAFORMA_SMTP_USUARIO;
  const senha = process.env.PLATAFORMA_SMTP_SENHA;
  if (host && usuario && senha) {
    return {
      tipo: "smtp",
      host,
      usuario,
      senha,
      porta: Number(process.env.PLATAFORMA_SMTP_PORTA ?? 587),
      remetente,
      responderPara,
    };
  }

  return null;
}

export function temRemetenteDaPlataforma(): boolean {
  return transporteDaPlataforma() !== null;
}

async function enviarPeloRele(
  transporte: PorRele,
  mensagem: MensagemDaPlataforma,
): Promise<void> {
  let resposta: Response;
  try {
    resposta = await fetch(transporte.endereco, {
      method: "POST",
      headers: {
        authorization: `Bearer ${transporte.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(mensagem),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (erro) {
    // Rele fora do ar e falha nossa, nao do Gmail. Dizer qual dos dois e a
    // diferenca entre olhar o lugar certo e procurar no lugar errado.
    throw new FalhaNoEnvio(
      `o rele de e-mail nao respondeu (${(erro as Error).message})`,
    );
  }

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    throw new FalhaNoEnvio(`o rele recusou: HTTP ${resposta.status} ${detalhe.slice(0, 300)}`);
  }
}

async function enviarPorHttps(
  transporte: PorHttps,
  mensagem: MensagemDaPlataforma,
): Promise<void> {
  const resposta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${transporte.chave}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: transporte.remetente,
      to: [mensagem.para],
      subject: mensagem.assunto,
      text: mensagem.texto,
      ...(transporte.responderPara
        ? { reply_to: transporte.responderPara }
        : {}),
    }),
  });

  if (!resposta.ok) {
    // O corpo do erro diz o que houve (dominio nao verificado, chave invalida,
    // destinatario recusado). Guardar isso e a diferenca entre corrigir em um
    // minuto e adivinhar por uma hora.
    const detalhe = await resposta.text().catch(() => "");
    throw new FalhaNoEnvio(`HTTP ${resposta.status} ${detalhe.slice(0, 300)}`);
  }
}

async function enviarPorSmtp(
  transporte: PorSmtp,
  mensagem: MensagemDaPlataforma,
): Promise<void> {
  const conexao = nodemailer.createTransport({
    host: transporte.host,
    port: transporte.porta,
    secure: transporte.porta === 465,
    auth: { user: transporte.usuario, pass: transporte.senha },
    connectionTimeout: 10_000,
  });

  try {
    await conexao.sendMail({
      from: transporte.remetente,
      to: mensagem.para,
      subject: mensagem.assunto,
      text: mensagem.texto,
      ...(transporte.responderPara
        ? { replyTo: transporte.responderPara }
        : {}),
    });
  } catch (erro) {
    const motivo = (erro as Error).message;
    throw new FalhaNoEnvio(
      /timeout|ETIMEDOUT|ECONNREFUSED/i.test(motivo)
        ? `${motivo} — em nuvem isto costuma ser bloqueio de saida SMTP do provedor, nao senha errada. Use RESEND_API_KEY.`
        : motivo,
    );
  } finally {
    conexao.close();
  }
}

/**
 * Manda uma mensagem da plataforma.
 *
 * Levanta PlataformaSemRemetente quando nao ha configuracao: melhor a tela
 * dizer que a recuperacao esta indisponivel do que fingir que o e-mail saiu e
 * deixar a pessoa esperando por um link que nunca chega.
 */
export async function enviarPelaPlataforma(
  mensagem: MensagemDaPlataforma,
): Promise<void> {
  const transporte = transporteDaPlataforma();
  if (!transporte) throw new PlataformaSemRemetente();

  if (transporte.tipo === "rele") return enviarPeloRele(transporte, mensagem);
  if (transporte.tipo === "https") return enviarPorHttps(transporte, mensagem);
  return enviarPorSmtp(transporte, mensagem);
}
