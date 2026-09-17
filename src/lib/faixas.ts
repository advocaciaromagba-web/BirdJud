// Faixa de advogados contratada pelo escritorio.
//
// O que a faixa limita e a quantidade de pessoas. O que ela cobra a mais
// (franquias maiores por modulo) e assunto do consumo — ver consumo.ts.
import { comEscritorio } from "./prisma";

export const FAIXAS = ["ATE_3", "ATE_10", "ATE_25", "ATE_50"] as const;
export type Faixa = (typeof FAIXAS)[number];

export const LIMITES: Record<Faixa, { advogados: number; apoio: number; rotulo: string }> = {
  ATE_3: { advogados: 3, apoio: 3, rotulo: "Essencial" },
  ATE_10: { advogados: 10, apoio: 10, rotulo: "Escritorio" },
  ATE_25: { advogados: 25, apoio: 25, rotulo: "Profissional" },
  ATE_50: { advogados: 50, apoio: 50, rotulo: "Completo" },
};

export function ehFaixa(valor: string): valor is Faixa {
  return (FAIXAS as readonly string[]).includes(valor);
}

export class FaixaEsgotada extends Error {
  readonly status = 409;
  constructor(quem: "advogados" | "apoio", limite: number, rotulo: string) {
    super(
      `A faixa ${rotulo} permite ate ${limite} ${
        quem === "advogados" ? "advogados" : "usuarios de apoio"
      }. Para cadastrar mais, e preciso mudar de faixa.`
    );
    this.name = "FaixaEsgotada";
  }
}

export type UsoDaFaixa = {
  faixa: Faixa;
  rotulo: string;
  advogados: { usados: number; limite: number };
  apoio: { usados: number; limite: number };
};

/**
 * A faixa sai da propria tabela Escritorio, lida dentro de comEscritorio().
 *
 * Nao vai para a view EscritorioPublico de proposito: aquela view atravessa o
 * RLS para a tela de login achar a marca, e faixa e dado de plano — exporia o
 * plano de todos os escritorios a qualquer requisicao. Aqui o RLS deixa o
 * escritorio ler so a propria linha.
 */
async function faixaDoEscritorio(escritorioId: string): Promise<Faixa> {
  const escritorio = await comEscritorio(escritorioId, (db) =>
    db.escritorio.findFirst({ select: { faixa: true } })
  );
  const faixa = escritorio?.faixa ?? "ATE_3";
  return ehFaixa(faixa) ? faixa : "ATE_3";
}

/** Quantos lugares a faixa da e quantos ja estao ocupados. */
export async function usoDaFaixa(escritorioId: string): Promise<UsoDaFaixa> {
  const faixa = await faixaDoEscritorio(escritorioId);
  const limites = LIMITES[faixa];

  const { advogados, apoio } = await comEscritorio(escritorioId, async (db) => ({
    // So usuario ativo ocupa lugar: desativar libera a vaga.
    advogados: await db.usuario.count({ where: { ativo: true, advogado: true } }),
    apoio: await db.usuario.count({ where: { ativo: true, advogado: false } }),
  }));

  return {
    faixa,
    rotulo: limites.rotulo,
    advogados: { usados: advogados, limite: limites.advogados },
    apoio: { usados: apoio, limite: limites.apoio },
  };
}

/** Lanca FaixaEsgotada quando nao ha vaga para mais um usuario do tipo. */
export async function exigirVagaNaFaixa(escritorioId: string, advogado: boolean): Promise<void> {
  const uso = await usoDaFaixa(escritorioId);
  const alvo = advogado ? uso.advogados : uso.apoio;
  if (alvo.usados >= alvo.limite) {
    throw new FaixaEsgotada(advogado ? "advogados" : "apoio", alvo.limite, uso.rotulo);
  }
}
