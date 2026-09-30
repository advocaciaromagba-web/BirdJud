// Vigia do sistema: bate no healthcheck e avisa quando nao responde.
//
//   npm run vigia
//
// Roda de quinze em quinze minutos no servico cron-vigia. O que ele resolve:
// hoje, se a aplicacao cair as 2h de um sabado, quem descobre e o escritorio
// na segunda-feira.
//
// Duas coisas que ele NAO resolve, e que precisam ser ditas:
//
// 1. ele roda dentro do mesmo provedor que vigia. Se o Railway inteiro cair,
//    o vigia cai junto e ninguem e avisado;
// 2. ele bate no dominio do Railway, nao em app.birdjud.com.br. De dentro do
//    Railway, chamar o proprio dominio publico do projeto falha ("fetch
//    failed") — a borda nao aceita a volta. Entao a camada de DNS e
//    certificado do dominio proprio fica de fora desta vigilancia.
//
// Ele pega o caso comum — a aplicacao fora do ar com a plataforma de pe. As
// duas lacunas acima sao exatamente o que um monitor de fora cobre, e por
// isso o monitor externo continua valendo a pena.
import { connect as conectarTls } from "node:tls";
import {
  enviarPelaPlataforma,
  temRemetenteDaPlataforma,
} from "../src/lib/email-plataforma.ts";
import { julgar } from "../src/lib/certificado.ts";
import {
  avaliarCopias,
  destinoDoAmbiente,
  listarObjetos,
} from "../src/lib/copia-remota.ts";

const ENDERECO =
  process.env.VIGIA_ENDERECO ?? "https://app.birdjud.com.br/api/saude";
const DESTINO = process.env.VIGIA_AVISAR ?? process.env.CONTATO_COMERCIAL;
const TENTATIVAS = Number(process.env.VIGIA_TENTATIVAS ?? 3);
const ESPERA_MS = Number(process.env.VIGIA_ESPERA_MS ?? 5_000);
const LIMITE_MS = Number(process.env.VIGIA_LIMITE_MS ?? 15_000);

/**
 * Dominios proprios cuja borda precisa apresentar certificado valido.
 * Um por linha do healthcheck nao serve: o que interessa aqui e o nome que a
 * borda apresenta, e ele vale para o subdominio inteiro.
 */
const CERTIFICADOS = (
  process.env.VIGIA_CERTIFICADOS ??
  `app.${process.env.DOMINIO_PLATAFORMA?.trim() || "birdjud.com.br"}`
)
  .split(",")
  .map((nome) => nome.trim())
  .filter(Boolean);

/**
 * Abre o TLS e devolve o certificado que a borda apresentou.
 *
 * rejectUnauthorized: false de proposito — queremos OLHAR o certificado
 * errado, nao levar um erro e ficar sem saber qual era. O julgamento e do
 * modulo certificado.ts, que e testado.
 */
function certificadoDaBorda(host) {
  return new Promise((pronto) => {
    const tomada = conectarTls({
      host,
      port: 443,
      servername: host,
      rejectUnauthorized: false,
      timeout: LIMITE_MS,
    });
    tomada.on("secureConnect", () => {
      const certificado = tomada.getPeerCertificate();
      tomada.destroy();
      pronto({ certificado });
    });
    tomada.on("timeout", () => {
      tomada.destroy();
      pronto({ erro: `sem handshake em ${LIMITE_MS} ms` });
    });
    tomada.on("error", (erro) => pronto({ erro: erro.code ?? erro.message }));
  });
}

/**
 * O backup ainda esta subindo para fora do Railway?
 *
 * Sem BACKUP_S3_* configurado, cala: nem todo ambiente tem copia externa, e
 * acusar a ausencia de uma configuracao opcional seria alarme por decisao
 * tomada. Falha ao LISTAR tambem nao acusa aqui — pode ser rede deste
 * container —, mas fica registrada.
 *
 * O vigia so lista. Ele nao tem a chave de cifra, e nao deve ter: para dizer
 * que a copia existe e recente, ler o nome e a data basta.
 */
async function conferirCopiaExterna() {
  let destino;
  try {
    destino = destinoDoAmbiente();
  } catch (erro) {
    // Configuracao pela metade e problema de verdade: parece configurada e
    // nao copia nada.
    return [erro.message];
  }
  if (!destino) return [];

  let objetos;
  try {
    // O prefixo e configuravel para que o alarme possa ser exercitado sem
    // mexer nas copias de verdade: apontar para um prefixo vazio produz
    // exatamente o cenario "o backup parou".
    objetos = await listarObjetos(
      destino,
      process.env.VIGIA_PREFIXO_BACKUP ?? "banco/",
    );
  } catch (erro) {
    console.log(`vigia: copia externa inconclusiva — ${erro.message}`);
    return [];
  }

  const problema = avaliarCopias(objetos);
  if (problema) {
    console.error(`vigia: ${problema}`);
    return [problema];
  }

  const maisNova = objetos.reduce((a, b) =>
    a.modificadoEm > b.modificadoEm ? a : b,
  );
  console.log(
    `vigia: copia externa ok — ${objetos.length} no balde, a mais nova de ` +
      `${maisNova.modificadoEm.toISOString()}`,
  );
  return [];
}

/** Confere todos os dominios e devolve so o que e falha certa. */
async function conferirCertificados() {
  const falhas = [];
  for (const host of CERTIFICADOS) {
    const { certificado, erro } = await certificadoDaBorda(host);
    if (erro) {
      // Nao alcancar o host pode ser a rede deste container. Registra e cala.
      console.log(`vigia: certificado de ${host} inconclusivo — ${erro}`);
      continue;
    }
    const veredito = julgar(host, certificado, new Date());
    if (veredito.situacao === "ok") {
      console.log(
        `vigia: certificado de ${host} ok (${veredito.nomes.join(", ")}), ${veredito.expiraEm} dia(s)`,
      );
    } else if (veredito.situacao === "inconclusivo") {
      console.log(`vigia: certificado de ${host} inconclusivo — ${veredito.motivo}`);
    } else {
      console.error(`vigia: ${veredito.motivo}`);
      falhas.push(veredito.motivo);
    }
  }
  return falhas;
}

/**
 * Manda o aviso, e nunca deixa a falha do e-mail apagar a falha original: o
 * codigo de saida do vigia continua sendo o do problema que ele achou.
 */
async function avisar(assunto, texto) {
  if (!DESTINO || !temRemetenteDaPlataforma()) {
    console.error(
      "vigia: sem VIGIA_AVISAR/CONTATO_COMERCIAL ou sem remetente — o aviso nao saiu por e-mail",
    );
    return;
  }
  try {
    await enviarPelaPlataforma({ para: DESTINO, assunto, texto });
    console.error(`vigia: aviso enviado para ${DESTINO}`);
  } catch (erro) {
    console.error(`vigia: o aviso nao pode ser enviado — ${erro.message}`);
  }
}

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
  // Portas de e-mail: provedor de nuvem costuma bloquear saida SMTP para
  // conter spam, e o sintoma e sempre o mesmo — "connection timeout" —, que
  // se confunde com senha errada. Esta conferencia separa as duas coisas.
  const { connect } = await import("node:net");
  for (const [maquina, porta] of [
    ["smtp.gmail.com", 587],
    ["smtp.gmail.com", 465],
    ["smtp.gmail.com", 25],
    ["api.resend.com", 443],
  ]) {
    const comecou = Date.now();
    const resultado = await new Promise((pronto) => {
      const tomada = connect({ host: maquina, port: porta, timeout: 8000 });
      tomada.on("connect", () => {
        tomada.destroy();
        pronto("abriu");
      });
      tomada.on("timeout", () => {
        tomada.destroy();
        pronto("tempo esgotado");
      });
      tomada.on("error", (erro) => pronto(erro.code ?? erro.message));
    });
    console.log(
      `diagnostico: ${maquina}:${porta} -> ${resultado} em ${Date.now() - comecou} ms`,
    );
  }

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

// O certificado primeiro: healthcheck verde com certificado invalido e
// justamente o caso em que o sistema esta fora do ar para quem usa.
const problemasDeCertificado = await conferirCertificados();
const problemasDoBackup = await conferirCopiaExterna();

// Tres batidas antes de acusar: rede tem soluco, e alarme por soluco e o jeito
// mais rapido de ensinar todo mundo a ignorar o alarme.
const motivos = [];
let respondeu = false;
for (let i = 1; i <= TENTATIVAS; i++) {
  const resultado = await bater();
  if (resultado.ok) {
    console.log(`vigia: ${ENDERECO} respondeu em ${resultado.demorou} ms`);
    respondeu = true;
    break;
  }
  motivos.push(`tentativa ${i}: ${resultado.motivo}`);
  console.error(`vigia: ${motivos.at(-1)}`);
  if (i < TENTATIVAS)
    await new Promise((pronto) => setTimeout(pronto, ESPERA_MS));
}

// Backup parado nao e queda: o sistema segue no ar. Por isso ele tem aviso
// proprio, com assunto proprio — quem recebe precisa saber, em uma linha, se
// larga o almoco ou se resolve hoje a tarde.
if (problemasDoBackup.length > 0) {
  const aviso = [
    "O backup do banco parou de ir para fora do Railway.",
    "",
    "O sistema continua no ar. O que esta em risco e a recuperacao: sem copia",
    "externa, um incidente no Railway leva o banco e o backup juntos.",
    "",
    `Quando: ${new Date().toISOString()}`,
    "",
    ...problemasDoBackup,
    "",
    "Onde olhar: Railway > projeto birdjud > servico cron-backup > ultima",
    "execucao. Depois, Cloudflare > R2 > birdjud-backup.",
    "",
    "BirdJud · vigia automatico",
  ].join("\n");
  console.error(aviso);
  await avisar("BirdJud: o backup parou de subir", aviso);
}

if (respondeu && problemasDeCertificado.length === 0) {
  process.exit(problemasDoBackup.length > 0 ? 1 : 0);
}

if (respondeu) {
  const aviso = [
    "A aplicacao responde, mas o certificado do dominio proprio esta com problema.",
    "Enquanto isso durar, NINGUEM consegue entrar: o navegador recusa o TLS",
    "antes de chegar na aplicacao.",
    "",
    `Quando: ${new Date().toISOString()}`,
    "",
    ...problemasDeCertificado,
    "",
    "Onde olhar: Railway > projeto birdjud > servico aplicacao > Settings >",
    "Networking > o dominio > certificado. Em falha, reemitir.",
    "",
    "BirdJud · vigia automatico",
  ].join("\n");
  console.error(aviso);
  await avisar("BirdJud sem certificado valido", aviso);
  process.exit(1);
}

const resumo = [
  `O BirdJud nao respondeu em ${TENTATIVAS} tentativas seguidas.`,
  "",
  `Endereco: ${ENDERECO}`,
  `Quando: ${new Date().toISOString()}`,
  "",
  ...motivos,
  ...(problemasDeCertificado.length
    ? ["", "E o certificado do dominio proprio tambem:", ...problemasDeCertificado]
    : []),
  "",
  "Onde olhar: Railway > projeto birdjud > servico aplicacao > Deployments.",
  "",
  "BirdJud · vigia automatico",
].join("\n");

console.error(resumo);
await avisar("BirdJud fora do ar", resumo);

// Sai com erro para a execucao aparecer como falha no painel do Railway,
// mesmo que o e-mail tenha saido.
process.exit(1);
