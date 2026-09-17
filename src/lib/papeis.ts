// Papeis dentro de um escritorio.
//
// Isto e a camada do USUARIO. A camada do ESCRITORIO e o modulo contratado
// (src/lib/modulos.ts): o modulo libera a area para o escritorio, o papel
// libera para a pessoa. As duas precisam permitir.
export const PAPEIS = ["ADMIN", "ADVOGADO", "USUARIO"] as const;
export type Papel = (typeof PAPEIS)[number];

export function ehPapel(valor: string): valor is Papel {
  return (PAPEIS as readonly string[]).includes(valor);
}

export class SemPermissao extends Error {
  readonly status = 403;
  constructor(motivo = "Seu papel nao permite esta acao.") {
    super(motivo);
    this.name = "SemPermissao";
  }
}
