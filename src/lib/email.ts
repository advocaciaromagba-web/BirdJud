// Envio de e-mail pelo SMTP do proprio escritorio.
//
// O cliente recebe do advogado, nao da plataforma: o remetente e o dominio
// sao os que o escritorio conectou em Integracoes. Se ele nao conectou, nao
// ha envio — a plataforma nao tem remetente proprio para emprestar.
import nodemailer from "nodemailer";
import { IntegracaoAusente, obterIntegracao } from "./integracao";

export type CredencialSmtp = {
  host: string;
  porta: string;
  usuario: string;
  senha: string;
  remetente: string;
};

export type Mensagem = {
  para: string;
  assunto: string;
  texto: string;
};

export class SemRemetente extends Error {
  constructor() {
    super("O escritorio ainda nao conectou o e-mail em Integracoes.");
    this.name = "SemRemetente";
  }
}

export async function credencialDoEscritorio(
  escritorioId: string,
): Promise<CredencialSmtp> {
  try {
    return await obterIntegracao<CredencialSmtp>(escritorioId, "SMTP");
  } catch (erro) {
    if (erro instanceof IntegracaoAusente) throw new SemRemetente();
    throw erro;
  }
}

/**
 * Envia uma leva de mensagens reaproveitando a mesma conexao.
 *
 * Abrir uma conexao SMTP por mensagem e o jeito mais rapido de um provedor
 * tratar o escritorio como abuso. Aqui a conexao e aberta uma vez e as
 * mensagens saem em fila; o resultado vem por mensagem, para que a falha de
 * uma nao marque as outras como enviadas.
 */
export async function enviarLote(
  escritorioId: string,
  mensagens: Mensagem[],
): Promise<{ enviadas: number; falhas: { para: string; motivo: string }[] }> {
  if (mensagens.length === 0) return { enviadas: 0, falhas: [] };

  const credencial = await credencialDoEscritorio(escritorioId);
  const porta = Number(credencial.porta);

  const transporte = nodemailer.createTransport({
    host: credencial.host,
    port: porta,
    secure: porta === 465,
    auth: { user: credencial.usuario, pass: credencial.senha },
    pool: true,
    maxConnections: 1,
    connectionTimeout: 10_000,
  });

  const falhas: { para: string; motivo: string }[] = [];
  let enviadas = 0;

  try {
    for (const mensagem of mensagens) {
      try {
        await transporte.sendMail({
          from: credencial.remetente,
          to: mensagem.para,
          subject: mensagem.assunto,
          text: mensagem.texto,
        });
        enviadas += 1;
      } catch (erro) {
        falhas.push({ para: mensagem.para, motivo: (erro as Error).message });
      }
    }
  } finally {
    transporte.close();
  }

  return { enviadas, falhas };
}
