// Prova de ponta a ponta da recuperacao de senha.
//
//   npm run conferir-recuperacao
//
// Sobe um SMTP de mentira, sobe a aplicacao apontando para ele, pede o link
// pela rota publica, le o link do e-mail que chegou e troca a senha. Depois
// confere que a senha nova entra e que o link nao serve duas vezes.
//
// Usa o escritorio de demonstracao (npm run vitrine:dados). Banco local.
import { spawn } from "node:child_process";
import { SMTPServer } from "smtp-server";
import pg from "pg";

const PORTA_APP = 3120;
const PORTA_SMTP = 3125;
const BASE = `http://modelo.birdjud.com.br:${PORTA_APP}`;
const EMAIL = "helena@modelo.adv.br";
const SENHA_NOVA = "senha-trocada-2026";

const recebidos = [];

const smtp = new SMTPServer({
  authOptional: true,
  // Sem STARTTLS: o certificado embutido do smtp-server e autoassinado, e o
  // nodemailer recusa — como deve recusar. A conferencia e do fluxo, nao do
  // TLS, e o codigo de producao fica intocado.
  hideSTARTTLS: true,
  // Aceita qualquer usuario: o que se confere aqui e o fluxo, nao a senha do
  // servidor de e-mail.
  onAuth(_credencial, _sessao, pronto) {
    pronto(null, { user: "conferencia" });
  },
  onData(fluxo, sessao, pronto) {
    let corpo = "";
    fluxo.on("data", (parte) => (corpo += parte));
    fluxo.on("end", () => {
      recebidos.push(corpo);
      pronto();
    });
  },
});

function subirAplicacao() {
  return spawn("npx", ["next", "start", "-p", String(PORTA_APP)], {
    env: {
      ...process.env,
      PLATAFORMA_SMTP_HOST: "127.0.0.1",
      PLATAFORMA_SMTP_PORTA: String(PORTA_SMTP),
      PLATAFORMA_SMTP_USUARIO: "qualquer",
      PLATAFORMA_SMTP_SENHA: "qualquer",
      PLATAFORMA_REMETENTE: "BirdJud <blackbirdnotifica@gmail.com>",
      // Sem porta: o dominio da plataforma e o que casa com o Host, e o
      // resolvedor ja descarta a porta sozinho.
      DOMINIO_PLATAFORMA: "birdjud.com.br",
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
}

/** Porta ocupada por sobra de execucao anterior confunde o diagnostico. */
async function exigirPortaLivre(porta) {
  try {
    const resposta = await fetch(`http://127.0.0.1:${porta}/api/saude`);
    if (resposta) {
      throw new Error(
        `ja existe algo escutando em ${porta}. Encerre antes de conferir, senao a prova fala com o servidor errado.`,
      );
    }
  } catch (erro) {
    if (erro instanceof Error && erro.message.includes("ja existe algo"))
      throw erro;
    // Conexao recusada e o que se espera: a porta esta livre.
  }
}

async function esperar(url, tentativas = 60) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const resposta = await fetch(url);
      if (resposta.ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((pronto) => setTimeout(pronto, 1000));
  }
  throw new Error(`nao respondeu: ${url}`);
}

/**
 * Decodifica quoted-printable.
 *
 * O e-mail vai como texto puro, mas o transporte quebra linha longa com "="
 * no fim e escapa o proprio "=" como "=3D" — inclusive o do "?t=" do link.
 * Sem desfazer isso, o token lido do e-mail vem com "3D" grudado na frente e
 * a conferencia acusa um erro que nao existe.
 */
function decodificarQuotedPrintable(bruto) {
  return bruto
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
}

function falhar(mensagem) {
  console.error("FALHOU:", mensagem);
  process.exitCode = 1;
}

/**
 * Zera as janelas do limitador desta prova.
 *
 * Sem isto, a segunda conferencia do dia bate no teto de cinco pedidos por
 * conta por hora — que e justamente o limite funcionando — e a prova parece
 * ter falhado quando quem barrou foi a defesa.
 */
async function limparJanelas() {
  const cliente = new pg.Client({
    connectionString: process.env.DATABASE_URL_PLATAFORMA,
  });
  await cliente.connect();
  try {
    await cliente.query(
      `DELETE FROM "LimiteDeTaxa" WHERE chave LIKE 'senha-%'`,
    );
  } finally {
    await cliente.end();
  }
}

await limparJanelas();
await exigirPortaLivre(PORTA_APP);
await new Promise((pronto) => smtp.listen(PORTA_SMTP, pronto));
const app = subirAplicacao();

try {
  await esperar(`http://127.0.0.1:${PORTA_APP}/api/saude`);

  const pedido = await fetch(`${BASE}/api/senha/esqueci`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: `modelo.birdjud.com.br:${PORTA_APP}`,
    },
    body: JSON.stringify({ email: EMAIL }),
  });
  const respostaDoPedido = await pedido.json();
  console.log(
    "pedido:",
    pedido.status,
    respostaDoPedido.detalhe ?? respostaDoPedido.erro,
  );
  if (!pedido.ok) falhar("a rota de pedido recusou");

  // E-mail que nao existe tem de responder EXATAMENTE igual.
  const inexistente = await fetch(`${BASE}/api/senha/esqueci`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "ninguem@exemplo.com" }),
  });
  const respostaInexistente = await inexistente.json();
  if (
    JSON.stringify(respostaInexistente) !== JSON.stringify(respostaDoPedido)
  ) {
    falhar("a resposta entrega se a conta existe");
  } else {
    console.log("ok: mesma resposta para conta que existe e que nao existe");
  }

  await new Promise((pronto) => setTimeout(pronto, 500));
  if (recebidos.length !== 1)
    falhar(`esperava 1 e-mail, chegaram ${recebidos.length}`);

  const corpo = decodificarQuotedPrintable(recebidos[0]);
  const achado = corpo.match(
    /https?:\/\/[^\s"'<>]+redefinir-senha\?t=[A-Za-z0-9_-]+/,
  );
  if (!achado) {
    falhar("nao achei o link no e-mail");
  } else {
    const link = achado[0];
    const token = new URL(link).searchParams.get("t");
    console.log("link recebido, token de", token.length, "caracteres");
    if (corpo.includes(SENHA_NOVA)) falhar("o e-mail trouxe senha no corpo");

    const troca = await fetch(`${BASE}/api/senha/redefinir`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, novaSenha: SENHA_NOVA }),
    });
    console.log("troca:", troca.status, (await troca.json()).detalhe ?? "");
    if (!troca.ok) falhar("a troca de senha recusou");

    const repetida = await fetch(`${BASE}/api/senha/redefinir`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, novaSenha: "outra-senha-9999" }),
    });
    if (repetida.ok) falhar("o mesmo link serviu duas vezes");
    else console.log("ok: o mesmo link nao serve duas vezes");

    // A senha nova entra?
    const jar = [];
    const guardar = (resposta) => {
      const bruto = resposta.headers.getSetCookie?.() ?? [];
      for (const cookie of bruto) jar.push(cookie.split(";")[0]);
    };
    const csrfResposta = await fetch(`${BASE}/api/auth/csrf`);
    guardar(csrfResposta);
    const { csrfToken } = await csrfResposta.json();
    const entrada = await fetch(`${BASE}/api/auth/callback/credenciais`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: jar.join("; "),
      },
      body: new URLSearchParams({
        csrfToken,
        email: EMAIL,
        senha: SENHA_NOVA,
        json: "true",
      }),
      redirect: "manual",
    });
    guardar(entrada);
    const sessao = await fetch(`${BASE}/api/auth/session`, {
      headers: { cookie: jar.join("; ") },
    }).then((r) => r.json());
    if (sessao?.user?.email === EMAIL) console.log("ok: a senha nova entra");
    else falhar("a senha nova nao entrou");
  }
} finally {
  app.kill();
  smtp.close();
}

if (!process.exitCode) console.log("\nrecuperacao de senha: tudo certo");
