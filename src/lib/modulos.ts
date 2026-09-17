// Ponto unico de verificacao de modulo contratado.
//
// Menu, rotas e rotinas consultam SO esta funcao. Modulo nao contratado some
// do menu, faz a rota responder 403 e a rotina nem roda para o escritorio.
import { comEscritorio } from "./prisma";

export const MODULOS = [
  "NUCLEO",
  "PUBLICACOES_DJEN",
  "PUBLICACOES_AASP",
  "WHATSAPP",
  "EMAIL",
  "NFSE",
  "COBRANCAS",
  "FINANCEIRO",
  "ASSINATURA",
  "IA",
  "NUVEM",
] as const;

export type Modulo = (typeof MODULOS)[number];

/** Modulos que so funcionam se outro estiver contratado junto. */
export const DEPENDENCIAS: Partial<Record<Modulo, Modulo[][]>> = {
  // lembretes e resumo diario exigem WhatsApp OU E-mail
  WHATSAPP: [],
  NFSE: [],
};

export async function moduloAtivo(escritorioId: string, modulo: Modulo): Promise<boolean> {
  if (modulo === "NUCLEO") return true;
  const contrato = await comEscritorio(escritorioId, (db) =>
    db.moduloContratado.findFirst({ where: { modulo, ativo: true } })
  );
  return contrato !== null;
}

export async function modulosAtivos(escritorioId: string): Promise<Modulo[]> {
  const contratos = await comEscritorio(escritorioId, (db) =>
    db.moduloContratado.findMany({ where: { ativo: true } })
  );
  return ["NUCLEO", ...contratos.map((c) => c.modulo as Modulo)];
}

export class ModuloNaoContratado extends Error {
  readonly status = 403;
  constructor(modulo: Modulo) {
    super(`Modulo ${modulo} nao contratado por este escritorio.`);
    this.name = "ModuloNaoContratado";
  }
}

/** Use no inicio de toda rota que pertence a um modulo. */
export async function exigirModulo(escritorioId: string, modulo: Modulo): Promise<void> {
  if (!(await moduloAtivo(escritorioId, modulo))) throw new ModuloNaoContratado(modulo);
}
