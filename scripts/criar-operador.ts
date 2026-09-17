// Cria um operador da plataforma (nos), que acessa o painel /plataforma.
//
//   npm run criar-operador -- "Nome" email@birdjud.com.br senha-longa
import { PrismaClient } from "@prisma/client";
import { gerarHash } from "../src/lib/senhas";

async function main(): Promise<void> {
  const [nome, email, senha] = process.argv.slice(2);
  if (!nome || !email || !senha) {
    console.error('Uso: npm run criar-operador -- "Nome" email senha');
    process.exit(1);
  }

  const url = process.env.DATABASE_URL_PLATAFORMA;
  if (!url) {
    console.error("DATABASE_URL_PLATAFORMA nao definida. Ver .env.example.");
    process.exit(1);
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const operador = await prisma.operadorPlataforma.create({
      data: { nome, email: email.toLowerCase(), senhaHash: await gerarHash(senha) },
    });
    console.log(`Operador ${operador.nome} <${operador.email}> criado.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  () => process.exit(0),
  (erro) => {
    console.error("Falha:", erro.message);
    process.exit(1);
  }
);
