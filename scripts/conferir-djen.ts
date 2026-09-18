// Confere o mapeamento de campos do DJEN contra uma resposta de VERDADE.
//
//   npm run conferir-djen -- <numeroOab> <UF>
//
// Com DJEN_RELE_URL e DJEN_RELE_TOKEN no ambiente, a consulta sai pelo rele da
// Vercel e o script roda de qualquer lugar. Sem eles, vai direto ao CNJ e so
// funciona de dentro do Brasil (de fora a resposta e 403, e o script avisa).
//
// Ele imprime, lado a lado, o item cru e o que o nosso conversor extraiu.
// Campo que sair vazio e mapeamento errado, e o lugar de corrigir e
// src/lib/djen.ts — so ele conhece os nomes de campo da API.
import { comoData, converter, destinoDaConsulta, releDjen } from "../src/lib/djen";
import { triar } from "../src/lib/leitura-publicacao";

const DIA = 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const [numeroOab, uf] = process.argv.slice(2);
  if (!numeroOab || !uf) {
    console.error("Uso: npm run conferir-djen -- <numeroOab> <UF>");
    process.exit(1);
  }

  const ate = new Date();
  const de = new Date(ate.getTime() - 15 * DIA);
  const parametros = new URLSearchParams({
    numeroOab: numeroOab.replace(/\D/g, ""),
    ufOab: uf.toUpperCase(),
    dataDisponibilizacaoInicio: comoData(de),
    dataDisponibilizacaoFim: comoData(ate),
    pagina: "1",
    itensPorPagina: "3",
  });

  const destino = destinoDaConsulta(parametros);
  const peloRele = releDjen() !== null;
  console.log(`Consultando ${destino.url}`);
  console.log(peloRele ? "Saindo pelo rele da Vercel.\n" : "Indo direto ao CNJ.\n");

  const resposta = await fetch(destino.url, { headers: destino.cabecalhos });

  if (resposta.status === 401 && peloRele) {
    console.error("401: o rele recusou o token. Confira DJEN_RELE_TOKEN.");
    process.exit(1);
  }
  if (resposta.status === 403) {
    console.error(
      peloRele
        ? "403 mesmo pelo rele: confira se o projeto na Vercel esta fixado na regiao gru1."
        : "403: a API bloqueia acesso de fora do Brasil. Configure DJEN_RELE_URL ou rode do Brasil."
    );
    process.exit(1);
  }
  if (!resposta.ok) {
    console.error(`A API respondeu ${resposta.status}.`);
    process.exit(1);
  }

  const corpo = (await resposta.json()) as { items?: unknown[]; count?: number };
  const itens = corpo.items ?? [];
  console.log(`Total informado pela API: ${corpo.count ?? "?"} · itens nesta pagina: ${itens.length}\n`);

  if (itens.length === 0) {
    console.log("Sem comunicacoes no periodo — tente outra OAB ou amplie a janela.");
    return;
  }

  for (const [indice, item] of itens.entries()) {
    console.log(`--- item ${indice + 1} ------------------------------------------`);
    console.log("Campos que a API mandou:");
    console.log("  " + Object.keys(item as object).join(", "));

    const convertido = converter(item as Record<string, unknown>);
    if (!convertido) {
      console.log("\n  ATENCAO: o conversor devolveu null — falta id, texto ou data.");
      console.log("  Item cru:", JSON.stringify(item, null, 2).slice(0, 1200));
      continue;
    }

    const triagem = triar(convertido.texto);
    console.log("\nO que o conversor extraiu:");
    for (const [campo, valor] of Object.entries(convertido)) {
      const mostrar =
        campo === "texto" ? `${String(valor).slice(0, 80)}…` : String(valor ?? "(vazio)");
      const alerta = valor === null ? "   <-- VAZIO, conferir o mapeamento" : "";
      console.log(`  ${campo.padEnd(22)} ${mostrar}${alerta}`);
    }
    console.log(`  ${"triagem".padEnd(22)} prazo ${triagem.prazoDias ?? "—"} · urgente ${triagem.urgente}`);
    console.log("");
  }
}

main().then(
  () => process.exit(0),
  (erro) => {
    console.error("Falha:", erro.message);
    process.exit(1);
  }
);
