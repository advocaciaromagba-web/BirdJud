// Agenda um trabalho para todos os escritorios que podem receber.
// Chamado por um agendador externo (cron do Railway, por exemplo).
//
//   npm run espalhar APURAR_CONSUMO
import { espalhar } from "../src/lib/trabalhos";

async function main(): Promise<void> {
  const tipo = process.argv[2];
  if (!tipo) {
    console.error("Uso: npm run espalhar <TIPO>");
    process.exit(1);
  }

  const agendados = await espalhar(tipo);
  console.log(`${tipo}: ${agendados} escritorio(s) agendado(s).`);
}

main().then(
  () => process.exit(0),
  (erro) => {
    console.error("Falha ao espalhar:", erro);
    process.exit(1);
  }
);
