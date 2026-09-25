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
export async function reclamar(): Promise<Trabalho | null> {
  const linhas = await prismaPlataforma().$queryRaw<Trabalho[]>`
    UPDATE "Trabalho" SET
      "estado" = 'EXECUTANDO',
      "iniciadoEm" = now(),
      "tentativas" = "tentativas" + 1
    WHERE "id" = (
      SELECT t."id" FROM "Trabalho" t
      WHERE t."estado" = 'PENDENTE'
        AND t."agendadoPara" <= now()
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
 * Marca a falha. Enquanto houver tentativa sobrando, volta para PENDENTE com
 * espera crescente (1min, 4min, 9min...); depois disso para em FALHOU.
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
            Date.now() + trabalho.tentativas ** 2 * 60_000,
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
      erro: "Retomado apos ficar preso em execucao.",
    },
  });
  return count;
}
