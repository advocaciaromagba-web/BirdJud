import "next-auth";

declare module "next-auth" {
  interface User {
    escritorioId: string;
    papel: string;
    /** Entrada de suporte: o registro do acesso, ate quando vale e quem entrou. */
    suporte?: { acessoId: string; ate: number; operador: string };
  }

  interface Session {
    escritorioId: string;
    usuarioId: string;
    papel: string;
    /** Momento em que a sessao foi emitida (ms). */
    emitidaEm: number;
    /** Presente so na sessao aberta pelo suporte da plataforma. */
    suporte?: { acessoId: string; ate: number; operador: string };
  }
}
