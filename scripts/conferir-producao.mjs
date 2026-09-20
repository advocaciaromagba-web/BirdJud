// Conferencia de producao: roda ANTES de o primeiro escritorio entrar.
//
//   npm run conferir-producao
//
// Cada item aqui e um jeito conhecido de o deploy parecer certo e estar
// errado. O sistema sobe, a tela abre, e o problema so aparece no dia do
// prazo — ou, pior, aparece como dado de um escritorio na tela de outro.
//
// Sai com codigo 1 se algo estiver errado, para poder travar um deploy.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const resultados = [];
const anotar = (nivel, item, detalhe) => resultados.push({ nivel, item, detalhe });
const ok = (item, detalhe) => anotar("ok", item, detalhe);
const alerta = (item, detalhe) => anotar("alerta", item, detalhe);
const erro = (item, detalhe) => anotar("erro", item, detalhe);

// ---------------------------------------------------------------------------
// 1. Variaveis de ambiente
// ---------------------------------------------------------------------------

const OBRIGATORIAS = [
  ["DATABASE_URL", "conexao da aplicacao"],
  ["DATABASE_URL_MIGRACAO", "conexao do dono das tabelas"],
  ["DATABASE_URL_PLATAFORMA", "conexao do plano de controle"],
  ["NEXTAUTH_SECRET", "assinatura da sessao"],
  ["NEXTAUTH_URL", "endereco publico"],
  ["SEGREDO_CHAVE", "cifra das credenciais de escritorio"],
  ["DOMINIO_PLATAFORMA", "dominio dos subdominios"],
];

for (const [nome, paraQue] of OBRIGATORIAS) {
  const valor = process.env[nome];
  if (!valor) erro(nome, `faltando — ${paraQue}`);
  else ok(nome, "definida");
}

if (process.env.SEGREDO_CHAVE) {
  const bytes = Buffer.from(process.env.SEGREDO_CHAVE, "base64").length;
  if (bytes !== 32) {
    erro("SEGREDO_CHAVE", `tem ${bytes} bytes depois do base64; precisa de 32`);
  }
}

if (process.env.NEXTAUTH_URL && !process.env.NEXTAUTH_URL.startsWith("https://")) {
  // Sem https o cookie de sessao sai sem a marca Secure.
  alerta("NEXTAUTH_URL", "nao e https: o cookie de sessao vai sem Secure");
}

// Os tres papeis precisam ser DIFERENTES: e a trava toda.
const urls = ["DATABASE_URL", "DATABASE_URL_MIGRACAO", "DATABASE_URL_PLATAFORMA"]
  .map((nome) => process.env[nome])
  .filter(Boolean);
const usuarios = urls.map((url) => {
  try {
    return new URL(url).username;
  } catch {
    return "";
  }
});
if (new Set(usuarios).size !== usuarios.length) {
  erro(
    "papeis do banco",
    `a aplicacao, o dono e o plano de controle usam o mesmo usuario (${usuarios.join(", ")}) — o RLS nao protege nada assim`
  );
} else if (usuarios.length === 3) {
  ok("papeis do banco", `tres usuarios distintos (${usuarios.join(", ")})`);
}

// ---------------------------------------------------------------------------
// 2. Banco: privilegios, RLS e migracoes
// ---------------------------------------------------------------------------

const TABELAS_COM_RLS = [
  "Usuario", "Cliente", "Processo", "Compromisso", "Lancamento", "Publicacao",
  "Aviso", "AnaliseIA", "Cobranca", "Arquivo", "NotaFiscal", "Fiscal",
  "Integracao", "ConsumoMensal", "ModuloContratado", "OabMonitorada",
  "Assinatura", "Fatura", "AceiteDeTermos", "AcessoSuporte",
];

async function conferirBanco() {
  if (!process.env.DATABASE_URL) return;

  const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await cliente.connect();
  } catch (falha) {
    erro("banco", `a aplicacao nao conecta: ${falha.message}`);
    return;
  }

  try {
    // O usuario da aplicacao NAO pode ser superusuario nem contornar RLS.
    const { rows: papel } = await cliente.query(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user"
    );
    if (papel[0]?.rolsuper) {
      erro("usuario da aplicacao", "e superusuario: o RLS e ignorado por completo");
    } else if (papel[0]?.rolbypassrls) {
      erro("usuario da aplicacao", "tem BYPASSRLS: atravessa o isolamento");
    } else {
      ok("usuario da aplicacao", "sem superusuario e sem BYPASSRLS");
    }

    // RLS ligado E forcado em toda tabela de escritorio.
    const { rows: tabelas } = await cliente.query(
      `SELECT c.relname AS tabela, c.relrowsecurity AS ligado, c.relforcerowsecurity AS forcado
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'`
    );
    const porNome = new Map(tabelas.map((t) => [t.tabela, t]));

    const semRls = [];
    const semForce = [];
    const ausentes = [];
    for (const tabela of TABELAS_COM_RLS) {
      const linha = porNome.get(tabela);
      if (!linha) ausentes.push(tabela);
      else if (!linha.ligado) semRls.push(tabela);
      else if (!linha.forcado) semForce.push(tabela);
    }

    if (ausentes.length > 0) {
      erro("migracoes", `tabela(s) que nao existem no banco: ${ausentes.join(", ")}`);
    }
    if (semRls.length > 0) {
      erro("RLS", `sem row level security: ${semRls.join(", ")} — rode npm run rls:aplicar`);
    }
    if (semForce.length > 0) {
      erro("RLS", `sem FORCE: ${semForce.join(", ")} — o dono das tabelas escapa da politica`);
    }
    if (ausentes.length === 0 && semRls.length === 0 && semForce.length === 0) {
      ok("RLS", `ligado e forcado nas ${TABELAS_COM_RLS.length} tabelas de escritorio`);
    }

    // A trava de verdade: sem contexto de escritorio, nao se le nada.
    const { rows: vazamento } = await cliente.query('SELECT count(*)::int AS total FROM "Cliente"');
    if (vazamento[0].total > 0) {
      erro(
        "isolamento",
        `sem contexto de escritorio, a aplicacao leu ${vazamento[0].total} cliente(s) — o RLS nao esta valendo`
      );
    } else {
      ok("isolamento", "sem contexto de escritorio, nenhuma linha e visivel");
    }

    // Migracoes pendentes.
    const { rows: pendentes } = await cliente
      .query(
        `SELECT migration_name FROM "_prisma_migrations"
          WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL`
      )
      .catch(() => ({ rows: [] }));
    if (pendentes.length > 0) {
      erro("migracoes", `nao terminaram: ${pendentes.map((p) => p.migration_name).join(", ")}`);
    } else {
      ok("migracoes", "todas aplicadas");
    }
  } finally {
    await cliente.end();
  }
}

// ---------------------------------------------------------------------------
// 3. Disco dos arquivos (modulo NUVEM)
// ---------------------------------------------------------------------------

async function conferirDisco() {
  const raiz = process.env.RAIZ_ARQUIVOS;
  if (!raiz) {
    alerta(
      "RAIZ_ARQUIVOS",
      "nao definida: os arquivos vao para ./dados/arquivos, que some no proximo deploy"
    );
    return;
  }

  try {
    const pasta = await mkdtemp(join(raiz, "conferencia-"));
    const arquivo = join(pasta, "teste.txt");
    await writeFile(arquivo, "conferencia de producao");
    await rm(pasta, { recursive: true, force: true });
    ok("RAIZ_ARQUIVOS", `${raiz} existe e aceita escrita`);
  } catch (falha) {
    erro("RAIZ_ARQUIVOS", `${raiz} nao aceita escrita: ${falha.message}`);
  }
}

// ---------------------------------------------------------------------------
// 4. Integracoes da plataforma que sao opcionais, mas mudam o que funciona
// ---------------------------------------------------------------------------

function conferirOpcionais() {
  const opcionais = [
    ["ANTHROPIC_API_KEY", "modulo de IA responde 503 sem ela"],
    ["DJEN_RELE_URL", "sem o rele, a captura do DJEN so funciona de dentro do Brasil"],
    ["ASAAS_WEBHOOK_TOKEN", "sem ele, a baixa das faturas da plataforma e manual"],
  ];
  for (const [nome, consequencia] of opcionais) {
    if (process.env[nome]) ok(nome, "definida");
    else alerta(nome, consequencia);
  }

  if (process.env.DJEN_RELE_URL && !process.env.DJEN_RELE_TOKEN) {
    erro("DJEN_RELE_TOKEN", "o rele esta configurado mas sem token: toda consulta volta 401");
  }
}

// ---------------------------------------------------------------------------

await conferirBanco();
await conferirDisco();
conferirOpcionais();

const simbolo = { ok: "  ok  ", alerta: "AVISO ", erro: " ERRO " };
for (const linha of resultados) {
  console.log(`[${simbolo[linha.nivel]}] ${linha.item}: ${linha.detalhe}`);
}

const erros = resultados.filter((r) => r.nivel === "erro").length;
const alertas = resultados.filter((r) => r.nivel === "alerta").length;

console.log(
  `\n${resultados.length - erros - alertas} conferido(s), ${alertas} aviso(s), ${erros} erro(s).`
);
if (erros > 0) {
  console.log("Nao suba escritorio nenhum antes de resolver os erros acima.");
  process.exit(1);
}
