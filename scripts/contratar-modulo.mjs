// Contratar ou desligar um modulo para um escritorio.
//
// Isto e acao da PLATAFORMA, nao do escritorio: modulo e o que o escritorio
// paga, entao ele nao pode se conceder um. A tela disso e o painel do
// operador, na fase 4; ate la, este script.
//
//   node scripts/contratar-modulo.mjs <slug> <MODULO> [franquia] [--desligar]
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const desligar = args.includes("--desligar");
const [slug, modulo, franquiaBruta] = args.filter((a) => a !== "--desligar");

if (!slug || !modulo) {
  console.error(
    "Uso: node scripts/contratar-modulo.mjs <slug> <MODULO> [franquia] [--desligar]"
  );
  process.exit(1);
}

const url = process.env.DATABASE_URL_PLATAFORMA;
if (!url) {
  console.error("DATABASE_URL_PLATAFORMA nao definida. Ver .env.example.");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

try {
  const escritorio = await prisma.escritorio.findUnique({ where: { slug } });
  if (!escritorio) {
    console.error(`Escritorio ${slug} nao encontrado.`);
    process.exit(1);
  }

  const franquia = franquiaBruta ? Number(franquiaBruta) : null;
  await prisma.moduloContratado.upsert({
    where: { escritorioId_modulo: { escritorioId: escritorio.id, modulo } },
    create: { escritorioId: escritorio.id, modulo, ativo: !desligar, franquia },
    update: { ativo: !desligar, franquia },
  });

  console.log(
    `${desligar ? "Desligado" : "Contratado"}: ${modulo} para ${escritorio.nome}` +
      (franquia !== null ? ` (franquia ${franquia})` : "")
  );
} catch (erro) {
  console.error("Falha:", erro.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
