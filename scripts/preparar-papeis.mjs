// Cria os tres papeis de banco, de dentro do ambiente.
//
//   npm run preparar-papeis
//
// POR QUE EXISTE: em producao os papeis foram criados a mao, uma vez, pela
// aba Query do Railway. Para um ambiente de ENSAIO isso nao serve — ele
// precisa nascer sozinho, e a alternativa (abrir uma porta publica no banco
// para rodar o SQL de fora) e exatamente o atalho que nao se toma, nem em
// ensaio.
//
// Idempotente: pode rodar a cada partida. Nao faz nada se os papeis ja
// existem, e so ajusta a senha.
//
// NUNCA em producao. O script exige PREPARAR_PAPEIS=1 e uma conexao de
// superusuario que a aplicacao de producao nao tem — e se tivesse, o
// conferir-producao reprovaria, porque la os tres papeis ja sao distintos e
// nenhum deles e superusuario.
import pg from "pg";
import { tentar } from "./lib/tentar.mjs";

if (process.env.PREPARAR_PAPEIS !== "1") {
  console.log("preparar-papeis: desligado (PREPARAR_PAPEIS != 1).");
  process.exit(0);
}

const url = process.env.DATABASE_URL_SUPER;
const senhas = {
  birdjud_owner: process.env.SENHA_OWNER,
  birdjud_app: process.env.SENHA_APP,
  birdjud_plataforma: process.env.SENHA_PLATAFORMA,
};

const faltando = [
  ...(url ? [] : ["DATABASE_URL_SUPER"]),
  ...Object.entries(senhas)
    .filter(([, v]) => !v)
    .map(([k]) => `senha de ${k}`),
];
if (faltando.length > 0) {
  console.error(`preparar-papeis: faltam ${faltando.join(", ")}.`);
  process.exit(1);
}

// Atributos de cada papel. Identicos aos de producao (docs/RAILWAY.md, 2):
// so o da plataforma atravessa o RLS.
const PAPEIS = [
  ["birdjud_owner", "NOSUPERUSER NOBYPASSRLS"],
  ["birdjud_app", "NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE"],
  ["birdjud_plataforma", "NOSUPERUSER BYPASSRLS"],
];

/**
 * Monta o comando no servidor, com format().
 *
 * DDL nao aceita bind de parametro, e um bloco "do $$" nao recebe $1. Entao
 * o SQL e construido por uma consulta que USA bind — %I escapa identificador
 * e %L escapa literal, ambos pelo proprio Postgres — e so depois executado.
 * Concatenar senha em string aqui seria injecao esperando acontecer.
 */
async function montar(cliente, molde, ...valores) {
  // O molde vai como LITERAL de SQL — aspas simples, com as internas
  // dobradas. Aspas duplas fariam o Postgres ler o molde como nome de
  // coluna, que e o erro que isto ja cometeu uma vez.
  const literal = `'${molde.replace(/'/g, "''")}'`;
  const { rows } = await cliente.query(
    `select format(${literal}, ${valores.map((_, i) => `$${i + 1}::text`).join(", ")}) as sql`,
    valores,
  );
  return rows[0].sql;
}

async function preparar() {
  const cliente = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5_000 });
  await cliente.connect();
  try {
    for (const [papel, atributos] of PAPEIS) {
      const { rowCount } = await cliente.query(
        "select 1 from pg_roles where rolname = $1",
        [papel],
      );
      const verbo = rowCount ? "alter" : "create";
      await cliente.query(
        await montar(
          cliente,
          `${verbo} role %I login password %L ${atributos}`,
          papel,
          senhas[papel],
        ),
      );
      console.log(`papel ${papel}: ${rowCount ? "ajustado" : "criado"}.`);
    }

    await cliente.query("grant birdjud_plataforma to birdjud_owner");

    const { rows } = await cliente.query("select current_database() as banco");
    await cliente.query(
      await montar(cliente, "alter database %I owner to birdjud_owner", rows[0].banco),
    );
    await cliente.query("alter schema public owner to birdjud_owner");
    console.log(`banco ${rows[0].banco} e schema public agora sao de birdjud_owner.`);
  } finally {
    await cliente.end().catch(() => {});
  }
}

await tentar(preparar, { rotulo: "preparar-papeis" });
