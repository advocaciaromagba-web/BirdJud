// O remetente da PLATAFORMA.
//
// E diferente de src/lib/email.ts de proposito. Aquele envia pelo SMTP que
// cada escritorio conectou, porque o cliente do escritorio tem de receber do
// advogado, nao de nos. Este aqui e para o punhado de mensagens que a
// plataforma precisa mandar por conta propria — e a primeira delas e a
// recuperacao de senha, que nao pode depender do escritorio ter configurado
// e-mail, nem sair do dominio dele.
//
// Serve tanto para SMTP de servico de envio (Resend, Brevo, SendGrid) quanto
// para uma conta comum com senha de aplicativo: o que muda sao as variaveis,
// nao o codigo.
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

type Credencial = {
  host: string;
  porta: number;
  usuario: string;
  senha: string;
  remetente: string;
  responderPara?: string;
};

/** Le a configuracao do ambiente. Sem ela, nao ha envio — e isso e dito. */
export function credencialDaPlataforma(): Credencial | null {
  const host = process.env.PLATAFORMA_SMTP_HOST;
  const usuario = process.env.PLATAFORMA_SMTP_USUARIO;
  const senha = process.env.PLATAFORMA_SMTP_SENHA;
  const remetente = process.env.PLATAFORMA_REMETENTE;
  if (!host || !usuario || !senha || !remetente) return null;

  return {
    host,
    porta: Number(process.env.PLATAFORMA_SMTP_PORTA ?? 587),
    usuario,
    senha,
    remetente,
    responderPara: process.env.PLATAFORMA_RESPONDER_PARA || undefined,
  };
}

export function temRemetenteDaPlataforma(): boolean {
  return credencialDaPlataforma() !== null;
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
  const credencial = credencialDaPlataforma();
  if (!credencial) throw new PlataformaSemRemetente();

  const transporte = nodemailer.createTransport({
    host: credencial.host,
    port: credencial.porta,
    secure: credencial.porta === 465,
    auth: { user: credencial.usuario, pass: credencial.senha },
    connectionTimeout: 10_000,
  });

  try {
    await transporte.sendMail({
      from: credencial.remetente,
      to: mensagem.para,
      subject: mensagem.assunto,
      text: mensagem.texto,
      ...(credencial.responderPara
        ? { replyTo: credencial.responderPara }
        : {}),
    });
  } finally {
    transporte.close();
  }
}
