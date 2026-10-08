// Conferencia de producao: roda ANTES de o primeiro escritorio entrar.
//
//   npm run conferir-producao
//
// Cada item aqui e um jeito conhecido de o deploy parecer certo e estar
// errado. O sistema sobe, a tela abre, e o problema so aparece no dia do
// prazo — ou, pior, aparece como dado de um escritorio na tela de outro.
//
// Sai com codigo 1 se algo estiver errado, para poder travar um deploy.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { tentar } from "./lib/tentar.mjs";

const resultados = [];
const anotar = (nivel, item, detalhe) =>
  resultados.push({ nivel, item, detalhe });
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

if (
  process.env.NEXTAUTH_URL &&
  !process.env.NEXTAUTH_URL.startsWith("https://")
) {
  // Sem https o cookie de sessao sai sem a marca Secure.
  alerta("NEXTAUTH_URL", "nao e https: o cookie de sessao vai sem Secure");
}

// Os tres papeis precisam ser DIFERENTES: e a trava toda.
const urls = [
  "DATABASE_URL",
  "DATABASE_URL_MIGRACAO",
  "DATABASE_URL_PLATAFORMA",
]
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
    `a aplicacao, o dono e o plano de controle usam o mesmo usuario (${usuarios.join(", ")}) — o RLS nao protege nada assim`,
  );
} else if (usuarios.length === 3) {
  ok("papeis do banco", `tres usuarios distintos (${usuarios.join(", ")})`);
}

// ---------------------------------------------------------------------------
// 2. Banco: privilegios, RLS e migracoes
// ---------------------------------------------------------------------------

const TABELAS_COM_RLS = [
  "Usuario",
  "Cliente",
  "Processo",
  "Compromisso",
  "Lancamento",
  "DespesaFixa",
  "Publicacao",
  "Aviso",
  "AnaliseIA",
  "Cobranca",
  "Arquivo",
  "NotaFiscal",
  "Fiscal",
  "Integracao",
  "ConsumoMensal",
  "ModuloContratado",
  "OabMonitorada",
  "Assinatura",
  "Fatura",
  "AceiteDeTermos",
  "AcessoSuporte",
  "RedefinicaoDeSenha",
  "Prazo",
  "DiaSemExpediente",
  "ItemDeChecklist",
  "Representante",
  "EntradaDeExtrato",
  "ContratoDeHonorarios",
  "ModeloDeDocumento",
  "Meta",
  "ParticipanteDeCompromisso",
  "EnvioParaAssinatura",
  "BloqueioDeWhatsapp",
  "RespostaDeWhatsapp",
  "TriagemDePublicacao",
  "Entrevista",
  "Tarefa",
  "CompromissoExcluido",
  "PermissaoDeArea",
];

async function conferirBanco() {
  if (!process.env.DATABASE_URL) return;

  // Repete antes de desistir: esta conferencia roda no start, e "nao conecta"
  // e erro — ou seja, derruba o deploy. Um banco que ainda esta subindo nao
  // pode custar o site.
  let cliente;
  try {
    cliente = await tentar(
      async () => {
        const tentativa = new pg.Client({
          connectionString: process.env.DATABASE_URL,
          connectionTimeoutMillis: 5_000,
        });
        try {
          await tentativa.connect();
        } catch (falha) {
          await tentativa.end().catch(() => {});
          throw falha;
        }
        return tentativa;
      },
      { rotulo: "conferencia: conexao da aplicacao" },
    );
  } catch (falha) {
    erro("banco", `a aplicacao nao conecta: ${falha.message}`);
    return;
  }

  try {
    // O usuario da aplicacao NAO pode ser superusuario nem contornar RLS.
    const { rows: papel } = await cliente.query(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
    );
    if (papel[0]?.rolsuper) {
      erro(
        "usuario da aplicacao",
        "e superusuario: o RLS e ignorado por completo",
      );
    } else if (papel[0]?.rolbypassrls) {
      erro("usuario da aplicacao", "tem BYPASSRLS: atravessa o isolamento");
    } else {
      ok("usuario da aplicacao", "sem superusuario e sem BYPASSRLS");
    }

    // RLS ligado E forcado em toda tabela de escritorio.
    const { rows: tabelas } = await cliente.query(
      `SELECT c.relname AS tabela, c.relrowsecurity AS ligado, c.relforcerowsecurity AS forcado
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'`,
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
      erro(
        "migracoes",
        `tabela(s) que nao existem no banco: ${ausentes.join(", ")}`,
      );
    }
    if (semRls.length > 0) {
      erro(
        "RLS",
        `sem row level security: ${semRls.join(", ")} — rode npm run rls:aplicar`,
      );
    }
    if (semForce.length > 0) {
      erro(
        "RLS",
        `sem FORCE: ${semForce.join(", ")} — o dono das tabelas escapa da politica`,
      );
    }
    if (ausentes.length === 0 && semRls.length === 0 && semForce.length === 0) {
      ok(
        "RLS",
        `ligado e forcado nas ${TABELAS_COM_RLS.length} tabelas de escritorio`,
      );
    }

    // A trava de verdade: sem contexto de escritorio, nao se le nada.
    const { rows: vazamento } = await cliente.query(
      'SELECT count(*)::int AS total FROM "Cliente"',
    );
    if (vazamento[0].total > 0) {
      erro(
        "isolamento",
        `sem contexto de escritorio, a aplicacao leu ${vazamento[0].total} cliente(s) — o RLS nao esta valendo`,
      );
    } else {
      ok("isolamento", "sem contexto de escritorio, nenhuma linha e visivel");
    }

    // Migracoes pendentes.
    const { rows: pendentes } = await cliente
      .query(
        `SELECT migration_name FROM "_prisma_migrations"
          WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL`,
      )
      .catch(() => ({ rows: [] }));
    if (pendentes.length > 0) {
      erro(
        "migracoes",
        `nao terminaram: ${pendentes.map((p) => p.migration_name).join(", ")}`,
      );
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
      "nao definida: os arquivos vao para ./dados/arquivos, que some no proximo deploy",
    );
    return;
  }

  try {
    // A aplicacao tambem cria a pasta quando precisa: aqui o teste imita o
    // caminho real, em vez de exigir que ela ja exista.
    await mkdir(raiz, { recursive: true });
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
    [
      "OPENAI_API_KEY",
      "sem ela nao da para transcrever audio gravado — a transcricao ao vivo, que roda no computador do escritorio, continua funcionando",
    ],
    [
      "DJEN_RELE_URL",
      "sem o rele, a captura do DJEN so funciona de dentro do Brasil",
    ],
    [
      "ASAAS_WEBHOOK_TOKEN",
      "sem ele, a baixa das faturas da plataforma e manual",
    ],
    [
      "WHATSAPP_NUMERO_ID",
      "sem ele, nenhum aviso sai por WhatsApp — o numero e da plataforma, nao do escritorio",
    ],
    [
      "WHATSAPP_TOKEN",
      "sem ele, nenhum aviso sai por WhatsApp",
    ],
    [
      "WHATSAPP_APP_SECRET",
      "sem ele, o webhook do WhatsApp responde 503 e a resposta do cliente ao lembrete se perde",
    ],
    [
      "WHATSAPP_VERIFICACAO",
      "sem ele, a Meta nao consegue ligar o webhook do WhatsApp",
    ],
  ];
  for (const [nome, consequencia] of opcionais) {
    if (process.env[nome]) ok(nome, "definida");
    else alerta(nome, consequencia);
  }

  // Um sem o outro e o pior dos mundos: a Meta liga o webhook e as mensagens
  // chegam, mas todas batem em 503 — e o cliente que respondeu "1" nunca
  // aparece como confirmado.
  //
  // AVISO, e nao erro, de proposito. Esta conferencia roda no start do
  // container: um erro aqui impede a aplicacao inteira de subir. Isolamento
  // furado merece isso; WhatsApp pela metade, nao. O webhook ja se protege
  // sozinho (sem segredo ele responde 503 e nao processa nada), e a Meta
  // reentrega por horas, entao nada se perde enquanto falta a outra metade.
  // Derrubar o site por isso ja aconteceu uma vez, durante a configuracao na
  // Meta, quando so uma das duas variaveis tinha chegado.
  const temUm = Boolean(process.env.WHATSAPP_APP_SECRET);
  const temOutro = Boolean(process.env.WHATSAPP_VERIFICACAO);
  if (temUm !== temOutro) {
    alerta(
      "WhatsApp de entrada",
      "so uma das duas variaveis esta definida: o webhook nao processa mensagem ate a outra chegar",
    );
  }

  // Mesma logica na saida: numero sem token, ou token sem numero, e
  // configuracao pela metade que so se descobre no dia do aviso. Tambem
  // aviso, e pelo mesmo motivo: sem credencial o envio apenas nao acontece.
  const temNumero = Boolean(process.env.WHATSAPP_NUMERO_ID);
  const temToken = Boolean(process.env.WHATSAPP_TOKEN);
  if (temNumero !== temToken) {
    alerta(
      "WhatsApp de saida",
      "so uma das duas variaveis esta definida: nenhum aviso sai ate a outra chegar",
    );
  }

  // A guarda do site: quatro variaveis que so servem juntas. Elas vivem no
  // TRABALHADOR, nao aqui — esta conferencia roda na aplicacao, que nao
  // precisa delas. Confere mesmo assim porque conjunto pela metade e sempre
  // sinal de configuracao interrompida no meio.
  const daGuarda = [
    "RAILWAY_TOKEN_GUARDA",
    "RAILWAY_PROJETO_ID",
    "RAILWAY_AMBIENTE_ID",
    "RAILWAY_SERVICO_APP_ID",
  ].filter((nome) => process.env[nome]);
  if (daGuarda.length > 0 && daGuarda.length < 4) {
    alerta(
      "guarda do site",
      `so ${daGuarda.length} das 4 variaveis estao definidas: a volta automatica nao liga`,
    );
  }

  // Aviso pelo mesmo motivo das duas conferencias acima: integracao pela
  // metade degrada um recurso, nao fura o isolamento, e nao justifica
  // impedir a aplicacao de subir.
  if (process.env.DJEN_RELE_URL && !process.env.DJEN_RELE_TOKEN) {
    alerta(
      "DJEN_RELE_TOKEN",
      "o rele esta configurado mas sem token: toda consulta volta 401",
    );
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
  `\n${resultados.length - erros - alertas} conferido(s), ${alertas} aviso(s), ${erros} erro(s).`,
);
if (erros > 0) {
  console.log("Nao suba escritorio nenhum antes de resolver os erros acima.");
  process.exit(1);
}
