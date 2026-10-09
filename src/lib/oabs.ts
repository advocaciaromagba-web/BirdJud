// OAB monitorada no DJEN. Uma regra so, usada pelo escritorio e pela
// implantacao feita pela plataforma.
import { z } from "zod";
import { comEscritorio, semEscritorio } from "./prisma";

import { UFS } from "./ufs";
export { UFS };

export const novaOab = z.object({
  numero: z.string().min(3).max(10),
  uf: z.enum(UFS),
  nomeAdvogado: z.string().max(120).optional(),
});

export type NovaOab = z.infer<typeof novaOab>;

/** So digitos: "123.456" e "123456" sao a mesma OAB. */
export function numeroDaOab(numero: string): string {
  return numero.replace(/\D/g, "");
}

export async function adicionarOab(escritorioId: string, oab: NovaOab) {
  return comEscritorio(escritorioId, (db) =>
    db.oabMonitorada.create({
      data: semEscritorio({
        numero: numeroDaOab(oab.numero),
        uf: oab.uf,
        nomeAdvogado: oab.nomeAdvogado,
      }),
    }),
  );
}

/**
 * "123456/SP", "SP 123.456", "123456-SP" -> { numero, uf }. Usado para tirar
 * a OAB monitorada do cadastro do advogado, sem pedir de novo.
 */
export function lerOab(texto: string | null | undefined): { numero: string; uf: (typeof UFS)[number] } | null {
  if (!texto) return null;
  const uf = UFS.find((u) => new RegExp(`(^|[^A-Z])${u}([^A-Z]|$)`).test(texto.toUpperCase()));
  const numero = numeroDaOab(texto);
  if (!uf || numero.length < 3 || numero.length > 10) return null;
  return { numero, uf };
}
