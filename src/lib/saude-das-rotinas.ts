// As rotinas internas estao rodando?
//
// /api/saude prova que a aplicacao e o banco respondem. Nao prova que o
// trabalhador esta de pe nem que as rotinas de cada escritorio estao dando
// certo — e foi assim que, em 13/10/2026, os lembretes de um escritorio
// ficaram horas sem sair com o site inteiro "verde". Esta conferencia fecha
// esse buraco e e o que o vigia externo consulta.
import { prismaPlataforma } from "./prisma";

/** Sem nenhum trabalho concluido neste tempo, o trabalhador esta parado. */
export const TRABALHADOR_PARADO_MINUTOS = 90;

/** Ate onde se olha para tras para decidir se a rotina esta falhando. */
export const JANELA_DAS_ROTINAS_HORAS = 6;

/**
 * As rotinas que, paradas, fazem o escritorio perder prazo ou cliente:
 * avisos, lembretes, captura e triagem de publicacoes.
 */
export const ROTINAS_ESSENCIAIS = ["AVISAR", "LEMBRAR", "CAPTURAR_PUBLICACOES", "TRIAR_PUBLICACOES"];

export type SaudeDasRotinas = {
  ok: boolean;
  trabalhadorParado: boolean;
  /** Pares escritorio x rotina cuja ULTIMA execucao terminou em falha. */
  rotinasFalhando: number;
};

export async function saudeDasRotinas(agora = new Date()): Promise<SaudeDasRotinas> {
  const db = prismaPlataforma();
  const desde = new Date(agora.getTime() - TRABALHADOR_PARADO_MINUTOS * 60_000);
  const recente = await db.trabalho.findFirst({
    where: { estado: "CONCLUIDO", concluidoEm: { gte: desde } },
    select: { id: true },
  });

  // A ultima execucao terminada de cada rotina de cada escritorio. Falha que
  // ja foi seguida de sucesso nao conta: o que importa e como esta AGORA.
  // FALHOU ja quer dizer que as tentativas acabaram (fila.ts).
  const janela = new Date(agora.getTime() - JANELA_DAS_ROTINAS_HORAS * 3_600_000);
  const ultimas = await db.$queryRaw<{ estado: string }[]>`
    SELECT DISTINCT ON ("escritorioId", "tipo") "estado"
      FROM "Trabalho"
     WHERE "estado" IN ('CONCLUIDO', 'FALHOU')
       AND "concluidoEm" >= ${janela}
       AND "tipo" = ANY(${ROTINAS_ESSENCIAIS})
     ORDER BY "escritorioId", "tipo", "concluidoEm" DESC`;
  const rotinasFalhando = ultimas.filter((u) => u.estado === "FALHOU").length;

  const trabalhadorParado = !recente;
  return { ok: !trabalhadorParado && rotinasFalhando === 0, trabalhadorParado, rotinasFalhando };
}

export type FalhaDeRotina = {
  escritorio: string;
  tipo: string;
  concluidoEm: Date;
  tentativas: number;
  erro: string;
};

/**
 * As falhas das ultimas 24 horas, para o painel do console: escritorio,
 * rotina, hora e a mensagem de erro. O que /api/saude/rotinas esconde de
 * proposito (e publico) fica aqui, atras do login do operador — e sobrevive
 * ao redeploy que apaga o log do trabalhador.
 */
export async function falhasRecentesDasRotinas(agora = new Date(), horas = 24): Promise<FalhaDeRotina[]> {
  const desde = new Date(agora.getTime() - horas * 3_600_000);
  const falhas = await prismaPlataforma().trabalho.findMany({
    where: { estado: "FALHOU", concluidoEm: { gte: desde } },
    orderBy: { concluidoEm: "desc" },
    take: 50,
    select: { tipo: true, concluidoEm: true, tentativas: true, erro: true, escritorio: { select: { nome: true } } },
  });
  return falhas.map((f) => ({
    escritorio: f.escritorio?.nome ?? "plataforma",
    tipo: f.tipo,
    concluidoEm: f.concluidoEm ?? desde,
    tentativas: f.tentativas,
    erro: (f.erro ?? "").slice(0, 300) || "sem mensagem",
  }));
}
