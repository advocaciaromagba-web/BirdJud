// A triagem no banco: ler a publicacao, sugerir, e virar compromisso.
//
// A regra de classificacao mora em triagem-de-publicacao.ts, pura; a conta do
// prazo, em prazos.ts, com o calendario do escritorio. Aqui se junta tudo e
// se grava.
//
// DUAS LINHAS QUE NAO SE CRUZAM:
//
//   a IA diz QUANTOS DIAS o texto menciona;
//   o SISTEMA diz QUE DIA isso e.
//
// Nunca o contrario. Prazo errado e a unica coisa neste sistema cujo erro nao
// tem conserto depois, e modelo de linguagem contando dia util com feriado
// municipal no meio e exatamente o tipo de conta que parece certa e nao e.
import { comEscritorio, semEscritorio } from "./prisma";
import { moduloAtivo } from "./modulos";
import { IARecusou, SemChaveDeIA, milTokens, pedirEstruturado } from "./ia";
import { registrarConsumo } from "./consumo";
import {
  ESQUEMA_TRIAGEM,
  SISTEMA_TRIAGEM,
  entradaDaAnalise,
} from "./prompts-ia";
import { calcularPrazo, recuarDiasUteis, PrazoInvalido } from "./prazos";
import {
  calendarioDoEscritorio,
  hoje,
  registrarPrazo,
} from "./prazos-do-escritorio";
import { formatarNumeroProcesso } from "./leitura-publicacao";
import {
  ANTECEDENCIA_SUGERIDA_DIAS,
  sugestaoSemIA,
  tituloPadrao,
  type Sugestao,
} from "./triagem-de-publicacao";

export class SemPublicacao extends Error {
  readonly status = 404;
  constructor() {
    super("Publicacao nao encontrada.");
    this.name = "SemPublicacao";
  }
}

/** Data e hora que o texto marcou, se der para ler. Nunca inventa. */
function dataDoAtoValida(bruto: string | null): Date | null {
  if (!bruto) return null;
  const limpo = bruto.trim();
  const so = /^\d{4}-\d{2}-\d{2}$/.test(limpo);
  const comHora = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(limpo);
  if (!so && !comHora) return null;
  // Horario de Brasilia: o que o diario escreve e hora local do forum.
  const d = new Date(`${so ? `${limpo}T09:00` : limpo}:00-03:00`);
  if (Number.isNaN(d.getTime())) return null;
  // Ato no passado nao vira agendamento: publicacao velha reprocessada
  // encheria a agenda de audiencias que ja aconteceram.
  return d.getTime() > Date.now() ? d : null;
}

type PublicacaoParaTriar = {
  id: string;
  texto: string;
  numeroProcesso: string | null;
  tribunal: string | null;
  orgao: string | null;
  dataDisponibilizacao: Date;
  prazoDias: number | null;
};

/** O dia em que o prazo comeca a correr, no formato de prazos.ts. */
function termoInicial(p: PublicacaoParaTriar): string {
  return p.dataDisponibilizacao.toISOString().slice(0, 10);
}

async function lerComIA(p: PublicacaoParaTriar): Promise<{
  sugestao: Sugestao;
  modelo: string | null;
  tokens: { entrada: number; saida: number };
} | null> {
  try {
    const r = await pedirEstruturado<Sugestao>(
      SISTEMA_TRIAGEM,
      entradaDaAnalise({
        texto: p.texto,
        numeroProcesso: p.numeroProcesso,
        tribunal: p.tribunal,
        orgao: p.orgao,
      }),
      ESQUEMA_TRIAGEM,
      "low",
    );
    return {
      sugestao: r.dados,
      modelo: r.modelo,
      tokens: { entrada: r.tokensEntrada, saida: r.tokensSaida },
    };
  } catch (erro) {
    // Chave ausente, recusa do classificador, resposta fora do formato, rede.
    // Nenhum desses pode deixar a publicacao SEM sugestao: a lista sem
    // sugestao e a lista de antes, e e dela que o prazo escapa.
    if (
      erro instanceof SemChaveDeIA ||
      erro instanceof IARecusou ||
      erro instanceof Error
    ) {
      return null;
    }
    throw erro;
  }
}

export type TriagemGravada = {
  id: string;
  publicacaoId: string;
  especie: string;
  tipo: string;
  titulo: string;
  resumo: string;
  prazoFatal: Date | null;
  prazoSugerido: Date | null;
  dataDoAto: Date | null;
  confianca: string;
  atencao: string | null;
  explicacao: string | null;
  compromissoId: string | null;
};

/**
 * Tria uma publicacao e grava a sugestao.
 *
 * Idempotente por publicacao: rodar de novo REFAZ a sugestao, mas nunca mexe
 * numa ja aceita — o compromisso ja existe, e mudar a sugestao por baixo dele
 * so confundiria quem olhasse depois.
 */
export async function triarPublicacao(
  escritorioId: string,
  publicacaoId: string,
): Promise<TriagemGravada> {
  const publicacao = await comEscritorio(escritorioId, (db) =>
    db.publicacao.findFirst({
      where: { id: publicacaoId },
      select: {
        id: true,
        texto: true,
        numeroProcesso: true,
        tribunal: true,
        orgao: true,
        dataDisponibilizacao: true,
        prazoDias: true,
      },
    }),
  );
  if (!publicacao) throw new SemPublicacao();

  const jaTem = await comEscritorio(escritorioId, (db) =>
    db.triagemDePublicacao.findFirst({ where: { publicacaoId } }),
  );
  if (jaTem?.aceitaEm) return comoTriagem(jaTem);

  const comIA = (await moduloAtivo(escritorioId, "IA"))
    ? await lerComIA(publicacao)
    : null;

  const numeroFormatado = publicacao.numeroProcesso
    ? formatarNumeroProcesso(publicacao.numeroProcesso)
    : null;

  const sugestao =
    comIA?.sugestao ??
    sugestaoSemIA(publicacao.texto, publicacao.prazoDias, numeroFormatado);

  if (comIA) {
    await registrarConsumo(
      escritorioId,
      "IA_MIL_TOKENS",
      milTokens(comIA.tokens.entrada, comIA.tokens.saida),
    );
  }

  // ----- a conta do prazo, aqui e so aqui -----
  const calendario = await calendarioDoEscritorio(escritorioId);
  let prazoFatal: Date | null = null;
  let prazoSugerido: Date | null = null;
  let explicacao: string | null = null;

  if (sugestao.prazoDias && sugestao.prazoDias > 0) {
    try {
      const conta = calcularPrazo(
        termoInicial(publicacao),
        sugestao.prazoDias,
        sugestao.contagem === "CORRIDOS" ? "CORRIDOS" : "UTEIS",
        calendario,
      );
      const sugerida = recuarDiasUteis(
        conta.vencimento,
        ANTECEDENCIA_SUGERIDA_DIAS,
        hoje(),
        calendario,
      );
      // Meio-dia: data de calendario guardada em instante, lida de volta em
      // Brasilia sem virar o dia anterior.
      prazoFatal = new Date(`${conta.vencimento}T12:00:00Z`);
      prazoSugerido = new Date(`${sugerida}T12:00:00Z`);
      explicacao = conta.explicacao;
    } catch (erro) {
      if (!(erro instanceof PrazoInvalido)) throw erro;
      explicacao = `Nao deu para contar o prazo: ${erro.message}`;
    }
  }

  const dados = {
    especie: sugestao.especie,
    tipo: sugestao.tipo,
    titulo:
      `${(sugestao.titulo || "").trim()}`.slice(0, 80) ||
      tituloPadrao(sugestao.especie, sugestao.tipo, numeroFormatado),
    resumo: (sugestao.resumo || "").slice(0, 400),
    prazoDias: sugestao.prazoDias ?? null,
    contagem: sugestao.contagem ?? null,
    prazoFatal,
    prazoSugerido,
    dataDoAto: dataDoAtoValida(sugestao.dataDoAto),
    confianca: sugestao.confianca,
    atencao: sugestao.atencao?.slice(0, 300) ?? null,
    explicacao,
    modelo: comIA?.modelo ?? null,
    recusadaEm: null,
  };

  const gravada = jaTem
    ? await comEscritorio(escritorioId, (db) =>
        db.triagemDePublicacao.update({ where: { id: jaTem.id }, data: dados }),
      )
    : await comEscritorio(escritorioId, (db) =>
        db.triagemDePublicacao.create({
          data: semEscritorio({ ...dados, publicacaoId }),
        }),
      );

  return comoTriagem(gravada);
}

function comoTriagem(t: {
  id: string;
  publicacaoId: string;
  especie: string;
  tipo: string;
  titulo: string;
  resumo: string;
  prazoFatal: Date | null;
  prazoSugerido: Date | null;
  dataDoAto: Date | null;
  confianca: string;
  atencao: string | null;
  explicacao: string | null;
  compromissoId: string | null;
}): TriagemGravada {
  return {
    id: t.id,
    publicacaoId: t.publicacaoId,
    especie: t.especie,
    tipo: t.tipo,
    titulo: t.titulo,
    resumo: t.resumo,
    prazoFatal: t.prazoFatal,
    prazoSugerido: t.prazoSugerido,
    dataDoAto: t.dataDoAto,
    confianca: t.confianca,
    atencao: t.atencao,
    explicacao: t.explicacao,
    compromissoId: t.compromissoId,
  };
}

/** Tria o que ainda nao foi triado. E o que a rotina da madrugada chama. */
export async function triarPendentes(
  escritorioId: string,
  limite = 50,
): Promise<number> {
  const pendentes = await comEscritorio(escritorioId, (db) =>
    db.publicacao.findMany({
      where: { arquivada: false, triagem: { is: null } },
      orderBy: { criadoEm: "desc" },
      take: limite,
      select: { id: true },
    }),
  );

  let feitas = 0;
  for (const p of pendentes) {
    try {
      await triarPublicacao(escritorioId, p.id);
      feitas += 1;
    } catch (erro) {
      // Uma publicacao estranha nao pode derrubar a rotina das outras.
      console.log(
        `triagem ${p.id}: ${erro instanceof Error ? erro.message : "falhou"}`.slice(
          0,
          300,
        ),
      );
    }
  }
  return feitas;
}

export class TriagemNaoEncontrada extends Error {
  readonly status = 404;
  constructor() {
    super("Sugestao nao encontrada.");
    this.name = "TriagemNaoEncontrada";
  }
}

export class SemDataParaAgendar extends Error {
  readonly status = 422;
  constructor() {
    super(
      "Esta publicacao nao trouxe data nem prazo. Escolha a data antes de agendar.",
    );
    this.name = "SemDataParaAgendar";
  }
}

export type Aceite = {
  compromissoId: string;
  prazoId: string | null;
  quando: Date;
};

/**
 * Aceita a sugestao: nasce o compromisso.
 *
 * Nasce AQUI, e nao na triagem, porque sistema que cria prazo sozinho na
 * agenda do escritorio e sistema em que ninguem confia na agenda — e agenda
 * em que ninguem confia nao e olhada no dia em que importa.
 *
 * Quando ha prazo fatal, saem DUAS coisas e nao uma:
 *
 *   o COMPROMISSO, na data sugerida (tres dias uteis antes), que e quando o
 *   escritorio trabalha;
 *   o PRAZO, no fatal, que e o que a tela de prazos vigia.
 *
 * Marcar so o fatal e marcar para o dia em que nao da mais para errar; marcar
 * so o sugerido e perder o fatal de vista.
 */
export async function aceitarTriagem(
  escritorioId: string,
  triagemId: string,
  ajustes: {
    quando?: string | null;
    titulo?: string | null;
    responsavelId?: string | null;
  } = {},
): Promise<Aceite> {
  const t = await comEscritorio(escritorioId, (db) =>
    db.triagemDePublicacao.findFirst({
      where: { id: triagemId },
      include: {
        publicacao: {
          select: {
            id: true,
            numeroProcesso: true,
            dataDisponibilizacao: true,
            processoId: true,
          },
        },
      },
    }),
  );
  if (!t) throw new TriagemNaoEncontrada();
  if (t.compromissoId) {
    return { compromissoId: t.compromissoId, prazoId: null, quando: t.criadoEm };
  }

  // A data, em ordem de confianca: o que a pessoa escolheu, a data que o
  // proprio texto marcou, a sugerida, e o fatal como ultimo recurso.
  const escolhida = ajustes.quando ? new Date(ajustes.quando) : null;
  const quando =
    escolhida && !Number.isNaN(escolhida.getTime())
      ? escolhida
      : (t.dataDoAto ?? t.prazoSugerido ?? t.prazoFatal);
  if (!quando) throw new SemDataParaAgendar();

  // Processo ja cadastrado: o compromisso entra ligado a ele e ao cliente.
  const processo = t.publicacao.processoId
    ? await comEscritorio(escritorioId, (db) =>
        db.processo.findFirst({
          where: { id: t.publicacao.processoId! },
          select: { id: true, clienteId: true },
        }),
      )
    : null;

  const titulo = (ajustes.titulo?.trim() || t.titulo).slice(0, 200);

  const observacoes = [
    t.resumo || null,
    t.prazoFatal
      ? `PRAZO FATAL: ${t.prazoFatal.toISOString().slice(0, 10).split("-").reverse().join("/")}.`
      : null,
    t.explicacao,
    t.atencao ? `Atencao: ${t.atencao}` : null,
    "Sugestao automatica a partir da publicacao — confira nos autos.",
  ]
    .filter(Boolean)
    .join("\n");

  const compromisso = await comEscritorio(escritorioId, (db) =>
    db.compromisso.create({
      data: semEscritorio({
        titulo,
        tipo: t.tipo,
        inicio: quando,
        processoId: processo?.id ?? null,
        clienteId: processo?.clienteId ?? null,
        responsavelId: ajustes.responsavelId || null,
        observacoes: observacoes.slice(0, 2000),
      }),
      select: { id: true },
    }),
  );

  // O fatal vira prazo de verdade, vigiado pela tela de prazos.
  let prazoId: string | null = null;
  if (t.prazoDias && t.prazoDias > 0) {
    const { id } = await registrarPrazo(escritorioId, {
      titulo,
      termoInicial: t.publicacao.dataDisponibilizacao.toISOString().slice(0, 10),
      dias: t.prazoDias,
      contagem: t.contagem === "CORRIDOS" ? "CORRIDOS" : "UTEIS",
      processoId: processo?.id ?? null,
      clienteId: processo?.clienteId ?? null,
      responsavelId: ajustes.responsavelId || null,
      observacao: "Da publicacao, por sugestao automatica. Confira nos autos.",
    });
    prazoId = id;
  }

  await comEscritorio(escritorioId, async (db) => {
    await db.triagemDePublicacao.update({
      where: { id: t.id },
      data: { compromissoId: compromisso.id, aceitaEm: new Date() },
    });
    // Aceita a sugestao, a publicacao esta tratada: some da lista de abertas.
    await db.publicacao.updateMany({
      where: { id: t.publicacaoId },
      data: { lida: true },
    });
  });

  return { compromissoId: compromisso.id, prazoId, quando };
}

/** Recusa a sugestao. A publicacao fica, a sugestao sai da frente. */
export async function recusarTriagem(
  escritorioId: string,
  triagemId: string,
): Promise<void> {
  await comEscritorio(escritorioId, (db) =>
    db.triagemDePublicacao.updateMany({
      where: { id: triagemId, aceitaEm: null },
      data: { recusadaEm: new Date() },
    }),
  );
}
