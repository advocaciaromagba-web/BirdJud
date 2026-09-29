// Traz o backup de volta do armazenamento externo, decifra e grava em disco.
//
//   npm run restaurar-copia -- banco/birdjud-2026-09-29T10-20.sql.gz.cifrado
//   npm run restaurar-copia            (lista o que existe la)
//
// POR QUE ESTE SCRIPT EXISTE: copia que ninguem sabe trazer de volta nao e
// backup, e o dia de descobrir como nao pode ser o dia do acidente. Ele e o
// par do backup-banco.mjs — um so tem sentido com o outro.
import { writeFile } from "node:fs/promises";
import {
  assinar,
  chaveDoBackup,
  decifrarBackup,
  destinoDoAmbiente,
} from "../src/lib/copia-remota.ts";

function falhar(mensagem) {
  console.error(`restaurar: ${mensagem}`);
  process.exit(1);
}

const destino = destinoDoAmbiente();
if (!destino) falhar("BACKUP_S3_* nao configurado — nao ha de onde restaurar.");

const alvo = process.argv[2];

/** Lista o que esta no balde, para nao ter de adivinhar o nome. */
async function listar() {
  const vazio =
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const a = assinar(destino, "GET", "", vazio, 0, new Date());
  const resposta = await fetch(`${a.url}?list-type=2&prefix=banco/`, {
    headers: a.cabecalhos,
  });
  if (!resposta.ok) {
    falhar(`o balde respondeu ${resposta.status} ao listar.`);
  }
  const xml = await resposta.text();
  const nomes = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
  if (nomes.length === 0) {
    falhar("nao ha nenhuma copia no balde. O backup ja rodou com BACKUP_S3_* posto?");
  }
  console.log(`${nomes.length} copia(s) em ${destino.balde}:\n`);
  for (const nome of nomes.sort().slice(-20)) console.log(`  ${nome}`);
  console.log("\nPara trazer uma: npm run restaurar-copia -- <nome acima>");
}

if (!alvo) {
  await listar();
  process.exit(0);
}

const vazio = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const a = assinar(destino, "GET", alvo, vazio, 0, new Date());
const resposta = await fetch(a.url, { headers: a.cabecalhos });
if (!resposta.ok) {
  falhar(`o balde respondeu ${resposta.status} ao buscar ${alvo}.`);
}

const bruto = Buffer.from(await resposta.arrayBuffer());
const chave = chaveDoBackup();

let conteudo = bruto;
if (alvo.endsWith(".cifrado")) {
  if (!chave) {
    falhar(
      "esta copia esta cifrada e BACKUP_CHAVE nao esta no ambiente. " +
        "Sem a chave o arquivo nao serve para nada — ela deveria estar " +
        "guardada FORA do Railway.",
    );
  }
  try {
    conteudo = decifrarBackup(bruto, chave);
  } catch (erro) {
    falhar(`nao foi possivel decifrar: ${erro.message}`);
  }
}

const saida = alvo.split("/").at(-1).replace(/\.cifrado$/, "");
await writeFile(saida, conteudo);

// Conferencia minima: gzip comeca com 1f 8b. Arquivo que nao e gzip aqui
// significa chave errada que "funcionou" ou download truncado.
const ehGzip = conteudo[0] === 0x1f && conteudo[1] === 0x8b;
console.log(
  `restaurar: ${saida} (${(conteudo.length / 1024 / 1024).toFixed(1)} MB)` +
    (ehGzip ? "" : "  ATENCAO: o conteudo nao parece um .gz"),
);
console.log(
  "\nPara restaurar de verdade:\n" +
    `  gunzip -c ${saida} | psql "$DATABASE_URL_MIGRACAO"\n` +
    "  npm run rls:aplicar     <- o dump nao traz privilegios, entao o RLS precisa ser reaplicado",
);
