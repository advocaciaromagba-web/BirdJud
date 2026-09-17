// Trabalhador da fila. Processo separado da aplicacao web.
//
//   npm run trabalhador
//
// Pode haver mais de um: a reclamacao usa FOR UPDATE SKIP LOCKED, e a regra de
// um trabalho por escritorio vale entre todos eles.
import { concluir, destravar, falhar, reclamar } from "../src/lib/fila";
import { EXECUTORES } from "../src/lib/trabalhos";

const ESPERA_VAZIA = 5_000;
const INTERVALO_DESTRAVE = 60_000;

let rodando = true;

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    console.log(`\n${sinal}: encerrando depois do trabalho atual.`);
    rodando = false;
  });
}

async function main(): Promise<void> {
  console.log("Trabalhador no ar.");
  let ultimoDestrave = 0;

  while (rodando) {
    if (Date.now() - ultimoDestrave > INTERVALO_DESTRAVE) {
      const soltos = await destravar();
      if (soltos > 0) console.log(`${soltos} trabalho(s) preso(s) devolvido(s) a fila.`);
      ultimoDestrave = Date.now();
    }

    const trabalho = await reclamar();
    if (!trabalho) {
      await new Promise((r) => setTimeout(r, ESPERA_VAZIA));
      continue;
    }

    const onde = trabalho.escritorioId ?? "plataforma";
    try {
      const executor = EXECUTORES[trabalho.tipo];
      if (!executor) throw new Error(`Tipo de trabalho desconhecido: ${trabalho.tipo}`);
      await executor({ escritorioId: trabalho.escritorioId, dados: trabalho.dados });
      await concluir(trabalho.id);
      console.log(`ok   ${trabalho.tipo} ${onde}`);
    } catch (erro) {
      // Falha de um escritorio nao derruba o trabalhador nem atrasa os outros.
      await falhar(trabalho, erro);
      console.error(`erro ${trabalho.tipo} ${onde}: ${(erro as Error).message}`);
    }
  }

  console.log("Trabalhador encerrado.");
}

main().then(
  () => process.exit(0),
  (erro) => {
    console.error("Trabalhador caiu:", erro);
    process.exit(1);
  }
);
