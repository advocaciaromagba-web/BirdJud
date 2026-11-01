// Reenvio do que esta aguardando assinatura — o cliente que diz "nao achei"
// ou "achei so um" (vindo do sistema da Advocacia Roma, 01/11/2026).
//
// Tres regras:
//
// 1. Uma mensagem por pessoa, com tudo que falta ela assinar. Quem nao achou
//    dois de tres documentos nao acha melhor tres mensagens novas.
// 2. Pelo canal escolhido na hora. Reenviar por e-mail o que o cliente perdeu
//    no e-mail e repetir o caminho que ja falhou.
// 3. Confere o andamento no Autentique antes de mandar: quem ja assinou sai
//    da lista. Cobrar assinatura de quem ja assinou e o erro que mais irrita.
//
// O link de assinatura e PESSOAL: quem abre assina como aquele signatario.
// Por isso so sai por WhatsApp para o proprio cliente do documento (o
// telefone do cadastro dele); do advogado e da testemunha so ha e-mail.
import type { Prisma } from "@prisma/client";
import { comEscritorio, prismaPlataforma, semEscritorio } from "./prisma";
import { obterIntegracao } from "./integracao";
import { consultarDocumento, situacaoDoDocumento, type Signatario } from "./autentique";
import { NOME_DA_ESPECIE, type Especie } from "./modelos";
import { motivoDoBloqueio, podeReceber, type CanalDeEnvio } from "./consentimento-de-envio";
import { moduloAtivo } from "./modulos";
import { enviarLote, SemRemetente } from "./email";
import { paraE164BR, responderTexto, FalhaNoWhatsapp } from "./whatsapp";

export type ResultadoDoReenvio = {
  enviados: string[];
  falhas: string[];
  /** Documento que ficou de fora, com o motivo escrito. */
  ignorados: Array<{ documento: string; motivo: string }>;
};

type Pendencia = {
  nome: string;
  email: string;
  /** So de quem e o cliente do documento. */
  telefone: string | null;
  cliente: { nome: string; notificarWhatsapp: boolean; notificarEmail: boolean } | null;
  clienteId: string;
  documentos: Array<{ nome: string; link: string }>;
};

const SITUACAO_EXPLICADA: Record<string, string> = {
  ASSINADO: "já foi assinado por todos.",
  RECUSADO: "foi recusado: não há link válido para reenviar.",
  CANCELADO: "foi cancelado ou não existe mais no Autentique.",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Agrupa o que falta assinar por pessoa. Pura, para ter teste: recebe os
 * envios ja conferidos e devolve as pendencias e o que ficou de fora.
 */
export function agruparPendencias(
  envios: Array<{
    id: string;
    especie: string;
    situacao: string;
    signatarios: Signatario[];
    cliente: { id: string; nome: string; email: string | null; telefone: string | null; notificarWhatsapp: boolean; notificarEmail: boolean };
  }>,
  emailAlvo: string | null,
): { pendencias: Pendencia[]; ignorados: ResultadoDoReenvio["ignorados"] } {
  const porPessoa = new Map<string, Pendencia>();
  const ignorados: ResultadoDoReenvio["ignorados"] = [];

  for (const envio of envios) {
    const documento = NOME_DA_ESPECIE[envio.especie as Especie] ?? envio.especie;
    if (envio.situacao !== "ENVIADO" && envio.situacao !== "PARCIAL") {
      ignorados.push({ documento, motivo: SITUACAO_EXPLICADA[envio.situacao] ?? `está com situação "${envio.situacao}".` });
      continue;
    }
    const faltam = envio.signatarios.filter(
      (s) => !s.assinadoEm && !s.recusadoEm && (!emailAlvo || s.email.toLowerCase() === emailAlvo),
    );
    // Duas causas, duas saidas: quem ja assinou nao precisa de nada; quem
    // falta sem link e problema do lado do Autentique.
    if (faltam.length === 0) {
      ignorados.push({
        documento,
        motivo: emailAlvo ? "esta pessoa já assinou este documento." : "todos já assinaram; falta só o Autentique fechar o documento.",
      });
      continue;
    }
    const comLink = faltam.filter((s) => s.link);
    if (comLink.length === 0) {
      ignorados.push({
        documento,
        motivo: "o Autentique não devolveu link para quem falta. Reenvie pelo painel do Autentique ou gere o documento de novo.",
      });
      continue;
    }
    for (const s of comLink) {
      const chave = s.email.trim().toLowerCase();
      if (!chave) continue;
      const existente = porPessoa.get(chave);
      if (existente) {
        existente.documentos.push({ nome: documento, link: s.link! });
        continue;
      }
      const ehOCliente = (envio.cliente.email ?? "").trim().toLowerCase() === chave;
      porPessoa.set(chave, {
        nome: s.nome?.trim() || envio.cliente.nome,
        email: s.email,
        telefone: ehOCliente ? paraE164BR(envio.cliente.telefone) : null,
        cliente: ehOCliente
          ? { nome: envio.cliente.nome, notificarWhatsapp: envio.cliente.notificarWhatsapp, notificarEmail: envio.cliente.notificarEmail }
          : null,
        clienteId: envio.cliente.id,
        documentos: [{ nome: documento, link: s.link! }],
      });
    }
  }
  return { pendencias: [...porPessoa.values()], ignorados };
}

export async function reenviarParaAssinatura(
  escritorioId: string,
  pedido: { ids: string[]; canais: CanalDeEnvio[]; email?: string | null; recado?: string | null },
): Promise<ResultadoDoReenvio> {
  const ids = [...new Set(pedido.ids.filter(Boolean))];
  const canais = [...new Set(pedido.canais)];
  const emailAlvo = pedido.email?.trim().toLowerCase() || null;
  const recado = pedido.recado?.trim() || "";
  const falhas: string[] = [];
  const enviados: string[] = [];

  const envios = await comEscritorio(escritorioId, (db) =>
    db.envioParaAssinatura.findMany({ where: { id: { in: ids } } }),
  );
  if (!envios.length) return { enviados, falhas: ["Nenhum dos documentos escolhidos foi encontrado."], ignorados: [] };

  const clientes = await comEscritorio(escritorioId, (db) =>
    db.cliente.findMany({
      where: { id: { in: [...new Set(envios.map((e) => e.clienteId))] } },
      select: { id: true, nome: true, email: true, telefone: true, notificarWhatsapp: true, notificarEmail: true },
    }),
  );

  // Andamento de agora, nao o da ultima conferencia. Se o Autentique nao
  // responder, segue com o gravado: deixar o escritorio sem reenviar por
  // indisponibilidade de terceiro e pior que usar o estado de uma hora atras.
  let token: string | null = null;
  try {
    token = (await obterIntegracao<{ token: string }>(escritorioId, "AUTENTIQUE")).token;
  } catch {
    token = null;
  }
  let avisouFalhaDeConsulta = false;
  const conferidos = [];
  for (const envio of envios) {
    const guardados = (envio.signatarios ?? []) as unknown as Signatario[];
    let signatarios = guardados;
    let situacao = envio.situacao;
    if (token) {
      try {
        const atual = await consultarDocumento(token, envio.idNoProvedor);
        // So quem o escritorio pediu: signatario acrescentado direto no
        // Autentique nao recebe documento de cliente por aqui.
        const pedidos = new Set(guardados.map((g) => g.email.toLowerCase()));
        signatarios = atual.signatarios
          .filter((s) => pedidos.size === 0 || pedidos.has(s.email.toLowerCase()))
          .map((s) => ({ ...s, link: s.link ?? guardados.find((g) => g.email.toLowerCase() === s.email.toLowerCase())?.link ?? null }));
        situacao = situacaoDoDocumento(signatarios);
        await comEscritorio(escritorioId, (db) =>
          db.envioParaAssinatura.update({
            where: { id: envio.id },
            data: { signatarios: signatarios as unknown as Prisma.InputJsonValue, situacao, conferidoEm: new Date() },
          }),
        );
      } catch (erro) {
        if (/não encontrado/i.test((erro as Error).message)) {
          situacao = "CANCELADO";
        } else if (!avisouFalhaDeConsulta) {
          falhas.push("O Autentique não respondeu à conferência: o reenvio usou o último andamento gravado.");
          avisouFalhaDeConsulta = true;
        }
      }
    }
    const cliente = clientes.find((c) => c.id === envio.clienteId);
    if (cliente) conferidos.push({ id: envio.id, especie: envio.especie, situacao, signatarios, cliente });
  }

  const { pendencias, ignorados } = agruparPendencias(conferidos, emailAlvo);
  if (!pendencias.length) {
    return { enviados, falhas: [...falhas, "Nenhum dos documentos escolhidos está aguardando assinatura de alguém com link."], ignorados };
  }

  const escritorio = await prismaPlataforma().escritorio.findUniqueOrThrow({
    where: { id: escritorioId },
    select: { nome: true, telefoneAtendimento: true },
  });
  const contato = escritorio.telefoneAtendimento?.trim() ? ` Dúvidas: ${escritorio.telefoneAtendimento.trim()}.` : "";
  const [temEmail, temWhatsapp] = await Promise.all([moduloAtivo(escritorioId, "EMAIL"), moduloAtivo(escritorioId, "WHATSAPP")]);

  for (const p of pendencias) {
    const umSo = p.documentos.length === 1;
    const lista = p.documentos.map((d) => `• ${d.nome}\n${d.link}`).join("\n\n");

    if (canais.includes("EMAIL")) {
      if (!temEmail) falhas.push("E-mail: o módulo de e-mail não está contratado.");
      else if (p.cliente && !podeReceber(p.cliente, "EMAIL")) falhas.push(motivoDoBloqueio(p.cliente, "EMAIL"));
      else if (!EMAIL.test(p.email)) falhas.push(`E-mail: "${p.email}" não dá para ler como endereço.`);
      else {
        try {
          const r = await enviarLote(escritorioId, [
            {
              para: p.email,
              assunto: umSo ? `Assinatura pendente — ${p.documentos[0].nome}` : `${p.documentos.length} documentos aguardando sua assinatura`,
              texto: [
                `Olá, ${p.nome}.`,
                "",
                ...(recado ? [recado, ""] : []),
                umSo
                  ? "O documento abaixo ainda aguarda sua assinatura eletrônica. Clique no link para assinar:"
                  : "Os documentos abaixo ainda aguardam sua assinatura eletrônica. Cada um tem o próprio link, e é preciso assinar todos:",
                "",
                lista,
                "",
                `Cada link é pessoal: não repasse.${contato}`,
                escritorio.nome,
              ].join("\n"),
            },
          ]);
          if (r.enviadas) {
            enviados.push(`E-mail para ${p.email} (${p.documentos.length})`);
            await registrar(escritorioId, "EMAIL", p, p.email);
          } else falhas.push(`E-mail para ${p.email}: ${r.falhas[0]?.motivo ?? "o servidor recusou"}.`);
        } catch (erro) {
          falhas.push(erro instanceof SemRemetente ? `E-mail: ${erro.message}` : `E-mail para ${p.email}: ${(erro as Error).message}`);
        }
      }
    }

    if (canais.includes("WHATSAPP")) {
      if (!p.cliente) falhas.push(`WhatsApp: ${p.nome} não é o cliente do documento; o link pessoal dele só sai por e-mail.`);
      else if (!p.telefone) falhas.push(`WhatsApp: ${p.nome} não tem celular no cadastro.`);
      else if (!temWhatsapp) falhas.push("WhatsApp: o módulo de WhatsApp não está contratado.");
      else if (!podeReceber(p.cliente, "WHATSAPP")) falhas.push(motivoDoBloqueio(p.cliente, "WHATSAPP"));
      else if (await comEscritorio(escritorioId, (db) => db.bloqueioDeWhatsapp.findFirst({ where: { telefone: p.telefone! }, select: { id: true } })))
        falhas.push(`WhatsApp: ${p.nome} pediu para não receber mensagens por WhatsApp.`);
      else {
        const texto =
          `Olá, ${p.nome}. ` +
          (umSo
            ? "Segue de novo o documento que aguarda sua assinatura eletrônica:"
            : `Seguem de novo os ${p.documentos.length} documentos que aguardam sua assinatura eletrônica. É preciso assinar todos:`) +
          `\n\n${lista}\n\n${recado ? `${recado}\n\n` : ""}Cada link é pessoal: não repasse.${contato}\n${escritorio.nome}`;
        try {
          // Texto com link so e entregue dentro da janela de 24 h desde a
          // ultima mensagem do cliente: modelo aprovado nao leva link.
          await responderTexto(p.telefone, texto);
          enviados.push(`WhatsApp para ${p.nome} (${p.documentos.length})`);
          await registrar(escritorioId, "WHATSAPP", p, p.telefone);
        } catch (erro) {
          const motivo = erro instanceof FalhaNoWhatsapp ? erro.message : (erro as Error).message;
          falhas.push(
            `WhatsApp para ${p.nome}: ${motivo}. Mensagem com link só sai se o cliente escreveu nas últimas 24 horas: peça uma mensagem qualquer, ou use o e-mail.`,
          );
        }
      }
    }
  }

  // Uma linha por reenvio no registro do servidor: "cliquei e nao foi"
  // precisa de onde ser investigado depois que a tela recarrega.
  console.log(
    "[reenvio-assinatura]",
    `escritorio=${escritorioId}`,
    `documentos=${ids.length}`,
    `canais=${canais.join("+")}`,
    `alvo=${emailAlvo ?? "todos"}`,
    `enviados=${enviados.length}`,
    `falhas=${falhas.length}`,
    `ignorados=${ignorados.length}`,
  );
  return { enviados, falhas, ignorados };
}

/** Fica no historico do cliente: quando e por onde o link foi reenviado. */
async function registrar(escritorioId: string, canal: CanalDeEnvio, p: Pendencia, destino: string) {
  await comEscritorio(escritorioId, (db) =>
    db.aviso.create({
      data: semEscritorio({
        canal,
        tipo: "DOCUMENTO",
        chave: `reenvio-assinatura:${canal}:${p.email.toLowerCase()}:${Date.now()}`,
        destino,
        assunto: "Link de assinatura reenviado",
        corpo: `Reenviado a ${p.nome}: ${p.documentos.map((d) => d.nome).join(", ")}.`,
        parametros: p.documentos.map((d) => d.nome) as unknown as Prisma.InputJsonValue,
        estado: "ENVIADO",
        enviadoEm: new Date(),
        clienteId: p.clienteId,
      }),
    }),
  );
}
