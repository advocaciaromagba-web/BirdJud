// Ponto unico de verificacao de modulo contratado.
//
// Menu, rotas e rotinas consultam SO esta funcao. Modulo nao contratado some
// do menu, faz a rota responder 403 e a rotina nem roda para o escritorio.
import { comEscritorio } from "./prisma";

export { MODULOS, type Modulo } from "./catalogo";
import { MODULOS, type Modulo } from "./catalogo";

export async function moduloAtivo(
  escritorioId: string,
  modulo: Modulo,
): Promise<boolean> {
  if (modulo === "NUCLEO") return true;
  const contrato = await comEscritorio(escritorioId, (db) =>
    db.moduloContratado.findFirst({ where: { modulo, ativo: true } }),
  );
  return contrato !== null;
}

export async function modulosAtivos(escritorioId: string): Promise<Modulo[]> {
  const contratos = await comEscritorio(escritorioId, (db) =>
    db.moduloContratado.findMany({ where: { ativo: true } }),
  );
  // So nomes do catalogo: um nome estranho na tabela nao vira modulo (e nao
  // tira o escritorio do preco do pacote na tela Plano).
  return [
    "NUCLEO",
    ...contratos
      .map((c) => c.modulo)
      .filter((m): m is Modulo => m !== "NUCLEO" && (MODULOS as readonly string[]).includes(m)),
  ];
}

export class ModuloNaoContratado extends Error {
  readonly status = 403;
  constructor(modulo: Modulo) {
    super(`Modulo ${modulo} nao contratado por este escritorio.`);
    this.name = "ModuloNaoContratado";
  }
}

/** Use no inicio de toda rota que pertence a um modulo. */
export async function exigirModulo(
  escritorioId: string,
  modulo: Modulo,
): Promise<void> {
  if (!(await moduloAtivo(escritorioId, modulo)))
    throw new ModuloNaoContratado(modulo);
}
