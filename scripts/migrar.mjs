// Roda "prisma migrate deploy" com o usuario DONO do banco.
//
// A aplicacao conecta com birdjud_app, que nao tem DDL de proposito; por isso
// a migracao usa DATABASE_URL_MIGRACAO no lugar de DATABASE_URL.
import { execFileSync } from "node:child_process";
import { tentar } from "./lib/tentar.mjs";

const url = process.env.DATABASE_URL_MIGRACAO;
if (!url) {
  console.error("DATABASE_URL_MIGRACAO nao definida. Ver .env.example.");
  process.exit(1);
}

// Repete: este comando roda no start do container, e uma recusa passageira
// do banco aqui impede o servidor de subir. Migracao quebrada de verdade
// falha nas seis tentativas, que e o desejado.
await tentar(
  () =>
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: url },
    }),
  { rotulo: "migracao" },
);
