// Vigia do sistema: bate no healthcheck e avisa quando nao responde.
//
//   npm run vigia
//
// Roda de quinze em quinze minutos no servico cron-vigia. O que ele resolve:
// hoje, se a aplicacao cair as 2h de um sabado, quem descobre e o escritorio
// na segunda-feira.
//
// O que ele NAO resolve, e e preciso dizer: ele roda dentro do mesmo provedor
// que vigia. Se o Railway inteiro cair, o vigia cai junto e ninguem e avisado.
// Ele pega o caso comum — a aplicacao fora do ar com a plataforma de pe — e
// nao substitui um monitor externo.
import {
  enviarPelaPlataforma,
  temRemetenteDaPlataforma,
} from "../src/lib/email-plataforma.ts";

const ENDERECO =
  process.env.VIGIA_ENDERECO ?? "https://app.birdjud.com.br/api/saude";
const DESTINO = process.env.VIGIA_AVISAR ?? process.env.CONTATO_COMERCIAL;
const TENTATIVAS = Number(process.env.VIGIA_TENTATIVAS ?? 3);
const ESPERA_MS = Number(process.env.VIGIA_ESPERA_MS ?? 5_000);
const LIMITE_MS = Number(process.env.VIGIA_LIMITE_MS ?? 15_000);

/** Uma batida: ok quando responde 200 com {"ok":true}. */
async function bater() {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), LIMITE_MS);
  const comecou = Date.now();
  try {
    const resposta = await fetch(ENDERECO, {
      signal: controle.signal,
      headers: { "user-agent": "birdjud-vigia" },
      cache: "no-store",
    });
    const corpo = await resposta.text();
    const demorou = Date.now() - comecou;
    if (!resposta.ok)
      return { ok: false, motivo: `HTTP ${resposta.status}`, demorou };
    if (!corpo.includes('"ok":true')) {
      return {
        ok: false,
        motivo: `resposta inesperada: ${corpo.slice(0, 120)}`,
        demorou,
      };
    }
    return { ok: true, demorou };
  } catch (erro) {
    return {
      ok: false,
      motivo:
        erro.name === "AbortError"
          ? `sem resposta em ${LIMITE_MS} ms`
          : erro.message,
      demorou: Date.now() - comecou,
    };
  } finally {
    clearTimeout(relogio);
  }
}

/*
 * Modo diagnostico: VIGIA_DIAGNOSTICO=1.
 *
 * Existe porque "fetch failed" nao diz nada. Ele bate em varios enderecos e
 * mostra o que cada um respondeu — publico, dominio do Railway e rede
 * interna — para separar "a aplicacao caiu" de "este container nao alcanca a
 * internet".
 */
if (process.env.VIGIA_DIAGNOSTICO === "1") {
  const alvos = [
    ENDERECO,
    "https://aplicacao-production-836b.up.railway.app/api/saude",
    `http://${process.env.APLICACAO_INTERNA ?? "aplicacao.railway.internal"}:8080/api/saude`,
    "https://example.com",
  ];
  for (const alvo of alvos) {
    const comecou = Date.now();
    try {
      const resposta = await fetch(alvo, { cache: "no-store" });
      console.log(
        `diagnostico: ${alvo} -> ${resposta.status} em ${Date.now() - comecou} ms`,
      );
    } catch (erro) {
      console.log(
        `diagnostico: ${alvo} -> ${erro.name}: ${erro.message} (${erro.cause?.code ?? "sem codigo"})`,
      );
    }
  }
  process.exit(0);
}

// Tres batidas antes de acusar: rede tem soluco, e alarme por soluco e o jeito
// mais rapido de ensinar todo mundo a ignorar o alarme.
const motivos = [];
for (let i = 1; i <= TENTATIVAS; i++) {
  const resultado = await bater();
  if (resultado.ok) {
    console.log(`vigia: ${ENDERECO} respondeu em ${resultado.demorou} ms`);
    process.exit(0);
  }
  motivos.push(`tentativa ${i}: ${resultado.motivo}`);
  console.error(`vigia: ${motivos.at(-1)}`);
  if (i < TENTATIVAS)
    await new Promise((pronto) => setTimeout(pronto, ESPERA_MS));
}

const resumo = [
  `O BirdJud nao respondeu em ${TENTATIVAS} tentativas seguidas.`,
  "",
  `Endereco: ${ENDERECO}`,
  `Quando: ${new Date().toISOString()}`,
  "",
  ...motivos,
  "",
  "Onde olhar: Railway > projeto birdjud > servico aplicacao > Deployments.",
  "",
  "BirdJud · vigia automatico",
].join("\n");

console.error(resumo);

if (!DESTINO || !temRemetenteDaPlataforma()) {
  console.error(
    "vigia: sem VIGIA_AVISAR/CONTATO_COMERCIAL ou sem remetente — o aviso nao saiu por e-mail",
  );
  process.exit(1);
}

try {
  await enviarPelaPlataforma({
    para: DESTINO,
    assunto: "BirdJud fora do ar",
    texto: resumo,
  });
  console.error(`vigia: aviso enviado para ${DESTINO}`);
} catch (erro) {
  console.error(`vigia: o aviso nao pode ser enviado — ${erro.message}`);
}

// Sai com erro para a execucao aparecer como falha no painel do Railway,
// mesmo que o e-mail tenha saido.
process.exit(1);
