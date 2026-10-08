// A entrevista no banco: criar, pedir o roteiro, anotar e organizar.
//
// A regra mora em entrevista.ts, pura; os prompts em prompts-ia.ts; a chamada
// medida em ia.ts. Aqui se junta tudo e se grava.
//
// DUAS DECISOES QUE VALEM A PENA SABER:
//
// 1. A entrevista nasce SEM cliente. Quem procura o escritorio pode nao
//    contratar, e exigir cadastro antes encheria a base de gente que nunca
//    voltou. O vinculo com Cliente vem depois, se vier.
//
// 2. Falta de IA nunca deixa a tela vazia. Sem o modulo, sem chave ou com
//    recusa do classificador, o roteiro basico entra no lugar — pior que um
//    roteiro sugerido, muito melhor que nenhum.
import { Prisma } from "@prisma/client";
import { comEscritorio, semEscritorio } from "./prisma";
import { moduloAtivo } from "./modulos";
import { IARecusou, SemChaveDeIA, milTokens, pedirEstruturado } from "./ia";
import { registrarConsumo } from "./consumo";
import {
  ESQUEMA_ANALISE_ENTREVISTA,
  ESQUEMA_ROTEIRO,
  SISTEMA_ANALISE_ENTREVISTA,
  SISTEMA_ROTEIRO,
} from "./prompts-ia";
import {
  minutosDe,
  transcrever,
  type ResultadoDaTranscricao,
} from "./transcricao-audio";
import {
  MINIMO_DA_TRANSCRICAO,
  ROTEIRO_BASICO,
  TranscricaoCurta,
  arrumarRoteiro,
  urgenciaDe,
  type AnaliseDaEntrevista,
} from "./entrevista";

export class EntrevistaNaoEncontrada extends Error {
  readonly status = 404;
  constructor() {
    super("Entrevista nao encontrada.");
    this.name = "EntrevistaNaoEncontrada";
  }
}

export async function criarEntrevista(
  escritorioId: string,
  dados: {
    nome: string;
    assunto: string;
    telefone?: string | null;
    clienteId?: string | null;
    usuarioId: string;
  },
) {
  return comEscritorio(escritorioId, (db) =>
    db.entrevista.create({
      data: semEscritorio({
        nome: dados.nome.trim(),
        assunto: dados.assunto.trim(),
        telefone: dados.telefone?.trim() || null,
        clienteId: dados.clienteId ?? null,
        usuarioId: dados.usuarioId,
        situacao: "RASCUNHO",
      }),
    }),
  );
}

export async function entrevistasDoEscritorio(escritorioId: string) {
  return comEscritorio(escritorioId, (db) =>
    db.entrevista.findMany({
      where: { situacao: { not: "ARQUIVADA" } },
      orderBy: { criadaEm: "desc" },
      take: 100,
    }),
  );
}

export async function entrevistaPorId(escritorioId: string, id: string) {
  const achada = await comEscritorio(escritorioId, (db) =>
    db.entrevista.findFirst({ where: { id } }),
  );
  if (!achada) throw new EntrevistaNaoEncontrada();
  return achada;
}

/**
 * O roteiro de perguntas, a partir do assunto.
 *
 * Idempotente por escolha: pedir de novo SUBSTITUI o roteiro. O advogado que
 * clica duas vezes quer outra sugestao, nao duas listas.
 */
export async function gerarRoteiro(
  escritorioId: string,
  id: string,
  usuarioId: string,
): Promise<{ perguntas: string[]; comIA: boolean }> {
  const entrevista = await entrevistaPorId(escritorioId, id);

  let perguntas = [...ROTEIRO_BASICO];
  let comIA = false;

  if (await moduloAtivo(escritorioId, "IA")) {
    try {
      const { dados, tokensEntrada, tokensSaida } = await pedirEstruturado<{
        perguntas: unknown;
      }>(
        SISTEMA_ROTEIRO,
        `Assunto, nas palavras de quem procurou o escritorio:\n${entrevista.assunto}`,
        ESQUEMA_ROTEIRO,
        "low",
      );
      perguntas = arrumarRoteiro(dados.perguntas);
      comIA = true;
      await registrarConsumo(
        escritorioId,
        "IA_MIL_TOKENS",
        milTokens(tokensEntrada, tokensSaida),
      );
    } catch (falha) {
      // Chave ausente, recusa do classificador ou API fora: o roteiro basico
      // entra e o advogado conduz a conversa do mesmo jeito. Erro aqui nao
      // pode impedir a entrevista de acontecer.
      if (!(falha instanceof SemChaveDeIA) && !(falha instanceof IARecusou)) {
        console.error(
          `roteiro de entrevista ${id}: ${(falha as Error).message}`,
        );
      }
    }
  }

  await comEscritorio(escritorioId, (db) =>
    db.entrevista.update({
      where: { id },
      data: { roteiro: perguntas, situacao: "ROTEIRO" },
    }),
  );
  void usuarioId;
  return { perguntas, comIA };
}

/** Grava o que foi dito. Nao chama IA: anotar e organizar sao passos separados. */
export async function anotar(
  escritorioId: string,
  id: string,
  transcricao: string,
) {
  await entrevistaPorId(escritorioId, id);
  const texto = transcricao.trim();
  return comEscritorio(escritorioId, (db) =>
    db.entrevista.update({
      where: { id },
      data: {
        transcricao: texto,
        // Quem reescreve a anotacao invalida a analise anterior: ela passa a
        // descrever um texto que nao existe mais.
        //
        // DbNull, e nao null: em coluna JSON do Prisma, `null` grava o valor
        // JSON null — que e um dado — e DbNull apaga a coluna, que e o que
        // se quer aqui.
        analise: Prisma.DbNull,
        urgencia: null,
        modelo: null,
        situacao: texto ? "ANOTADA" : "ROTEIRO",
      },
    }),
  );
}

/**
 * Organiza a anotacao em topicos.
 *
 * O texto original FICA. A analise e apoio e pode estar errada; sem o que foi
 * dito, ninguem consegue conferir.
 */
export async function organizar(
  escritorioId: string,
  id: string,
): Promise<AnaliseDaEntrevista> {
  const entrevista = await entrevistaPorId(escritorioId, id);
  const texto = (entrevista.transcricao ?? "").trim();
  if (texto.length < MINIMO_DA_TRANSCRICAO) throw new TranscricaoCurta(texto.length);

  const { dados, tokensEntrada, tokensSaida, modelo } =
    await pedirEstruturado<AnaliseDaEntrevista>(
      SISTEMA_ANALISE_ENTREVISTA,
      [
        `Assunto informado: ${entrevista.assunto}`,
        "",
        "O que foi dito na entrevista:",
        texto,
      ].join("\n"),
      ESQUEMA_ANALISE_ENTREVISTA,
      "high",
    );

  const urgencia = urgenciaDe(dados.urgencia);
  const analise: AnaliseDaEntrevista = { ...dados, urgencia };

  await comEscritorio(escritorioId, (db) =>
    db.entrevista.update({
      where: { id },
      data: { analise, urgencia, modelo, situacao: "ANALISADA" },
    }),
  );

  await registrarConsumo(
    escritorioId,
    "IA_MIL_TOKENS",
    milTokens(tokensEntrada, tokensSaida),
  );

  return analise;
}

/** Liga a entrevista a um cliente ja cadastrado. */
export async function ligarAoCliente(
  escritorioId: string,
  id: string,
  clienteId: string,
) {
  await entrevistaPorId(escritorioId, id);
  // O cliente tem de ser DESTE escritorio: comEscritorio ja barra o resto,
  // mas conferir aqui faz o erro ser 404 em vez de violacao de chave.
  const cliente = await comEscritorio(escritorioId, (db) =>
    db.cliente.findFirst({ where: { id: clienteId }, select: { id: true } }),
  );
  if (!cliente) throw new EntrevistaNaoEncontrada();
  return comEscritorio(escritorioId, (db) =>
    db.entrevista.update({ where: { id }, data: { clienteId } }),
  );
}

export async function arquivar(escritorioId: string, id: string) {
  await entrevistaPorId(escritorioId, id);
  return comEscritorio(escritorioId, (db) =>
    db.entrevista.update({ where: { id }, data: { situacao: "ARQUIVADA" } }),
  );
}

/**
 * Transcreve um audio enviado e ACRESCENTA ao que ja esta anotado.
 *
 * Acrescenta, nunca substitui: quem envia o audio da segunda metade da
 * reuniao nao quer perder a primeira. Se o certo for substituir, a pessoa
 * apaga o campo antes — apagar e reversivel enquanto nao se salva; perder o
 * que ja estava escrito, nao.
 *
 * A chave e da plataforma e o custo e absorvido por ela. A medicao em
 * TRANSCRICAO_MIN existe para a plataforma saber quanto gasta, e nao gera
 * excedente para o escritorio (ver catalogo.ts).
 */
export async function transcreverAudio(
  escritorioId: string,
  id: string,
  audio: { nome: string; tipo: string; dados: Buffer },
): Promise<{ texto: string; acrescentado: string }> {
  const entrevista = await entrevistaPorId(escritorioId, id);

  // Lanca quando o audio e recusado ou a transcricao falha, e e isso que se
  // quer: nada e gravado e nada e medido se o texto nao veio.
  const resultado: ResultadoDaTranscricao = await transcrever(audio);

  const antes = (entrevista.transcricao ?? "").trimEnd();
  const juntos = antes ? `${antes}\n\n${resultado.texto}` : resultado.texto;

  await comEscritorio(escritorioId, (db) =>
    db.entrevista.update({
      where: { id },
      data: {
        transcricao: juntos,
        // A analise anterior descrevia um texto menor: vale a mesma regra de
        // anotar().
        analise: Prisma.DbNull,
        urgencia: null,
        situacao: "ANOTADA",
      },
    }),
  );

  // Sem duracao informada, estima por tamanho: um minuto de audio falado
  // costuma ficar perto de 1 MB nos formatos comprimidos. Medir aproximado e
  // melhor do que nao medir, porque e a plataforma que paga a conta.
  const minutos =
    resultado.segundos !== null
      ? minutosDe(resultado.segundos)
      : Math.max(1, Math.round(audio.dados.length / (1024 * 1024)));
  await registrarConsumo(escritorioId, "TRANSCRICAO_MIN", minutos);

  return { texto: juntos, acrescentado: resultado.texto };
}
