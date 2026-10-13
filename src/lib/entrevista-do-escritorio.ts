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
import { IARecusou, SemChaveDeIA, milTokens, pedirEstruturado, pedirSobreDocumentos, type Anexo } from "./ia";
import { registrarConsumo } from "./consumo";
import {
  ESQUEMA_ANALISE_ENTREVISTA,
  ESQUEMA_ROTEIRO,
  SISTEMA_ANALISE_ENTREVISTA,
  SISTEMA_ROTEIRO,
  SISTEMA_ROTEIRO_COLETA,
  SISTEMA_ROTEIRO_PROCURACAO,
  SISTEMA_ROTEIRO_TESTEMUNHA,
} from "./prompts-ia";
import {
  minutosDe,
  transcrever,
  TranscricaoFalhou,
  type ResultadoDaTranscricao,
} from "./transcricao-audio";
import { montarPromptMinuta, camposFaltando, type ClienteParaMinuta } from "./minuta-prompt";
import { gerarPdfEntrevista, gerarPdfPerguntas } from "./entrevista-pdf";
import { mandarArquivoNoWhatsapp } from "./documento-no-whatsapp";
import { guardarArquivo } from "./arquivos";
import { cutucarNuvem } from "./avisar-nuvem";
import { prismaPlataforma } from "./prisma";
import {
  MINIMO_DA_TRANSCRICAO,
  ROTEIRO_BASICO,
  TranscricaoCurta,
  arrumarRoteiro,
  urgenciaDe,
  tipoDe,
  ROTULO_DO_TIPO,
  TITULO_DO_TIPO,
  type TipoDeEntrevista,
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
    tipo?: TipoDeEntrevista;
    /** Numero do processo de que a entrevista trata (com ou sem pontuacao). */
    numeroProcesso?: string | null;
  },
) {
  const processoId = await processoPeloNumero(escritorioId, dados.numeroProcesso);
  // A chave estrangeira so prova que o cliente existe, nao que e DESTE
  // escritorio: conferir dentro do escritorio antes de ligar.
  if (dados.clienteId) {
    const cliente = await comEscritorio(escritorioId, (db) =>
      db.cliente.findFirst({ where: { id: dados.clienteId! }, select: { id: true } }),
    );
    if (!cliente) throw new EntrevistaNaoEncontrada();
  }
  return comEscritorio(escritorioId, (db) =>
    db.entrevista.create({
      data: semEscritorio({
        nome: dados.nome.trim(),
        assunto: dados.assunto.trim(),
        telefone: dados.telefone?.trim() || null,
        clienteId: dados.clienteId ?? null,
        usuarioId: dados.usuarioId,
        situacao: "RASCUNHO",
        tipo: dados.tipo ?? "TRIAGEM",
        processoId,
      }),
    }),
  );
}

export class ProcessoNaoCadastrado extends Error {
  readonly status = 404;
  constructor(numero: string) {
    super(`O processo ${numero} nao esta cadastrado em Processos. Cadastre antes, ou deixe o campo vazio.`);
    this.name = "ProcessoNaoCadastrado";
  }
}

/** O processo do escritorio pelo numero. Vazio e null; numero que nao existe e erro. */
async function processoPeloNumero(escritorioId: string, numero?: string | null): Promise<string | null> {
  const digitos = (numero ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  const p = await comEscritorio(escritorioId, (db) =>
    db.processo.findFirst({ where: { numero: digitos }, select: { id: true } }),
  );
  if (!p) throw new ProcessoNaoCadastrado(numero!.trim());
  return p.id;
}

/** O que o roteiro precisa saber do processo: classe, partes e ultimo andamento. */
async function contextoDoProcesso(escritorioId: string, processoId: string | null): Promise<string | null> {
  if (!processoId) return null;
  const p = await comEscritorio(escritorioId, (db) =>
    db.processo.findFirst({
      where: { id: processoId },
      select: { numero: true, classe: true, tribunal: true, partes: true, ultimoAndamentoTipo: true, ultimoAndamentoTexto: true },
    }),
  );
  if (!p) return null;
  const partes = Array.isArray(p.partes)
    ? (p.partes as { nome?: string; polo?: string }[])
        .map((x) => `${x.nome ?? "?"}${x.polo ? ` (polo ${x.polo})` : ""}`)
        .join("; ")
    : null;
  return [
    `Processo: ${p.numero}${p.classe ? ` — ${p.classe}` : ""}${p.tribunal ? ` (${p.tribunal})` : ""}`,
    partes ? `Partes: ${partes}` : null,
    p.ultimoAndamentoTipo || p.ultimoAndamentoTexto
      ? `Ultimo andamento: ${[p.ultimoAndamentoTipo, (p.ultimoAndamentoTexto ?? "").slice(0, 600)].filter(Boolean).join(" — ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Exclui a entrevista de vez: a transcricao, as anotacoes e a organizacao.
 *
 * De vez, e nao arquivada: e conversa sigilosa, e quem pede para apagar quer
 * que ela deixe de existir. A tela pede confirmacao antes.
 */
export async function excluirEntrevista(escritorioId: string, id: string): Promise<void> {
  await entrevistaPorId(escritorioId, id);
  await comEscritorio(escritorioId, (db) => db.entrevista.delete({ where: { id } }));
}

export async function entrevistasDoEscritorio(escritorioId: string) {
  return comEscritorio(escritorioId, (db) =>
    db.entrevista.findMany({
      where: { situacao: { not: "ARQUIVADA" } },
      orderBy: { criadaEm: "desc" },
      take: 100,
      include: { processo: { select: { numero: true } } },
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
  /** Tipo de acao ("despejo por falta de pagamento"): orienta as perguntas. */
  tipoAcao?: string | null,
): Promise<{ perguntas: string[]; comIA: boolean }> {
  const entrevista = await entrevistaPorId(escritorioId, id);
  const tipo = tipoAcao?.trim() ? tipoAcao.trim().slice(0, 300) : entrevista.tipoAcao;
  const especie = tipoDe(entrevista.tipo);
  const processo = await contextoDoProcesso(escritorioId, entrevista.processoId);
  const sistema =
    especie === "TESTEMUNHA" ? SISTEMA_ROTEIRO_TESTEMUNHA : especie === "COLETA" ? SISTEMA_ROTEIRO_COLETA : SISTEMA_ROTEIRO;

  let perguntas = [...ROTEIRO_BASICO];
  let comIA = false;

  if (await moduloAtivo(escritorioId, "IA")) {
    try {
      const { dados, tokensEntrada, tokensSaida } = await pedirEstruturado<{
        perguntas: unknown;
      }>(
        sistema,
        [
          `Entrevista: ${ROTULO_DO_TIPO[especie]}`,
          tipo ? `Tipo de acao: ${tipo}` : null,
          processo,
          `Assunto, nas palavras de quem procurou o escritorio:\n${entrevista.assunto}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
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
      data: { roteiro: perguntas, situacao: "ROTEIRO", tipoAcao: tipo ?? null },
    }),
  );
  void usuarioId;
  return { perguntas, comIA };
}

export class ProcuracaoIlegivel extends Error {
  readonly status = 422;
  constructor() {
    super("Nao consegui ler a procuracao. Envie um PDF ou uma foto nitida da procuracao inteira.");
    this.name = "ProcuracaoIlegivel";
  }
}

export type RoteiroDaProcuracao = {
  perguntas: string[];
  tipoAcao: string | null;
  outorgante: string | null;
  observacao: string | null;
};

/** O JSON que a IA devolveu, mesmo com cerca de codigo ou texto em volta. */
export function lerRespostaDaProcuracao(texto: string): RoteiroDaProcuracao {
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) throw new ProcuracaoIlegivel();
  let bruto: Record<string, unknown>;
  try {
    bruto = JSON.parse(texto.slice(inicio, fim + 1));
  } catch {
    throw new ProcuracaoIlegivel();
  }
  const textoOuNulo = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null);
  // Sem perguntas aproveitaveis, vale o roteiro basico: a entrevista nunca
  // fica sem roteiro (arrumarRoteiro).
  const perguntas = arrumarRoteiro(bruto.perguntas);
  return {
    perguntas,
    tipoAcao: textoOuNulo(bruto.tipoAcao),
    outorgante: textoOuNulo(bruto.outorgante),
    observacao: textoOuNulo(bruto.observacao),
  };
}

/**
 * Le a procuracao e monta o roteiro da primeira entrevista.
 *
 * O tipo de acao sai da propria procuracao e fica gravado na entrevista;
 * pedir de novo substitui o roteiro, como em gerarRoteiro. A procuracao NAO
 * fica guardada aqui: e lida e descartada (o original mora na ficha do cliente).
 */
export async function roteiroDaProcuracao(
  escritorioId: string,
  id: string,
  procuracao: Anexo,
): Promise<RoteiroDaProcuracao> {
  const entrevista = await entrevistaPorId(escritorioId, id);
  const r = await pedirSobreDocumentos(
    SISTEMA_ROTEIRO_PROCURACAO,
    [procuracao],
    [
      `Assunto informado no atendimento: ${entrevista.assunto}`,
      "Leia a procuracao acima e responda com o JSON pedido.",
    ].join("\n"),
    "medium",
  );
  await registrarConsumo(escritorioId, "IA_MIL_TOKENS", milTokens(r.tokensEntrada, r.tokensSaida));
  const lido = lerRespostaDaProcuracao(r.texto);

  await comEscritorio(escritorioId, (db) =>
    db.entrevista.update({
      where: { id },
      data: {
        roteiro: lido.perguntas,
        situacao: entrevista.situacao === "RASCUNHO" ? "ROTEIRO" : entrevista.situacao,
        tipoAcao: lido.tipoAcao ?? entrevista.tipoAcao,
      },
    }),
  );
  return lido;
}

/** Grava o que foi dito. Nao chama IA: anotar e organizar sao passos separados. */
export async function anotar(
  escritorioId: string,
  id: string,
  transcricao: string,
  extra: { anotacoes?: string | null; origem?: string | null } = {},
) {
  const atual = await entrevistaPorId(escritorioId, id);
  const texto = transcricao.trim();
  // A origem fica a de quem gravou primeiro por voz; texto digitado sobre uma
  // transcricao por voz continua sendo "por voz, corrigida".
  const origem = extra.origem ?? atual.origemTranscricao ?? (texto ? "DIGITADA" : null);
  return comEscritorio(escritorioId, (db) =>
    db.entrevista.update({
      where: { id },
      data: {
        transcricao: texto,
        ...(extra.anotacoes !== undefined ? { anotacoes: extra.anotacoes?.trim() || null } : {}),
        origemTranscricao: origem,
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
        `Entrevista: ${ROTULO_DO_TIPO[tipoDe(entrevista.tipo)]}` +
          (tipoDe(entrevista.tipo) === "TESTEMUNHA"
            ? " — quem fala e a TESTEMUNHA, nao o cliente. Em pretensoes, ponha o que o depoimento ajuda a provar."
            : tipoDe(entrevista.tipo) === "COLETA"
              ? " — o objetivo e reunir informacoes para um documento. Em pretensoes, ponha o que o documento deve conter."
              : ""),
        `Assunto informado: ${entrevista.assunto}`,
        entrevista.tipoAcao ? `Tipo de acao: ${entrevista.tipoAcao}` : "",
        "",
        "O que foi dito na entrevista:",
        texto,
        "",
        "Anotacoes do advogado:",
        entrevista.anotacoes?.trim() || "(sem anotacoes)",
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
export type OrigemDoAudio = "AUDIO_ENVIADO" | "AUDIO_GRAVADO";

export async function transcreverAudio(
  escritorioId: string,
  id: string,
  audio: { nome: string; tipo: string; dados: Buffer },
  opcoes: {
    /**
     * Trecho de uma gravacao em andamento (o gravador manda um por minuto):
     * entra na mesma linha do anterior, e trecho em silencio nao e erro.
     */
    continua?: boolean;
    origem?: OrigemDoAudio;
  } = {},
): Promise<{ texto: string; acrescentado: string }> {
  const entrevista = await entrevistaPorId(escritorioId, id);
  const antes = (entrevista.transcricao ?? "").trimEnd();

  // Lanca quando o audio e recusado ou a transcricao falha, e e isso que se
  // quer: nada e gravado e nada e medido se o texto nao veio.
  let resultado: ResultadoDaTranscricao;
  try {
    resultado = await transcrever(audio);
  } catch (erro) {
    // Um minuto de silencio no meio da conversa (o cliente procurando um
    // documento) nao pode virar erro na tela de quem esta gravando.
    if (opcoes.continua && erro instanceof TranscricaoFalhou && erro.status === 422) {
      return { texto: antes, acrescentado: "" };
    }
    throw erro;
  }

  const juntos = antes ? `${antes}${opcoes.continua ? " " : "\n\n"}${resultado.texto}` : resultado.texto;

  await comEscritorio(escritorioId, (db) =>
    db.entrevista.update({
      where: { id },
      data: {
        transcricao: juntos,
        origemTranscricao: entrevista.origemTranscricao ?? opcoes.origem ?? "AUDIO_ENVIADO",
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

// ---------------------------------------------------------------------------
// Encerrar, PDF e texto da peticao inicial (metodo do sistema da Advocacia Roma)
// ---------------------------------------------------------------------------

export class EntrevistaIncompleta extends Error {
  readonly status = 400;
  constructor(motivo: string) {
    super(motivo);
    this.name = "EntrevistaIncompleta";
  }
}

/** A conversa acabou. Reabrir e possivel: encerrar nao apaga nada. */
export async function encerrar(escritorioId: string, id: string, aberta = false) {
  await entrevistaPorId(escritorioId, id);
  return comEscritorio(escritorioId, (db) =>
    db.entrevista.update({ where: { id }, data: { encerradaEm: aberta ? null : new Date() } }),
  );
}

/**
 * O texto para a peticao inicial: organizacao + qualificacao do cliente.
 *
 * So depois de ENCERRAR e ORGANIZAR, e com a entrevista ligada ao cliente —
 * a qualificacao vem do cadastro dele. Cadastro incompleto nao impede: sai
 * com [PREENCHER] e a lista do que falta, se a pessoa confirmar.
 */
export async function gerarMinuta(
  escritorioId: string,
  id: string,
  usuarioId: string,
  opcoes: { observacoes?: string; ignorarPendencias?: boolean } = {},
): Promise<{ prompt: string | null; faltando: string[] }> {
  const e = await entrevistaPorId(escritorioId, id);
  if (tipoDe(e.tipo) !== "TRIAGEM") {
    throw new EntrevistaIncompleta("O texto da peticao inicial e da entrevista de triagem. Desta, gere o PDF.");
  }
  if (!e.encerradaEm) throw new EntrevistaIncompleta("Encerre a entrevista antes de gerar o texto da peticao inicial.");
  if (!e.analise) throw new EntrevistaIncompleta("Organize a entrevista primeiro — o texto e montado a partir dessa organizacao.");
  if (!e.clienteId) throw new EntrevistaIncompleta("Ligue a entrevista ao cliente: a qualificacao vem do cadastro dele.");

  const [cliente, advogado, escritorio] = await Promise.all([
    comEscritorio(escritorioId, (db) => db.cliente.findFirst({ where: { id: e.clienteId! } })),
    comEscritorio(escritorioId, (db) =>
      db.usuario.findFirst({ where: { id: usuarioId }, select: { nome: true, oab: true } }),
    ),
    prismaPlataforma().escritorio.findUnique({ where: { id: escritorioId }, select: { nome: true } }),
  ]);
  if (!cliente) throw new EntrevistaIncompleta("O cliente desta entrevista nao existe mais.");

  const paraMinuta: ClienteParaMinuta = {
    nome: cliente.nome,
    documento: cliente.documento,
    rg: cliente.rg,
    nacionalidade: cliente.nacionalidade,
    estadoCivil: cliente.estadoCivil,
    profissao: cliente.profissao,
    email: cliente.email,
    telefone: cliente.telefone,
    endereco: (cliente.endereco ?? null) as ClienteParaMinuta["endereco"],
  };
  const faltando = camposFaltando(paraMinuta);
  if (faltando.length > 0 && !opcoes.ignorarPendencias) return { prompt: null, faltando };

  const prompt = montarPromptMinuta(
    paraMinuta,
    { nome: advogado?.nome ?? "", oab: advogado?.oab ?? null, escritorio: escritorio?.nome ?? null },
    e.analise as unknown as AnaliseDaEntrevista,
    opcoes.observacoes ?? "",
  );
  await comEscritorio(escritorioId, (db) =>
    db.entrevista.update({ where: { id }, data: { minutaPrompt: prompt, minutaGeradaEm: new Date() } }),
  );
  return { prompt, faltando };
}

/** O PDF da entrevista: roteiro, organizacao, anotacoes e a transcricao inteira. */
export async function pdfDaEntrevista(escritorioId: string, id: string): Promise<{ pdf: Uint8Array; nome: string }> {
  const e = await entrevistaPorId(escritorioId, id);
  const [cliente, quem, escritorio] = await Promise.all([
    e.clienteId
      ? comEscritorio(escritorioId, (db) => db.cliente.findFirst({ where: { id: e.clienteId! }, select: { documento: true } }))
      : null,
    e.usuarioId
      ? comEscritorio(escritorioId, (db) => db.usuario.findFirst({ where: { id: e.usuarioId! }, select: { nome: true } }))
      : null,
    prismaPlataforma().escritorio.findUnique({ where: { id: escritorioId }, select: { nome: true } }),
  ]);
  const roteiro = Array.isArray(e.roteiro) ? (e.roteiro as unknown[]).filter((p): p is string => typeof p === "string") : [];
  const pdf = await gerarPdfEntrevista({
    escritorio: escritorio?.nome ?? "Escritorio",
    titulo: `${TITULO_DO_TIPO[tipoDe(e.tipo)]}${e.tipoAcao ? ` — ${e.tipoAcao}` : ""}`,
    rotuloDoEntrevistado: tipoDe(e.tipo) === "TESTEMUNHA" ? "Testemunha" : tipoDe(e.tipo) === "COLETA" ? "Entrevistado" : "Cliente",
    subtitulo: `Registro: ${ROTULO_DO_TIPO[tipoDe(e.tipo)].toLowerCase()}`,
    nomeCliente: e.nome,
    documentoCliente: cliente?.documento ?? null,
    nomeAdvogado: quem?.nome ?? "-",
    iniciadaEm: e.criadaEm,
    encerradaEm: e.encerradaEm,
    origemTranscricao: e.origemTranscricao ?? "DIGITADA",
    transcricao: e.transcricao ?? "",
    anotacoes: e.anotacoes ?? "",
    analise: (e.analise ?? null) as AnaliseDaEntrevista | null,
    tipoAcao: e.tipoAcao,
    perguntas: roteiro,
  });
  const dia = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(e.criadaEm);
  const nome = `Entrevista ${dia} - ${e.nome.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").slice(0, 60)}.pdf`;
  return { pdf, nome };
}

export class SemPerguntas extends Error {
  readonly status = 400;
  constructor() {
    super("Gere as perguntas antes: pela procuracao ou pelo tipo de acao.");
    this.name = "SemPerguntas";
  }
}

/** O PDF das perguntas, para o cliente responder gravando em casa. */
export async function pdfDasPerguntas(escritorioId: string, id: string): Promise<{ pdf: Uint8Array; nome: string }> {
  const e = await entrevistaPorId(escritorioId, id);
  const perguntas = Array.isArray(e.roteiro) ? (e.roteiro as unknown[]).filter((p): p is string => typeof p === "string") : [];
  if (perguntas.length === 0) throw new SemPerguntas();
  const escritorio = await prismaPlataforma().escritorio.findUnique({
    where: { id: escritorioId },
    select: { nome: true, telefoneAtendimento: true },
  });
  const pdf = await gerarPdfPerguntas({
    escritorio: escritorio?.nome ?? "Escritorio",
    telefoneDoEscritorio: escritorio?.telefoneAtendimento?.trim() || null,
    nomeCliente: e.nome,
    tipoAcao: e.tipoAcao,
    perguntas,
  });
  const nome = `Perguntas - ${e.nome.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").slice(0, 60)}.pdf`;
  return { pdf, nome };
}

/**
 * Manda o PDF das perguntas ao entrevistado pelo WhatsApp.
 *
 * O telefone e o do cliente, quando a entrevista ja esta ligada a um; senao,
 * o que foi informado ao abrir a entrevista — quem esta na triagem ainda nao
 * e cliente. As respostas voltam em audio e entram por "Importar audio".
 */
export async function mandarPerguntasNoWhatsapp(
  escritorioId: string,
  id: string,
  usuarioId: string | null,
): Promise<{ telefone: string }> {
  const e = await entrevistaPorId(escritorioId, id);
  const cliente = e.clienteId
    ? await comEscritorio(escritorioId, (db) =>
        db.cliente.findFirst({ where: { id: e.clienteId! }, select: { id: true, nome: true, telefone: true } }),
      )
    : null;
  const { pdf, nome } = await pdfDasPerguntas(escritorioId, id);
  const enviado = await mandarArquivoNoWhatsapp(
    escritorioId,
    {
      clienteId: cliente?.id ?? null,
      nomeDoCliente: cliente?.nome ?? e.nome,
      telefoneDoCadastro: cliente?.telefone?.trim() || e.telefone,
      arquivo: Buffer.from(pdf),
      nomeDoArquivo: nome,
      oQueE: "Perguntas para a sua entrevista",
      oQueFazer: "Responda gravando audios no celular, como explica o documento, e envie ao escritorio",
      rotulo: "PERGUNTAS",
    },
    usuarioId,
  );
  return { telefone: enviado.telefone };
}

// ---------------------------------------------------------------------------
// Na pasta do cliente: a gravacao e o PDF da transcricao
// ---------------------------------------------------------------------------

const EXTENSAO_DO_AUDIO: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

function nomeNaPasta(e: { nome: string; criadaEm: Date }, sufixo: string, extensao: string): string {
  const dia = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(e.criadaEm);
  const quem = e.nome.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").slice(0, 60);
  return `Entrevista ${dia} - ${quem} - ${sufixo}.${extensao}`;
}

export type Guardado = { guardado: true; nome: string } | { guardado: false; motivo: string };

/**
 * Guarda a gravacao da entrevista na pasta do cliente (e, com nuvem ligada,
 * na pasta dele la). Sem cliente ligado nao ha pasta: a gravacao nao fica, e
 * a resposta diz por que — a tela avisa para ligar ao cliente.
 *
 * Falha ao guardar NAO apaga a transcricao: o texto ja esta salvo, e e ele que
 * o advogado usa. A resposta traz o motivo para a tela mostrar.
 */
export async function guardarGravacaoNaPasta(
  escritorioId: string,
  id: string,
  usuarioId: string,
  audio: { tipo: string; dados: Buffer },
  sufixo = "gravacao",
): Promise<Guardado> {
  const e = await entrevistaPorId(escritorioId, id);
  if (!e.clienteId) return { guardado: false, motivo: "Ligue a entrevista a um cliente para a gravacao ficar na pasta dele." };
  const tipo = audio.tipo.split(";")[0].trim().toLowerCase();
  const extensao = EXTENSAO_DO_AUDIO[tipo];
  if (!extensao) return { guardado: false, motivo: `Formato de audio ${tipo || "desconhecido"} nao e guardado na pasta.` };
  try {
    const nome = nomeNaPasta(e, `${sufixo} ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date()).replace(":", "h")}`, extensao);
    await guardarArquivo(escritorioId, {
      nome,
      tipo,
      conteudo: audio.dados,
      usuarioId,
      clienteId: e.clienteId,
      processoId: e.processoId,
      descricao: `Gravacao da entrevista (${ROTULO_DO_TIPO[tipoDe(e.tipo)].toLowerCase()}) de ${e.nome}`,
    });
    await cutucarNuvem(escritorioId);
    return { guardado: true, nome };
  } catch (falha) {
    return { guardado: false, motivo: `A gravacao nao foi guardada na pasta: ${(falha as Error).message}` };
  }
}

/** Ao encerrar: o PDF da transcricao vai para a pasta do cliente. */
export async function guardarPdfNaPasta(escritorioId: string, id: string, usuarioId: string): Promise<Guardado> {
  const e = await entrevistaPorId(escritorioId, id);
  if (!e.clienteId) return { guardado: false, motivo: "Sem cliente ligado, o PDF nao vai para pasta nenhuma." };
  try {
    const { pdf } = await pdfDaEntrevista(escritorioId, id);
    const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
      .format(new Date())
      .replace(":", "h");
    const nome = nomeNaPasta(e, `transcricao ${hora}`, "pdf");
    await guardarArquivo(escritorioId, {
      nome,
      tipo: "application/pdf",
      conteudo: Buffer.from(pdf),
      usuarioId,
      clienteId: e.clienteId,
      processoId: e.processoId,
      descricao: `Transcricao da entrevista (${ROTULO_DO_TIPO[tipoDe(e.tipo)].toLowerCase()}) de ${e.nome}`,
    });
    await cutucarNuvem(escritorioId);
    return { guardado: true, nome };
  } catch (falha) {
    return { guardado: false, motivo: `O PDF nao foi guardado na pasta: ${(falha as Error).message}` };
  }
}
