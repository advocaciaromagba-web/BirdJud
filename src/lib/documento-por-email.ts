// Mandar a peca pronta por e-mail.
//
// O mesmo documento que vai pelo WhatsApp (contrato, procuracao, declaracao,
// recibo) pode ir pelo e-mail do escritorio: um e-mail so, com o PDF anexo e
// um recado opcional de quem mandou.
//
// AS MESMAS TRAVAS DA PECA NO WHATSAPP, porque e documento de cliente: o
// endereco vem do CADASTRO, nunca digitado na hora; o recibo com campo em
// branco nao sai; e o envio fica registrado como aviso, para constar quando
// e para quem aquele PDF foi.
//
// Vai sempre em PDF, mesmo que a tela esteja com Word marcado: .docx no
// celular costuma nao abrir, e o cliente precisa ler, imprimir e assinar.
import { motivoDoBloqueio, podeReceber } from "./consentimento-de-envio";
import type { Prisma } from "@prisma/client";
import { comEscritorio, prismaPlataforma, semEscritorio } from "./prisma";
import { moduloAtivo } from "./modulos";
import { NOME_DA_ESPECIE, type Especie } from "./modelos";
import { gerarPeca, type DadosDaPeca } from "./modelos-do-escritorio";
import { NaoDaParaMandar } from "./documento-no-whatsapp";
import { enviarLote, SemRemetente } from "./email";

const O_QUE_FAZER: Record<Especie, string> = {
  CONTRATO: "Leia com atenção e, se estiver de acordo, assine e devolva ao escritório.",
  PROCURACAO: "Imprima, assine e devolva ao escritório.",
  DECLARACAO: "Imprima, assine e devolva ao escritório.",
  RECIBO: "Guarde este recibo.",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PecaMandadaPorEmail = {
  email: string;
  nomeDoArquivo: string;
};

export async function mandarPecaPorEmail(
  escritorioId: string,
  especie: Especie,
  dados: DadosDaPeca & { clienteId: string },
  /** Quem mandou: fica no registro do envio. */
  enviadoPorId: string | null = null,
  /** Recado de quem mandou, opcional. Vai antes do documento. */
  recado: string | null = null,
): Promise<PecaMandadaPorEmail> {
  if (!(await moduloAtivo(escritorioId, "EMAIL"))) {
    throw new NaoDaParaMandar("O módulo de e-mail não está contratado.");
  }
  if (!podeReceber(dados.cliente, "EMAIL")) {
    throw new NaoDaParaMandar(motivoDoBloqueio(dados.cliente, "EMAIL"));
  }

  const email = dados.cliente.email?.trim().toLowerCase() ?? "";
  if (!email || !EMAIL.test(email)) {
    throw new NaoDaParaMandar(
      email
        ? `O e-mail do cadastro não dá para ler como endereço: ${dados.cliente.email}.`
        : "Sem e-mail para mandar: preencha o e-mail no cadastro do cliente.",
    );
  }

  const escritorio = await prismaPlataforma().escritorio.findUniqueOrThrow({
    where: { id: escritorioId },
    select: { nome: true, telefoneAtendimento: true },
  });

  const peca = await gerarPeca(escritorioId, especie, dados, "PDF");
  if (especie === "RECIBO" && peca.semValor.some((c) => c.startsWith("recibo."))) {
    throw new NaoDaParaMandar(
      `O recibo sairia com campo em branco: ${peca.semValor.join(", ")}. Confira na tela antes de mandar.`,
    );
  }

  const oQueE = NOME_DA_ESPECIE[especie];
  const texto = [
    `Olá, ${dados.cliente.nome}.`,
    "",
    ...(recado?.trim() ? [recado.trim(), ""] : []),
    `Segue em anexo: ${oQueE.toLowerCase()}.`,
    O_QUE_FAZER[especie],
    "",
    `${escritorio.nome}${escritorio.telefoneAtendimento?.trim() ? ` — ${escritorio.telefoneAtendimento.trim()}` : ""}`,
  ].join("\n");

  let resultado: Awaited<ReturnType<typeof enviarLote>>;
  try {
    resultado = await enviarLote(escritorioId, [
      {
        para: email,
        assunto: `${oQueE} — ${escritorio.nome}`,
        texto,
        anexos: [{ nome: peca.nomeDoArquivo, conteudo: peca.arquivo, tipo: "application/pdf" }],
      },
    ]);
  } catch (erro) {
    if (erro instanceof SemRemetente) {
      throw new NaoDaParaMandar(`${erro.message} Conecte o e-mail em Integrações ou mande pelo WhatsApp.`);
    }
    throw erro;
  }
  if (resultado.enviadas === 0) {
    throw new NaoDaParaMandar(`O e-mail não saiu: ${resultado.falhas[0]?.motivo ?? "o servidor de e-mail recusou"}.`);
  }

  // Registro do envio: e o unico lugar que diz que aquele PDF foi para aquele
  // endereco naquele dia. A chave leva a hora porque mandar o contrato
  // corrigido de novo e legitimo.
  await comEscritorio(escritorioId, (db) =>
    db.aviso.create({
      data: semEscritorio({
        canal: "EMAIL",
        tipo: "DOCUMENTO",
        chave: `email:documento:${especie}:${dados.clienteId}:${Date.now()}`,
        destino: email,
        assunto: `${oQueE} enviada por e-mail`,
        corpo: `${oQueE} de ${dados.cliente.nome} enviada para ${email}.`,
        parametros: [peca.nomeDoArquivo] as unknown as Prisma.InputJsonValue,
        estado: "ENVIADO",
        enviadoEm: new Date(),
        clienteId: dados.clienteId,
        enviadoPorId,
      }),
    }),
  );

  return { email, nomeDoArquivo: peca.nomeDoArquivo };
}
