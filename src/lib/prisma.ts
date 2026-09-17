// Cliente Prisma com as duas travas de isolamento.
//
// Trava 1 (codigo): a extensao abaixo injeta escritorioId em toda leitura e
// escrita, a partir do contexto da requisicao.
// Trava 2 (banco): comEscritorio() abre uma transacao e define
// app.escritorio_id nela, que e o que as politicas de RLS leem.
//
// As duas sao independentes de proposito: um erro em uma nao abre os dados.
import { Prisma, PrismaClient } from "@prisma/client";
import { comContexto, escritorioAtual } from "./contexto";

/** Modelos da plataforma, fora de qualquer escritorio. */
const MODELOS_SEM_ESCRITORIO = new Set(["OperadorPlataforma"]);

/** Em Escritorio o dono e a propria coluna id, nao escritorioId. */
const CAMPO_DONO: Record<string, string> = { Escritorio: "id" };

const OPERACOES_LEITURA = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
]);

const OPERACOES_ESCRITA_UNICA = new Set(["create", "update", "delete", "upsert"]);

const extensaoEscritorio = Prisma.defineExtension({
  name: "isolamento-por-escritorio",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!model || MODELOS_SEM_ESCRITORIO.has(model)) return query(args);
        if (operation === "createMany" || operation === "createManyAndReturn") {
          const escritorioId = escritorioAtual();
          const a = args as { data: Record<string, unknown> | Record<string, unknown>[] };
          a.data = Array.isArray(a.data)
            ? a.data.map((d) => ({ ...d, escritorioId }))
            : { ...a.data, escritorioId };
          return query(args);
        }

        const escritorioId = escritorioAtual();
        const campo = CAMPO_DONO[model] ?? "escritorioId";
        const a = args as Record<string, any>;

        if (OPERACOES_LEITURA.has(operation) || OPERACOES_ESCRITA_UNICA.has(operation)) {
          if (operation !== "create") {
            a.where = { ...(a.where ?? {}), [campo]: escritorioId };
          }
          if (operation === "create" || operation === "upsert") {
            const alvo = operation === "create" ? "data" : "create";
            a[alvo] = { ...(a[alvo] ?? {}), [campo]: escritorioId };
          }
        }

        return query(args);
      },
    },
  },
});

const global_ = globalThis as unknown as { prismaBase?: PrismaClient };
const base = global_.prismaBase ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") global_.prismaBase = base;

/** Cliente com a trava de codigo. So funciona dentro de comEscritorio(). */
export const prisma = base.$extends(extensaoEscritorio);

export type PrismaEscritorio = typeof prisma;

/**
 * Roda fn() no contexto de um escritorio, dentro de uma transacao que define
 * app.escritorio_id — o que ativa as politicas de RLS.
 */
export async function comEscritorio<T>(
  escritorioId: string,
  fn: (db: PrismaEscritorio) => Promise<T>,
  ctx: { usuarioId?: string; papel?: string } = {}
): Promise<T> {
  return comContexto({ escritorioId, ...ctx }, () =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.escritorio_id', ${escritorioId}, true)`;
      return fn(tx as unknown as PrismaEscritorio);
    })
  );
}

/**
 * Acesso sem escritorio, so para a plataforma (cadastro de escritorio, painel
 * do operador, rotinas que percorrem escritorios). Nao passa pela trava de
 * codigo — use o minimo possivel e nunca a partir de uma rota de escritorio.
 */
export const prismaPlataforma = base;
