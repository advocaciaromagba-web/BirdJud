// Aplica prisma/rls.sql com o usuario dono do banco (DATABASE_URL_MIGRACAO).
//
// Usa o driver pg em vez de chamar psql: a imagem do Railway nao traz o
// cliente de linha de comando do PostgreSQL. E idempotente — pode rodar a
// cada deploy, depois das migracoes.
import { readFileSync } from "node:fs";
import pg from "pg";
import { tentar } from "./lib/tentar.mjs";

const url = process.env.DATABASE_URL_MIGRACAO;
if (!url) {
  console.error("DATABASE_URL_MIGRACAO nao definida. Ver .env.example.");
  process.exit(1);
}

const sql = readFileSync(new URL("../prisma/rls.sql", import.meta.url), "utf8");

// Repete pelo mesmo motivo da migracao: roda no start, e banco indisponivel
// por alguns segundos nao pode custar o site.
async function aplicar() {
  const cliente = new pg.Client({ connectionString: url });
  try {
    await cliente.connect();
    await cliente.query(sql);
  } finally {
    await cliente.end().catch(() => {});
  }
}

try {
  await tentar(aplicar, { rotulo: "RLS" });
  console.log("RLS aplicado.");
} catch (erro) {
  console.error("Falha ao aplicar o RLS:", erro.message);
  process.exitCode = 1;
}
