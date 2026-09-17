// Aplica prisma/rls.sql usando o usuario dono do banco (DATABASE_URL_MIGRACAO).
// Uso: npm run rls:aplicar
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const url = process.env.DATABASE_URL_MIGRACAO;
if (!url) {
  console.error("DATABASE_URL_MIGRACAO nao definida. Ver .env.example.");
  process.exit(1);
}

const sql = readFileSync(new URL("../prisma/rls.sql", import.meta.url), "utf8");
execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-f", "-"], {
  input: sql,
  stdio: ["pipe", "inherit", "inherit"],
});
console.log("RLS aplicado.");
