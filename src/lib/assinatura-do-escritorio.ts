// Mandar a peca para assinatura, e saber depois em que pe ela esta.
//
// A regra de quem assina e o protocolo do provedor moram em autentique.ts,
// puros e testaveis. Aqui se junta o cliente, os advogados e o PDF, se grava o
// que saiu e se atualiza o que voltou.
import type { Prisma } from "@prisma/client";
import { comEscritorio, semEscritorio } from "./prisma";
import { obterIntegracao } from "./integracao";
import { NOME_DA_ESPECIE, type Especie } from "./modelos";
import { gerarPeca, type DadosDaPeca } from "./modelos-do-escritorio";
import {
  ASSINA_POR_PADRAO,
  AutentiqueRecusou,
  consultarDocumento,
  enviarDocumento,
  impedimentosDoEnvio,
  montarSignatarios,
  situacaoDoDocumento,
  type Signatario,
} from "./autentique";

export { AutentiqueRecusou };

export class EnvioRepetido extends Error {
  readonly status = 409;
  constructor(
    readonly envioId: string,
    readonly situacao: string,
  ) {
    super("Esta peca ja foi mandada para assinatura deste cliente.");
    this.name = "EnvioRepetido";
  }
}

export type EnvioGravado = {
  id: string;
  especie: string;
  idNoProvedor: string;
  nomeDoArquivo: string;
  situacao: string;
  signatarios: Signatario[];
  criadoEm: Date;
  conferidoEm: Date | null;
};

function comoEnvio(r: {
  id: string;
  especie: string;
  idNoProvedor: string;
  nomeDoArquivo: string;
  situacao: string;
  signatarios: unknown;
  criadoEm: Date;
  conferidoEm: Date | null;
}): EnvioGravado {
  return { ...r, signatarios: (r.signatarios ?? []) as Signatario[] };
}

export async function enviosDoCliente(
  escritorioId: string,
  clienteId: string,
): Promise<EnvioGravado[]> {
  const rs = await comEscritorio(escritorioId, (db) =>
    db.envioParaAssinatura.findMany({
      where: { clienteId },
      orderBy: { criadoEm: "desc" },
      take: 20,
    }),
  );
  return rs.map(comoEnvio);
}

/**
 * Manda a peca para assinatura.
 *
 * O PDF e gerado AQUI, no mesmo caminho do download: o que vai para assinatura
 * e exatamente o que o escritorio conferiu na tela, nao uma segunda montagem
 * que um dia divergiria.
 *
 * `mesmoAssim` existe por causa do dinheiro: cada envio e cobrado do
 * escritorio, e a peca repetida para o mesmo cliente para e pergunta. Nao e
 * proibicao — contrato corrigido se manda de novo mesmo —, e confirmacao.
 */
export async function mandarAssinar(
  escritorioId: string,
  especie: Especie,
  dados: DadosDaPeca & { clienteId: string },
  opcoes: {
    /**
     * Quem do escritorio assina, com e-mail.
     *
     * Vem separado de `dados.advogados` de proposito: aquela lista e para o
     * TEXTO da peca — nome, OAB, estado civil — e nao carrega e-mail. Juntar as
     * duas coisas poria endereco de e-mail em um tipo cuja razao de existir e
     * escrever a qualificacao.
     */
    advogados?: Array<{ nome: string; email: string | null }>;
    quemAssina?: "CLIENTE" | "ESCRITORIO" | "AMBOS";
    mensagem?: string | null;
    mesmoAssim?: boolean;
    enviadoPor?: string | null;
  } = {},
): Promise<EnvioGravado> {
  const quem = opcoes.quemAssina ?? ASSINA_POR_PADRAO[especie];

  // Em aberto, nao qualquer um: peca ja assinada ou recusada nao impede mandar
  // a versao nova, que e justamente o que se faz depois de uma recusa.
  if (!opcoes.mesmoAssim) {
    const aberto = await comEscritorio(escritorioId, (db) =>
      db.envioParaAssinatura.findFirst({
        where: {
          clienteId: dados.clienteId,
          especie,
          situacao: { in: ["ENVIADO", "PARCIAL"] },
        },
        orderBy: { criadoEm: "desc" },
      }),
    );
    if (aberto) throw new EnvioRepetido(aberto.id, aberto.situacao);
  }

  const signatarios = montarSignatarios(
    especie,
    { nome: dados.cliente.nome, email: dados.cliente.email },
    opcoes.advogados ?? [],
    quem,
  );
  const impedimentos = impedimentosDoEnvio(signatarios);
  if (impedimentos.length > 0) throw new AutentiqueRecusou(impedimentos.join(" "));

  const { token } = await obterIntegracao<{ token: string }>(escritorioId, "AUTENTIQUE");
  const peca = await gerarPeca(escritorioId, especie, dados, "PDF");

  const documento = await enviarDocumento(token, {
    nome: `${NOME_DA_ESPECIE[especie]} - ${dados.cliente.nome}`,
    nomeDoArquivo: peca.nomeDoArquivo,
    arquivo: peca.arquivo,
    signatarios,
    mensagem: opcoes.mensagem,
  });

  // O documento JA EXISTE no provedor quando se chega aqui. Se a gravacao
  // falhar, o envio nao se desfaz — por isso ela e a ultima coisa, e nao ha
  // nada depois dela que possa estourar.
  const gravado = await comEscritorio(escritorioId, (db) =>
    db.envioParaAssinatura.create({
      data: semEscritorio({
        clienteId: dados.clienteId,
        especie,
        idNoProvedor: documento.id,
        nomeDoArquivo: peca.nomeDoArquivo,
        signatarios: documento.signatarios as unknown as Prisma.InputJsonValue,
        situacao: documento.situacao,
        enviadoPor: opcoes.enviadoPor ?? null,
      }),
    }),
  );
  return comoEnvio(gravado);
}

/** Pergunta ao provedor em que pe esta, e grava a resposta. */
export async function conferirEnvio(
  escritorioId: string,
  envioId: string,
): Promise<EnvioGravado> {
  const envio = await comEscritorio(escritorioId, (db) =>
    db.envioParaAssinatura.findFirst({ where: { id: envioId } }),
  );
  if (!envio) throw new AutentiqueRecusou("Envio nao encontrado.");

  const { token } = await obterIntegracao<{ token: string }>(escritorioId, "AUTENTIQUE");
  const documento = await consultarDocumento(token, envio.idNoProvedor);

  const atualizado = await comEscritorio(escritorioId, (db) =>
    db.envioParaAssinatura.update({
      where: { id: envio.id },
      data: {
        signatarios: documento.signatarios as unknown as Prisma.InputJsonValue,
        situacao: situacaoDoDocumento(documento.signatarios),
        conferidoEm: new Date(),
      },
    }),
  );
  return comoEnvio(atualizado);
}
