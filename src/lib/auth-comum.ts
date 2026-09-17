// Constantes de autenticacao compartilhadas entre servidor e navegador.
// Nao importar Prisma nem nada de Node aqui: este arquivo entra no bundle
// do cliente.

/** Id do provedor do escritorio. Usado em signIn() e em /api/auth/callback/<id>. */
export const PROVEDOR = "credenciais";

/** Id do provedor do operador da plataforma — login separado, em outro endereco. */
export const PROVEDOR_OPERADOR = "operador";

/** Papel que a sessao do operador carrega. Nao existe dentro de escritorio. */
export const PAPEL_OPERADOR = "OPERADOR";

/** Status de escritorio que permitem abrir sessao. */
export const STATUS_QUE_ENTRAM = new Set(["TESTE", "ATIVO", "INADIMPLENTE"]);
