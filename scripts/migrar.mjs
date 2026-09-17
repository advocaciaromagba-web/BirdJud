// Roda "prisma migrate deploy" com o usuario DONO do banco.
//
// A aplicacao conecta com birdjud_app, que nao tem DDL de proposito; por isso
// a migracao usa DATABASE_URL_MIGRACAO no lugar de DATABASE_URL.
import { execFileSync } from "node:child_process";

const url = process.env.DATABASE_URL_MIGRACAO;
if (!url) {
  console.error("DATABASE_URL_MIGRACAO nao definida. Ver .env.example.");
  process.exit(1);
}

execFileSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});
