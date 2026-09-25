// E-mail por SMTP do proprio escritorio.
//
// O escritorio usa o dominio dele: o cliente recebe do advogado, nao da
// plataforma. Testar aqui e abrir a conexao e autenticar de verdade.
import nodemailer from "nodemailer";
import { mascarar, type Conector } from "./tipos";

export const conectorEmail: Conector = {
  tipo: "SMTP",
  rotulo: "E-mail (SMTP)",
  descricao:
    "Envio de compromissos, recibos e avisos pelo dominio do escritorio.",
  modulo: "EMAIL",
  campos: [
    {
      nome: "host",
      rotulo: "Servidor",
      tipo: "text",
      obrigatorio: true,
      ajuda: "smtp.seudominio.com.br",
    },
    {
      nome: "porta",
      rotulo: "Porta",
      tipo: "text",
      obrigatorio: true,
      ajuda: "587 (TLS) ou 465 (SSL)",
    },
    { nome: "usuario", rotulo: "Usuario", tipo: "text", obrigatorio: true },
    { nome: "senha", rotulo: "Senha", tipo: "password", obrigatorio: true },
    {
      nome: "remetente",
      rotulo: "Remetente",
      tipo: "text",
      obrigatorio: true,
      ajuda: "contato@seudominio.com.br",
    },
  ],
  resumo: (dados) =>
    `${dados.remetente ?? "—"} via ${dados.host ?? "—"}:${dados.porta ?? "—"}`,

  async testar(dados) {
    const porta = Number(dados.porta);
    if (!Number.isInteger(porta) || porta <= 0 || porta > 65535) {
      return { ok: false, detalhe: "Porta invalida." };
    }

    const transporte = nodemailer.createTransport({
      host: dados.host,
      port: porta,
      // 465 e SSL direto; as demais sobem para TLS com STARTTLS.
      secure: porta === 465,
      auth: { user: dados.usuario, pass: dados.senha },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    });

    try {
      await transporte.verify();
      return {
        ok: true,
        detalhe: `Autenticado como ${mascarar(dados.usuario, 6)}.`,
      };
    } catch (erro) {
      return { ok: false, detalhe: (erro as Error).message };
    } finally {
      transporte.close();
    }
  },
};
