// Backup do banco inteiro, com retencao e conferencia.
//
//   npm run backup:banco
//
// Roda todo dia no servico cron-backup do Railway, que tem volume proprio —
// de proposito separado do volume da aplicacao e do volume do Postgres. Um
// backup guardado no mesmo disco do banco nao protege contra perder o disco.
//
// E, desde 29/09/2026, tambem copia para FORA do Railway, em armazenamento
// compativel com S3 (Cloudflare R2 ou Backblaze B2), cifrada. Isso importa
// porque o plano do Railway nao faz backup nenhum do volume: sem copia
// externa, um incidente la levaria o banco e o backup juntos, e o ensaio de
// restauracao nao serviria de nada sem de onde restaurar.
//
// A copia externa e opcional na configuracao e OBRIGATORIA no resultado: se
// as variaveis estiverem postas e o envio falhar, o script falha. Backup que
// "quase" foi para fora e o mesmo que nao ter ido, com a diferenca de que
// alguem acha que tem.
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { createGunzip, createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import {
  chaveDoBackup,
  cifrarBackup,
  destinoDoAmbiente,
  enviarObjeto,
} from "../src/lib/copia-remota.ts";

const DESTINO = process.env.RAIZ_BACKUP ?? "/backups";
const DIAS = Number(process.env.BACKUP_DIAS ?? 14);
/*
 * Piso de tamanho so para pegar arquivo vazio ou truncado.
 *
 * Nao serve para dizer "este backup parece completo": um banco com um
 * escritorio de teste cabe em 9 KB comprimido, e a primeira execucao em
 * producao foi recusada por isso — alarme falso, e alarme falso em backup e
 * pior que silencio, porque ensina a ignorar. Quem julga se o dump presta e a
 * conferencia de conteudo mais abaixo: marca de fim, numero de tabelas e
 * existencia de linha de dado.
 */
const MINIMO_BYTES = Number(process.env.BACKUP_MINIMO_BYTES ?? 1_000);

function agora() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
}

function falhar(mensagem) {
  console.error(`backup: ${mensagem}`);
  process.exit(1);
}

/*
 * O dump roda pelo papel da PLATAFORMA, e isto nao e detalhe.
 *
 * As tabelas de escritorio tem RLS com FORCE — que vale inclusive para o
 * dono. Com o papel de migracao, o pg_dump para na primeira tabela:
 *
 *   ERROR: query would be affected by row-level security policy
 *
 * E se alguem "resolvesse" isso passando --rows-per-insert ou ignorando o
 * erro, o backup sairia com o esquema e SEM OS DADOS: um arquivo que parece
 * backup, tem tamanho, e esta vazio por dentro. birdjud_plataforma tem
 * BYPASSRLS justamente para as tarefas do plano de controle, e esta e uma.
 */
const url = process.env.DATABASE_URL_PLATAFORMA;
if (!url)
  falhar(
    "sem DATABASE_URL_PLATAFORMA — o dump precisa do papel que atravessa o RLS",
  );

await mkdir(DESTINO, { recursive: true });
const arquivo = `${DESTINO}/birdjud-${agora()}.sql.gz`;

// --clean --if-exists: o dump se aplica sobre um banco existente sem pedir
// que alguem apague tudo antes, que e o momento em que restauracao da errado.
const dump = spawn(
  "pg_dump",
  [
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--format=plain",
    url,
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);

let erroDoDump = "";
dump.stderr.on("data", (parte) => (erroDoDump += parte));

// A promessa do fim precisa nascer AGORA, antes do pipeline: o pg_dump pode
// terminar antes de a gente pedir para escutar, e a espera nunca resolveria.
const fimDoDump = new Promise((pronto) => dump.on("close", pronto));

try {
  await pipeline(
    dump.stdout,
    createGzip({ level: 9 }),
    createWriteStream(arquivo),
  );
} catch (erro) {
  falhar(`falha ao escrever ${arquivo}: ${erro.message}`);
}

const saida = await fimDoDump;
if (saida !== 0) falhar(`pg_dump saiu com ${saida}: ${erroDoDump.trim()}`);

const tamanho = (await stat(arquivo)).size;
if (tamanho < MINIMO_BYTES) {
  await unlink(arquivo).catch(() => {});
  falhar(`dump de ${tamanho} bytes e pequeno demais para ser um banco inteiro`);
}

/*
 * Conferencia do conteudo, nao so do tamanho.
 *
 * O acidente que este bloco evita e o pior de todos: o dump sai, tem
 * tamanho, tem o esquema inteiro — e nenhuma linha de dado, porque o RLS
 * filtrou tudo. Um backup desses so mostra o que e no dia da restauracao.
 */
async function conferirConteudo(caminho) {
  const leitor = createInterface({
    input: createReadStream(caminho).pipe(createGunzip()),
    crlfDelay: Infinity,
  });

  let tabelas = 0;
  let copias = 0;
  let linhasDeDados = 0;
  let dentroDeCopia = false;
  let completo = false;

  for await (const linha of leitor) {
    if (linha.startsWith("CREATE TABLE ")) tabelas += 1;
    else if (linha.startsWith("COPY public.")) {
      copias += 1;
      dentroDeCopia = true;
    } else if (dentroDeCopia) {
      if (linha === "\\.") dentroDeCopia = false;
      else linhasDeDados += 1;
    }
    if (linha.includes("PostgreSQL database dump complete")) completo = true;
  }

  return { tabelas, copias, linhasDeDados, completo };
}

const conteudo = await conferirConteudo(arquivo);
if (!conteudo.completo) {
  await unlink(arquivo).catch(() => {});
  falhar("o dump nao terminou: falta a marca de fim do pg_dump");
}
if (conteudo.tabelas < 20) {
  await unlink(arquivo).catch(() => {});
  falhar(`so ${conteudo.tabelas} tabela(s) no dump; o esquema tem mais de 20`);
}
if (conteudo.linhasDeDados === 0) {
  await unlink(arquivo).catch(() => {});
  falhar(
    "o dump tem esquema e nenhuma linha de dado — sinal classico de RLS filtrando o backup",
  );
}

console.log(
  `backup: ${arquivo} (${(tamanho / 1024 / 1024).toFixed(1)} MB, ` +
    `${conteudo.tabelas} tabelas, ${conteudo.linhasDeDados} linhas)`,
);

// Retencao: apaga o que passou do prazo, e nunca deixa a pasta sem nada.
const limite = Date.now() - DIAS * 24 * 60 * 60 * 1000;
const nomes = (await readdir(DESTINO)).filter(
  (nome) => nome.startsWith("birdjud-") && nome.endsWith(".sql.gz"),
);

let apagados = 0;
for (const nome of nomes.sort()) {
  // O mais novo nunca sai, mesmo que o relogio do container esteja errado.
  if (nome === nomes.sort().at(-1)) continue;
  const caminho = `${DESTINO}/${nome}`;
  const info = await stat(caminho);
  if (info.mtimeMs < limite) {
    await unlink(caminho);
    apagados += 1;
  }
}

console.log(
  `backup: ${nomes.length - apagados} arquivo(s) guardado(s), ${apagados} apagado(s) por idade (retencao de ${DIAS} dias)`,
);


// ---------------------------------------------------------------------------
// Copia para fora do Railway
// ---------------------------------------------------------------------------

let destino;
try {
  destino = destinoDoAmbiente();
} catch (erro) {
  falhar(erro.message);
}

if (!destino) {
  console.warn(
    "backup: SEM COPIA EXTERNA. O arquivo esta apenas no volume do Railway, " +
      "que nao tem backup automatico no plano atual. Configure BACKUP_S3_*.",
  );
} else {
  const chave = chaveDoBackup();
  if (!chave && process.env.BACKUP_SEM_CIFRA !== "1") {
    // Falha fechada: o dump leva nome, CPF e processo de cliente. Mandar isso
    // em claro para um balde de terceiro precisa ser decisao consciente, e
    // nao o que acontece quando alguem esquece uma variavel.
    falhar(
      "BACKUP_CHAVE ausente. O dump tem dado de cliente e nao vai em claro " +
        "para fora. Gere com `openssl rand -base64 32`, guarde FORA do Railway, " +
        "e ponha em BACKUP_CHAVE. (Para enviar sem cifra, de proposito: BACKUP_SEM_CIFRA=1.)",
    );
  }

  const nomeLocal = arquivo.split("/").at(-1);
  const bruto = await readFile(arquivo);
  const corpo = chave ? cifrarBackup(bruto, chave) : bruto;
  const nomeRemoto = `banco/${nomeLocal}${chave ? ".cifrado" : ""}`;

  try {
    const enviado = await enviarObjeto(destino, nomeRemoto, corpo);
    console.log(
      `backup: copia externa em ${destino.balde}/${nomeRemoto} ` +
        `(${(enviado.tamanho / 1024 / 1024).toFixed(1)} MB, ` +
        `${chave ? "cifrada" : "SEM CIFRA"}), conferida no destino`,
    );
  } catch (erro) {
    falhar(erro.message);
  }
}
