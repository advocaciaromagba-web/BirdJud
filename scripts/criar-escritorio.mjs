// Cadastro guiado minimo: cria um escritorio e seu primeiro administrador.
//
// Enquanto a tela de cadastro da fase 4 nao existe, este script e o caminho
// oficial. Usa o papel do plano de controle (DATABASE_URL_PLATAFORMA).
//
//   node scripts/criar-escritorio.mjs <slug> "<nome>" <email> <senha>
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const [slug, nome, email, senha] = process.argv.slice(2);

if (!slug || !nome || !email || !senha) {
  console.error(
    'Uso: node scripts/criar-escritorio.mjs <slug> "<nome>" <email> <senha>',
  );
  process.exit(1);
}
if (senha.length < 10) {
  console.error("A senha precisa ter ao menos 10 caracteres.");
  process.exit(1);
}

const url = process.env.DATABASE_URL_PLATAFORMA;
if (!url) {
  console.error("DATABASE_URL_PLATAFORMA nao definida. Ver .env.example.");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

try {
  const escritorio = await prisma.escritorio.create({
    data: { slug, nome, status: "TESTE", faixa: "ATE_3" },
  });

  await prisma.usuario.create({
    data: {
      escritorioId: escritorio.id,
      nome: "Administrador",
      email: email.toLowerCase(),
      senhaHash: await bcrypt.hash(senha, 12),
      papel: "ADMIN",
      advogado: true,
    },
  });

  console.log(`Escritorio ${escritorio.nome} criado.`);
  console.log(
    `Endereco: ${slug}.${process.env.DOMINIO_PLATAFORMA ?? "birdjud.com.br"}`,
  );
  console.log(`Administrador: ${email}`);
} catch (erro) {
  console.error("Falha ao criar:", erro.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
