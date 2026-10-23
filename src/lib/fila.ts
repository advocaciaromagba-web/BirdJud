// Fila de trabalho no proprio PostgreSQL.
//
// Por que nao um pg-boss da vida: ele cria o proprio schema em tempo de
// execucao, e o papel da aplicacao aqui nao tem DDL de proposito (e o que
// sustenta o RLS). Uma tabela nossa, reclamada com FOR UPDATE SKIP LOCKED,
// resolve o que a fase 2 pede sem dependencia nova e sem abrir privilegio.
//
// Regra que importa: **um trabalho em execucao por escritorio**. Um escritorio
// com integracao quebrada segura a propria fila e nao atrasa a dos outros.
import { Prisma } from "@prisma/client";
import { prismaPlataforma } from "./prisma";

export type Trabalho = {
  id: string;
  escritorioId: string | null;
  tipo: string;
  dados: unknown;
  tentativas: number;
  maxTentativas: number;
};

export async function enfileirar(
  tipo: string,
  escritorioId: string | null,
  dados: Record<string, unknown> = {},
  agendadoPara = new Date(),
): Promise<string> {
  const trabalho = await prismaPlataforma().trabalho.create({
    data: {
      tipo,
      escritorioId,
      dados: dados as Prisma.InputJsonValue,
      agendadoPara,
    },
    select: { id: true },
  });
  return trabalho.id;
}

/**
 * Reclama um trabalho pronto para rodar.
 *
 * SKIP LOCKED deixa varios trabalhadores rodarem juntos sem pegar a mesma
 * linha. A subconsulta NOT EXISTS e o que garante um por escritorio.
 */
export async function reclamar(
  /**
   * So para teste: reclama apenas trabalhos destes escritorios. Em producao a
   * fila e global, de proposito; nos testes, que rodam em paralelo contra o
   * mesmo banco, a fila global faria um teste pegar o trabalho de outro.
   */
  apenasDosEscritorios?: string[],
): Promise<Trabalho | null> {
  const filtro = apenasDosEscritorios
    ? Prisma.sql`AND t."escritorioId" IN (${Prisma.join(apenasDosEscritorios)})`
    : Prisma.empty;
  const linhas = await prismaPlataforma().$queryRaw<Trabalho[]>`
    UPDATE "Trabalho" SET
      "estado" = 'EXECUTANDO',
      "iniciadoEm" = now(),
      "tentativas" = "tentativas" + 1
    WHERE "id" = (
      SELECT t."id" FROM "Trabalho" t
      WHERE t."estado" = 'PENDENTE'
        AND t."agendadoPara" <= now()
        ${filtro}
        AND (
          t."escritorioId" IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM "Trabalho" outro
            WHERE outro."escritorioId" = t."escritorioId"
              AND outro."estado" = 'EXECUTANDO'
          )
        )
      ORDER BY t."agendadoPara", t."criadoEm"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id", "escritorioId", "tipo", "dados", "tentativas", "maxTentativas"
  `;
  return linhas[0] ?? null;
}

export async function concluir(id: string): Promise<void> {
  await prismaPlataforma().trabalho.update({
    where: { id },
    data: { estado: "CONCLUIDO", concluidoEm: new Date(), erro: null },
  });
}

/**
 * Erro que pede para a fila esperar mais antes de tentar de novo: o servico
 * de fora caiu (DJEN com 500, por exemplo) e 1 minuto depois ele continua
 * caido. Quem lanca escolhe a espera.
 */
export class FalhaTemporaria extends Error {
  constructor(
    mensagem: string,
    readonly adiarMinutos: number,
  ) {
    super(mensagem);
    this.name = "FalhaTemporaria";
  }
}

/** A espera antes da proxima tentativa, em minutos. */
export function esperaDaTentativa(tentativas: number, erro: unknown): number {
  if (erro instanceof FalhaTemporaria) return erro.adiarMinutos;
  return tentativas ** 2;
}

/**
 * Marca a falha. Enquanto houver tentativa sobrando, volta para PENDENTE com
 * espera crescente (1min, 4min, 9min...) — ou a espera que o erro pediu
 * (FalhaTemporaria); depois disso para em FALHOU.
 */
export async function falhar(trabalho: Trabalho, erro: unknown): Promise<void> {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  const acabou = trabalho.tentativas >= trabalho.maxTentativas;

  await prismaPlataforma().trabalho.update({
    where: { id: trabalho.id },
    data: acabou
      ? { estado: "FALHOU", erro: mensagem, concluidoEm: new Date() }
      : {
          estado: "PENDENTE",
          erro: mensagem,
          agendadoPara: new Date(
            Date.now() + esperaDaTentativa(trabalho.tentativas, erro) * 60_000,
          ),
        },
  });
}

/**
 * Devolve a fila trabalhos que ficaram presos em EXECUTANDO — processo morto
 * no meio, deploy, queda de maquina. Sem isso o escritorio ficaria travado
 * para sempre, por causa da regra de um por escritorio.
 */
export async function destravar(minutos = 15): Promise<number> {
  const limite = new Date(Date.now() - minutos * 60_000);
  const { count } = await prismaPlataforma().trabalho.updateMany({
    where: { estado: "EXECUTANDO", iniciadoEm: { lt: limite } },
    data: {
      estado: "PENDENTE",
      erro: "Retomado após ficar preso em execução.",
    },
  });
  return count;
}
