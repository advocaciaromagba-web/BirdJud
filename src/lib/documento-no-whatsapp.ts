// Mandar a peca pronta pelo WhatsApp.
//
// O contrato, a procuracao, a declaracao e o recibo saem em PDF e vao para o
// celular do cliente pelo numero da plataforma.
//
// TRES COISAS QUE MANDAM NO DESENHO:
//
//  1. ISTO E DOCUMENTO DE CLIENTE. Mandar a procuracao de uma pessoa para o
//     telefone de outra nao da erro nenhum e nao se desfaz. Por isso o numero
//     vem do CADASTRO do cliente, nunca digitado na hora, e o sistema recusa
//     quando nao consegue ler o numero.
//  2. Fora da janela de 24 horas a Meta so entrega MODELO APROVADO — e, para
//     levar um PDF, modelo com CABECALHO DE DOCUMENTO. Sobe-se o arquivo
//     primeiro, manda-se o id depois.
//  3. Quem pediu para parar de receber nao recebe. O pedido vale para tudo,
//     nao so para lembrete: documento e a mensagem mais invasiva que o sistema
//     manda.
import type { Prisma } from "@prisma/client";
import { comEscritorio, prismaPlataforma, semEscritorio } from "./prisma";
import { registrarConsumo } from "./consumo";
import { moduloAtivo } from "./modulos";
import { NOME_DA_ESPECIE, type Especie } from "./modelos";
import { gerarPeca, type DadosDaPeca } from "./modelos-do-escritorio";
import { limparParametro, modeloDoTipo } from "./modelos-whatsapp";
import {
  FalhaNoWhatsapp,
  enviarModeloComDocumento,
  paraE164BR,
  subirDocumento,
} from "./whatsapp";

export class NaoDaParaMandar extends Error {
  readonly status = 422;
  constructor(motivo: string) {
    super(motivo);
    this.name = "NaoDaParaMandar";
  }
}

/**
 * O que a mensagem pede que a pessoa faca com cada peca.
 *
 * Nao e enfeite: um PDF que chega sem instrucao fica no celular. E a frase
 * NAO promete nada em nome do escritorio — nao diz "assine e devolva por
 * aqui", porque este numero nao recebe.
 */
const O_QUE_FAZER: Record<Especie, string> = {
  CONTRATO: "Leia com atencao e, se estiver de acordo, assine e devolva ao escritorio",
  PROCURACAO: "Imprima, assine e devolva ao escritorio",
  DECLARACAO: "Imprima, assine e devolva ao escritorio",
  RECIBO: "Guarde este recibo",
};

export type PecaMandada = {
  telefone: string;
  idNaMeta: string;
  nomeDoArquivo: string;
};

export async function mandarPecaNoWhatsapp(
  escritorioId: string,
  especie: Especie,
  dados: DadosDaPeca & { clienteId: string },
  /** Quem mandou: recebe o alerta se o documento nao chegar. */
  enviadoPorId: string | null = null,
): Promise<PecaMandada> {
  if (!(await moduloAtivo(escritorioId, "WHATSAPP"))) {
    throw new NaoDaParaMandar("O modulo de WhatsApp nao esta contratado.");
  }

  const telefone = paraE164BR(dados.cliente.telefone);
  if (!telefone) {
    throw new NaoDaParaMandar(
      dados.cliente.telefone
        ? `O telefone do cadastro nao da para ler como celular: ${dados.cliente.telefone}.`
        : "O cliente esta sem telefone no cadastro.",
    );
  }

  const bloqueado = await comEscritorio(escritorioId, (db) =>
    db.bloqueioDeWhatsapp.findFirst({ where: { telefone }, select: { id: true } }),
  );
  if (bloqueado) {
    throw new NaoDaParaMandar(
      "Esta pessoa pediu para nao receber mais mensagens deste escritorio no WhatsApp.",
    );
  }

  const modelo = modeloDoTipo("DOCUMENTO");
  if (!modelo) throw new NaoDaParaMandar("Modelo de documento nao configurado.");

  const escritorio = await prismaPlataforma().escritorio.findUniqueOrThrow({
    where: { id: escritorioId },
    select: { nome: true, telefoneAtendimento: true },
  });

  const peca = await gerarPeca(escritorioId, especie, dados, "PDF");
  const recibo = especie === "RECIBO" && peca.semValor.some((c) => c.startsWith("recibo."));

  // Recibo com buraco no valor e quitacao de um valor que ninguem conferiu.
  // Baixar assim e ruim; MANDAR assim para o cliente e pior, porque sai da
  // mao de quem conferiria.
  if (recibo) {
    throw new NaoDaParaMandar(
      `O recibo sairia com campo em branco: ${peca.semValor.join(", ")}. Confira na tela antes de mandar.`,
    );
  }

  return mandarPdfAoCliente(
    escritorioId,
    {
      clienteId: dados.clienteId,
      nomeDoCliente: dados.cliente.nome,
      telefone,
      arquivo: peca.arquivo,
      nomeDoArquivo: peca.nomeDoArquivo,
      oQueE: NOME_DA_ESPECIE[especie],
      oQueFazer: O_QUE_FAZER[especie],
      rotulo: especie,
    },
    modelo,
    escritorio,
    enviadoPorId,
  );
}

/** O que cabe a qualquer PDF que vai ao cliente pelo WhatsApp. */
type PdfAoCliente = {
  clienteId: string;
  nomeDoCliente: string;
  /** Ja em E164, do cadastro. */
  telefone: string;
  arquivo: Buffer;
  nomeDoArquivo: string;
  oQueE: string;
  oQueFazer: string;
  /** Vai na chave do aviso: "RECIBO", "NFSE"... */
  rotulo: string;
};

/**
 * Manda um PDF pronto ao cliente (nota fiscal, por exemplo), com as mesmas
 * travas da peca: modulo, telefone do CADASTRO, pedido de parar respeitado e
 * registro do envio como aviso.
 */
export async function mandarArquivoNoWhatsapp(
  escritorioId: string,
  pdf: Omit<PdfAoCliente, "telefone"> & { telefoneDoCadastro: string | null },
  enviadoPorId: string | null = null,
): Promise<PecaMandada> {
  if (!(await moduloAtivo(escritorioId, "WHATSAPP"))) {
    throw new NaoDaParaMandar("O modulo de WhatsApp nao esta contratado.");
  }
  const telefone = paraE164BR(pdf.telefoneDoCadastro);
  if (!telefone) {
    throw new NaoDaParaMandar(
      pdf.telefoneDoCadastro
        ? `O telefone do cadastro nao da para ler como celular: ${pdf.telefoneDoCadastro}.`
        : "O cliente esta sem telefone no cadastro.",
    );
  }
  const bloqueado = await comEscritorio(escritorioId, (db) =>
    db.bloqueioDeWhatsapp.findFirst({ where: { telefone }, select: { id: true } }),
  );
  if (bloqueado) {
    throw new NaoDaParaMandar("Esta pessoa pediu para nao receber mais mensagens deste escritorio no WhatsApp.");
  }
  const modelo = modeloDoTipo("DOCUMENTO");
  if (!modelo) throw new NaoDaParaMandar("Modelo de documento nao configurado.");
  const escritorio = await prismaPlataforma().escritorio.findUniqueOrThrow({
    where: { id: escritorioId },
    select: { nome: true, telefoneAtendimento: true },
  });
  return mandarPdfAoCliente(escritorioId, { ...pdf, telefone }, modelo, escritorio, enviadoPorId);
}

async function mandarPdfAoCliente(
  escritorioId: string,
  pdf: PdfAoCliente,
  modelo: { nome: string; idioma: string },
  escritorio: { nome: string; telefoneAtendimento: string | null },
  enviadoPorId: string | null,
): Promise<PecaMandada> {
  const { telefone } = pdf;
  let idNaMeta: string;
  try {
    const midia = await subirDocumento(pdf.arquivo, pdf.nomeDoArquivo);
    const enviado = await enviarModeloComDocumento({
      para: telefone,
      modelo: modelo.nome,
      idioma: modelo.idioma,
      documento: { id: midia, nomeDoArquivo: pdf.nomeDoArquivo },
      parametros: [
        limparParametro(pdf.nomeDoCliente),
        limparParametro(escritorio.nome),
        limparParametro(pdf.oQueE.toLowerCase()),
        limparParametro(pdf.oQueFazer),
        limparParametro(escritorio.telefoneAtendimento?.trim() || "o escritorio"),
      ],
    });
    idNaMeta = enviado.idNaMeta;
  } catch (erro) {
    if (erro instanceof FalhaNoWhatsapp) throw new NaoDaParaMandar(erro.message);
    throw erro;
  }

  // Fica gravado como aviso ENVIADO: e o unico registro de que aquele PDF foi
  // para aquele numero naquele dia. A chave leva a hora porque mandar o
  // contrato corrigido de novo e legitimo — ao contrario do lembrete, que nao
  // se repete.
  const idRepetido = await prismaPlataforma().aviso.findUnique({ where: { idNaMeta }, select: { id: true } });
  await comEscritorio(escritorioId, (db) =>
    db.aviso.create({
      data: semEscritorio({
        canal: "WHATSAPP",
        tipo: "DOCUMENTO",
        chave: `zap:documento:${pdf.rotulo}:${pdf.clienteId}:${Date.now()}`,
        destino: telefone,
        assunto: `${pdf.oQueE} enviada por WhatsApp`,
        corpo: `${pdf.oQueE} de ${pdf.nomeDoCliente} enviada para ${telefone}.`,
        modelo: modelo.nome,
        parametros: [pdf.nomeDoArquivo] as unknown as Prisma.InputJsonValue,
        estado: "ENVIADO",
        enviadoEm: new Date(),
        // O retorno de entrega da Meta acha o aviso por este id. Repetido
        // (nao deveria) fica de fora: o registro do envio vale mais.
        idNaMeta: idRepetido ? null : idNaMeta,
        clienteId: pdf.clienteId,
        enviadoPorId,
      }),
    }),
  );
  await registrarConsumo(escritorioId, "WHATSAPP_MSG", 1);

  return { telefone, idNaMeta, nomeDoArquivo: pdf.nomeDoArquivo };
}
