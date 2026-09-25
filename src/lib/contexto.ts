// Contexto do escritorio da requisicao atual.
//
// Guardado em AsyncLocalStorage para que a extensao do Prisma e o RLS leiam o
// mesmo escritorioId sem precisar passar o parametro por todas as camadas.
import { AsyncLocalStorage } from "node:async_hooks";

export type ContextoEscritorio = {
  escritorioId: string;
  usuarioId?: string;
  papel?: string;
};

const armazem = new AsyncLocalStorage<ContextoEscritorio>();

export function comContexto<T>(ctx: ContextoEscritorio, fn: () => T): T {
  return armazem.run(ctx, fn);
}

export function contextoAtual(): ContextoEscritorio | undefined {
  return armazem.getStore();
}

/** Escritorio da requisicao. Lanca se nao houver — rota sem escritorio nao consulta nada. */
export function escritorioAtual(): string {
  const ctx = armazem.getStore();
  if (!ctx?.escritorioId) {
    throw new Error(
      "Consulta sem escritorio no contexto. Toda rota precisa rodar dentro de comEscritorio().",
    );
  }
  return ctx.escritorioId;
}
