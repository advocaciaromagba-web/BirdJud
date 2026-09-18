// Restaura um backup como escritorio NOVO.
//
//   npm run restaurar -- <arquivo.json> <slug-novo>
//
// O escritorio restaurado nasce SUSPENSO: reabrir o acesso e decisao humana.
// Isso tambem e o que permite testar a restauracao sem risco de colocar duas
// copias do mesmo escritorio no ar.
import { readFileSync } from "node:fs";
import { restaurarBackup, type Backup } from "../src/lib/backup";

async function main(): Promise<void> {
  const [arquivo, slug] = process.argv.slice(2);
  if (!arquivo || !slug) {
    console.error("Uso: npm run restaurar -- <arquivo.json> <slug-novo>");
    process.exit(1);
  }

  const backup = JSON.parse(readFileSync(arquivo, "utf8")) as Backup;
  const resultado = await restaurarBackup(backup, slug);

  console.log(`Restaurado como ${resultado.slug} (SUSPENSO).`);
  for (const [tabela, quantos] of Object.entries(resultado.registros)) {
    if (quantos > 0) console.log(`  ${tabela}: ${quantos}`);
  }
}

main().then(
  () => process.exit(0),
  (erro) => {
    console.error("Falha na restauracao:", erro.message);
    process.exit(1);
  }
);
