// Espera o banco aceitar conexao antes de qualquer outra coisa no start.
//
//   npm run esperar-banco
//
// E a primeira coisa do comando de partida. Sem ela, o container que sobe
// junto com um Postgres ainda inicializando falha na migracao, nao liga o
// servidor, reprova no healthcheck e derruba o site — por um problema que
// teria passado sozinho em cinco segundos.
//
// Confere as DUAS credenciais, porque sao usuarios diferentes do mesmo
// banco: a do dono (migracao e RLS) e a da aplicacao. Senha errada em uma
// delas tambem aparece aqui, no start, e nao na primeira tela que o
// escritorio abrir.
import pg from "pg";
import { tentar } from "./lib/tentar.mjs";

const CREDENCIAIS = [
  ["DATABASE_URL_MIGRACAO", "dono do banco"],
  ["DATABASE_URL", "aplicacao"],
];

async function bate(url) {
  const cliente = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5_000 });
  try {
    await cliente.connect();
    await cliente.query("select 1");
  } finally {
    await cliente.end().catch(() => {});
  }
}

let faltou = false;
for (const [nome, quem] of CREDENCIAIS) {
  const url = process.env[nome];
  if (!url) {
    console.error(`${nome} nao definida. Ver .env.example.`);
    faltou = true;
    continue;
  }
  await tentar(() => bate(url), { rotulo: `banco (${quem})` });
  console.log(`banco (${quem}): responde.`);
}
if (faltou) process.exit(1);
