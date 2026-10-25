// Papeis dentro de um escritorio.
//
// Isto e a camada do USUARIO. A camada do ESCRITORIO e o modulo contratado
// (src/lib/modulos.ts): o modulo libera a area para o escritorio, o papel
// libera para a pessoa. As duas precisam permitir.
//
// ESTAGIARIO (25/10/2026, vindo do sistema da Advocacia Roma): apoio, como o
// USUARIO, e com o rotulo certo. Nao entra em nada privativo de advogado —
// nao conta na faixa de advogados, nao libera o texto da peticao inicial, e
// a OAB dele nao vai para o monitoramento do DJEN. Atua em conjunto com o
// advogado (EAOAB, art. 3o, par. 2o), nao no lugar dele.
export const PAPEIS = ["ADMIN", "ADVOGADO", "ESTAGIARIO", "USUARIO"] as const;
export type Papel = (typeof PAPEIS)[number];

export const ROTULO_DO_PAPEL: Record<Papel, string> = {
  ADMIN: "Administrador",
  ADVOGADO: "Advogado(a)",
  ESTAGIARIO: "Estagiário(a)",
  USUARIO: "Apoio",
};

/** Como o papel aparece na tela. Papel desconhecido sai como esta. */
export function rotuloDoPapel(papel: string | null | undefined): string {
  if (!papel) return "—";
  return ROTULO_DO_PAPEL[papel as Papel] ?? papel;
}

/** Para os seletores de papel, na ordem em que aparecem. */
export const OPCOES_DE_PAPEL = PAPEIS.map((valor) => ({ valor, rotulo: ROTULO_DO_PAPEL[valor] }));

export function ehPapel(valor: string): valor is Papel {
  return (PAPEIS as readonly string[]).includes(valor);
}

export class SemPermissao extends Error {
  readonly status = 403;
  constructor(motivo = "Seu papel não permite esta ação.") {
    super(motivo);
    this.name = "SemPermissao";
  }
}
