// Backup de um escritorio em JSON.
//
//   npm run backup -- <slug> [arquivo.json]
//
// O arquivo carrega as credenciais de integracao CIFRADAS. Sem a SEGREDO_CHAVE
// do ambiente ele nao entrega credencial nenhuma, mas ainda e material
// sensivel: guarde como se fosse o banco.
import { writeFileSync } from "node:fs";
import { gerarBackup } from "../src/lib/backup";
import { prismaPlataforma } from "../src/lib/prisma";

async function main(): Promise<void> {
  const [slug, destino] = process.argv.slice(2);
  if (!slug) {
    console.error("Uso: npm run backup -- <slug> [arquivo.json]");
    process.exit(1);
  }

  const escritorio = await prismaPlataforma().escritorio.findUnique({ where: { slug } });
  if (!escritorio) {
    console.error(`Escritorio ${slug} nao encontrado.`);
    process.exit(1);
  }

  const backup = await gerarBackup(escritorio.id);
  const arquivo = destino ?? `backup-${slug}-${backup.geradoEm.slice(0, 10)}.json`;
  writeFileSync(arquivo, JSON.stringify(backup, null, 2));

  const total = Object.values(backup.tabelas).reduce((t, linhas) => t + linhas.length, 0);
  console.log(`Backup de ${escritorio.nome}: ${total} registro(s) em ${arquivo}`);
}

main().then(
  () => process.exit(0),
  (erro) => {
    console.error("Falha no backup:", erro.message);
    process.exit(1);
  }
);
