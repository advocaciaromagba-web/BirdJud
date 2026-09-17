// Constantes de autenticacao compartilhadas entre servidor e navegador.
// Nao importar Prisma nem nada de Node aqui: este arquivo entra no bundle
// do cliente.

/** Id do provedor. Usado no formulario e na rota /api/auth/callback/<id>. */
export const PROVEDOR = "credenciais";

/** Status de escritorio que permitem abrir sessao. */
export const STATUS_QUE_ENTRAM = new Set(["TESTE", "ATIVO", "INADIMPLENTE"]);
