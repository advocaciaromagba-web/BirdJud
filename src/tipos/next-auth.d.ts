import "next-auth";

declare module "next-auth" {
  interface User {
    escritorioId: string;
    papel: string;
  }

  interface Session {
    escritorioId: string;
    usuarioId: string;
    papel: string;
    /** Momento em que a sessao foi emitida (ms). */
    emitidaEm: number;
  }
}
