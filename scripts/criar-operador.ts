// Cria um operador da plataforma (nos), que acessa o painel /plataforma.
//
//   npm run criar-operador -- "Nome" email@birdjud.com.br senha-longa
//
// Tambem aceita OPERADOR_NOME, OPERADOR_EMAIL e OPERADOR_SENHA no ambiente.
// Isso existe para rodar dentro do servidor: la a linha de comando fica
// gravada na configuracao do servico, e senha em configuracao de servico e
// senha vazada. Variavel de ambiente a gente apaga depois de usar.
import { PrismaClient } from "@prisma/client";
import { gerarHash } from "../src/lib/senhas";

async function main(): Promise<void> {
  const [nomeArg, emailArg, senhaArg] = process.argv.slice(2);
  const nome = nomeArg ?? process.env.OPERADOR_NOME;
  const email = emailArg ?? process.env.OPERADOR_EMAIL;
  const senha = senhaArg ?? process.env.OPERADOR_SENHA;
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
