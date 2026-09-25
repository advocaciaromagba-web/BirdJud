// Ligar e desligar modulo de um escritorio.
//
// Existe para um detalhe que passa despercebido e custa dinheiro: a franquia
// do mes fica gravada em ModuloContratado.franquia, e `consumoDoMes` trata
// franquia nula como ilimitada — nada vira excedente. Contratar modulo sem
// gravar a franquia e entregar consumo ilimitado de graca.
//
// Por isso ninguem faz upsert em ModuloContratado direto: passa por aqui.
import { comEscritorio, semEscritorio } from "./prisma";
import { MODULOS, type Faixa, type Modulo } from "./catalogo";
import { franquiaDoModulo } from "./precos";

/** Liga estes modulos, com a franquia da faixa, e desliga todo o resto. */
export async function definirModulos(
  escritorioId: string,
  modulos: Modulo[],
  faixa: Faixa,
): Promise<void> {
  const ligados = new Set(modulos.filter((modulo) => modulo !== "NUCLEO"));

  await comEscritorio(escritorioId, async (db) => {
    for (const modulo of MODULOS) {
      if (modulo === "NUCLEO") continue;
      const ativo = ligados.has(modulo);
      const franquia = franquiaDoModulo(modulo, faixa);
      await db.moduloContratado.upsert({
        where: { escritorioId_modulo: { escritorioId, modulo } },
        create: semEscritorio({ modulo, ativo, franquia }),
        update: { ativo, franquia },
      });
    }
  });
}

/** Liga ou desliga um modulo so, sem mexer nos outros. */
export async function definirModulo(
  escritorioId: string,
  modulo: Modulo,
  ativo: boolean,
  faixa: Faixa,
): Promise<void> {
  const franquia = franquiaDoModulo(modulo, faixa);
  await comEscritorio(escritorioId, (db) =>
    db.moduloContratado.upsert({
      where: { escritorioId_modulo: { escritorioId, modulo } },
      create: semEscritorio({ modulo, ativo, franquia }),
      update: { ativo, franquia },
    }),
  );
}

/**
 * Reescreve as franquias depois que a faixa muda.
 *
 * Sem isto, um escritorio que cresceu continuaria com a franquia da faixa
 * antiga e pagaria excedente por um consumo que o novo plano ja cobre.
 */
export async function ajustarFranquias(
  escritorioId: string,
  faixa: Faixa,
): Promise<void> {
  await comEscritorio(escritorioId, async (db) => {
    const contratos = await db.moduloContratado.findMany();
    for (const contrato of contratos) {
      const franquia = franquiaDoModulo(contrato.modulo as Modulo, faixa);
      if (contrato.franquia !== franquia) {
        await db.moduloContratado.update({
          where: {
            escritorioId_modulo: { escritorioId, modulo: contrato.modulo },
          },
          data: { franquia },
        });
      }
    }
  });
}
