// Troca a SEGREDO_CHAVE: recifra as credenciais de integracao de todos os
// escritorios com a chave nova.
//
//   SEGREDO_CHAVE_ANTIGA=<antiga> SEGREDO_CHAVE=<nova> npm run trocar-segredo-chave
//
// Quando: a chave vazou (variaveis de ambiente expostas) ou por rotina. O que
// a chave protege: Integracao.dados (SMTP, Asaas, Autentique, WhatsApp,
// Microsoft, Google e o certificado da NFS-e de cada escritorio). O link
// assinado da nota da plataforma tambem usa a chave: os links antigos deixam
// de abrir, e a nota se reenvia pelo console.
//
// Idempotente: registro que ja abre com a chave nova e deixado como esta;
// registro que nao abre com nenhuma das duas e listado e NAO tocado (e
// credencial que o escritorio tera de conectar de novo). Roda dentro do
// servidor, com DATABASE_URL_PLATAFORMA; as duas chaves vao por variavel de
// ambiente e se apagam depois.
import { PrismaClient } from "@prisma/client";
import { chaveDaVariavel, cifrarCom, decifrarCom } from "../src/lib/segredo";

export type ResultadoDaTroca = { recifradas: number; jaNaNova: number; ilegiveis: string[] };

/** A troca em si, separada do processo para ter teste. */
export async function recifrarIntegracoes(
  db: Pick<PrismaClient, "integracao" | "$transaction">,
  antiga: Buffer,
  nova: Buffer,
): Promise<ResultadoDaTroca> {
  const r: ResultadoDaTroca = { recifradas: 0, jaNaNova: 0, ilegiveis: [] };
  const todas = await db.integracao.findMany({ select: { id: true, escritorioId: true, tipo: true, dados: true } });
  for (const i of todas) {
    let aberto: unknown;
    try {
      decifrarCom(i.dados, nova);
      r.jaNaNova += 1;
      continue;
    } catch {
      // Nao esta na nova: tenta a antiga.
    }
    try {
      aberto = decifrarCom(i.dados, antiga);
    } catch {
      r.ilegiveis.push(`${i.escritorioId}/${i.tipo}`);
      continue;
    }
    await db.integracao.update({ where: { id: i.id }, data: { dados: cifrarCom(aberto, nova) } });
    r.recifradas += 1;
  }
  return r;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_PLATAFORMA;
  if (!url) {
    console.error("DATABASE_URL_PLATAFORMA nao definida.");
    process.exit(1);
  }
  const antiga = chaveDaVariavel("SEGREDO_CHAVE_ANTIGA");
  const nova = chaveDaVariavel("SEGREDO_CHAVE");
  if (antiga.equals(nova)) {
    console.error("A chave nova e igual a antiga: nada a trocar.");
    process.exit(1);
  }
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const r = await recifrarIntegracoes(db, antiga, nova);
    console.log(`recifradas: ${r.recifradas}; ja na chave nova: ${r.jaNaNova}; ilegiveis: ${r.ilegiveis.length}`);
    for (const x of r.ilegiveis) console.log(`  ilegivel (reconectar no escritorio): ${x}`);
    console.log("Agora apague SEGREDO_CHAVE_ANTIGA do ambiente.");
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1]?.endsWith("trocar-segredo-chave.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
