// O disco e o banco estao enchendo? (18/10/2026)
//
// Ninguem avisava. O volume dos arquivos e o do banco tem 5 GB cada no
// Railway; cheio, o anexo novo falha e o banco para de gravar — o escritorio
// descobre na hora de juntar uma peca. Esta conferencia avisa com folga, ao
// passar de 70%, e e o que o vigia externo consulta.
//
// Arquivos: statfs da pasta dos arquivos, quando o que ele mede e o proprio
// volume (total perto do limite). Se o total for muito maior — o sistema de
// arquivos do host, sem cota por volume —, a soma dos arquivos registrados.
// Banco: pg_database_size do banco em uso.
import { statfs } from "node:fs/promises";
import { raiz } from "./armazenamento";
import { prismaPlataforma } from "./prisma";

export const LIMIAR_DO_AVISO = 0.7;
const MB = 1024 * 1024;
const VOLUME_PADRAO_MB = 5000;

export type Medida = { usadoBytes: number; limiteBytes: number };

export type SaudeDoEspaco = {
  ok: boolean;
  /** So o que passou do limiar, em %. Vazio quando esta tudo bem. */
  acima: { arquivos?: number; banco?: number };
};

const limiteEmBytes = (variavel: string | undefined) => {
  const mb = Number(variavel);
  return (Number.isFinite(mb) && mb > 0 ? mb : VOLUME_PADRAO_MB) * MB;
};

export const percentual = (m: Medida) =>
  m.limiteBytes > 0 ? Math.round((m.usadoBytes / m.limiteBytes) * 100) : 0;

export function avaliarEspaco(
  medidas: { arquivos: Medida | null; banco: Medida | null },
  limiar = LIMIAR_DO_AVISO,
): SaudeDoEspaco {
  const acima: SaudeDoEspaco["acima"] = {};
  for (const nome of ["arquivos", "banco"] as const) {
    const m = medidas[nome];
    if (m && m.usadoBytes / m.limiteBytes > limiar) acima[nome] = percentual(m);
  }
  return { ok: Object.keys(acima).length === 0, acima };
}

/** O que statfs diz, se ele estiver medindo o volume e nao o host inteiro. */
export function medidaDoVolume(
  s: { blocks: number; bfree: number; bsize: number },
  limiteBytes: number,
): Medida | null {
  const total = s.blocks * s.bsize;
  if (!total || total > limiteBytes * 1.2) return null;
  return { usadoBytes: (s.blocks - s.bfree) * s.bsize, limiteBytes: total };
}

export async function medirArquivos(ambiente = process.env): Promise<Medida> {
  const limiteBytes = limiteEmBytes(ambiente.LIMITE_DO_VOLUME_DE_ARQUIVOS_MB);
  const volume = await statfs(raiz())
    .then((s) => medidaDoVolume(s, limiteBytes))
    .catch(() => null);
  if (volume) return volume;
  const soma = await prismaPlataforma().arquivo.aggregate({ _sum: { tamanhoBytes: true } });
  return { usadoBytes: soma._sum.tamanhoBytes ?? 0, limiteBytes };
}

export async function medirBanco(ambiente = process.env): Promise<Medida> {
  const [linha] = await prismaPlataforma().$queryRaw<{ bytes: bigint }[]>`
    SELECT pg_database_size(current_database()) AS bytes`;
  return { usadoBytes: Number(linha.bytes), limiteBytes: limiteEmBytes(ambiente.LIMITE_DO_VOLUME_DO_BANCO_MB) };
}

export async function saudeDoEspaco(): Promise<SaudeDoEspaco> {
  const [arquivos, banco] = await Promise.all([
    medirArquivos().catch(() => null),
    medirBanco().catch(() => null),
  ]);
  if (!arquivos && !banco) throw new Error("Nenhuma medida de espaco respondeu.");
  return avaliarEspaco({ arquivos, banco });
}
