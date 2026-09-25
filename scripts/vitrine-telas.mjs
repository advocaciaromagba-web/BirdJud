// As imagens da vitrine, tiradas do sistema de verdade.
//
//   npm run vitrine:dados && npm run vitrine:telas
//
// Nao sao maquetes: sao capturas do BirdJud rodando, no escritorio de
// demonstracao "modelo", com dados inventados. Se a tela mudar, basta rodar
// de novo — e se a tela quebrar, a imagem quebra junto, que e o ponto.
//
// A leitura por IA e a unica que precisa de um respondedor local no lugar da
// API: a captura mostra a tela de verdade, com uma resposta de exemplo.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { readdir, rename, unlink } from "node:fs/promises";
import { chromium } from "playwright";

const PORTA_APP = 3100;
const PORTA_IA = 3111;
const BASE = `http://modelo.birdjud.com.br:${PORTA_APP}`;
const SENHA = "Vitrine-2026-Modelo";
const DESTINO = "public/vitrine";

const LEITURA_DE_EXEMPLO = {
  campos: {
    nome: { valor: "Construtora Aurora Ltda", confianca: "ALTA", origem: "cabecalho do contrato social" },
    documento: { valor: "11222333000181", confianca: "ALTA", origem: "campo CNPJ" },
    telefone: { valor: "(71) 3000-1122", confianca: "MEDIA", origem: "rodape da primeira pagina" },
    email: { valor: "contato@aurora.com.br", confianca: "BAIXA", origem: "carimbo, parcialmente ilegivel" },
  },
  observacoes: [
    "O contrato social esta na 3a alteracao, de marco de 2026. Confirme se e a versao vigente antes de usar em peca.",
  ],
};

/** Responde como a API de mensagens, so para a captura da tela de leitura. */
function respondedorDeIA() {
  return createServer((req, res) => {
    let corpo = "";
    req.on("data", (parte) => (corpo += parte));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "msg_vitrine",
          type: "message",
          role: "assistant",
          model: "demonstracao",
          content: [{ type: "text", text: JSON.stringify(LEITURA_DE_EXEMPLO) }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1840, output_tokens: 260 },
        })
      );
    });
  });
}

function subirAplicacao() {
  const app = spawn("npx", ["next", "start", "-p", String(PORTA_APP)], {
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: "chave-de-demonstracao",
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${PORTA_IA}`,
    },
    stdio: "ignore",
  });
  return app;
}

async function esperarAplicacao() {
  for (let i = 0; i < 60; i++) {
    try {
      const resposta = await fetch(`http://127.0.0.1:${PORTA_APP}/api/saude`);
      if (resposta.ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((pronto) => setTimeout(pronto, 1000));
  }
  throw new Error("a aplicacao nao subiu");
}

/** Converte as capturas em JPEG do tamanho que a pagina usa. */
async function otimizar() {
  const { default: sharp } = await import("sharp").catch(() => ({ default: null }));
  const arquivos = (await readdir(DESTINO)).filter((nome) => nome.endsWith(".png"));
  if (!sharp) {
    console.log(
      `sem sharp: ${arquivos.length} PNG ficaram como estao. Converter a mao antes de publicar.`,
    );
    return;
  }
  for (const nome of arquivos) {
    const origem = `${DESTINO}/${nome}`;
    await sharp(origem)
      .resize({ width: 1700, withoutEnlargement: true })
      .jpeg({ quality: 82, progressive: true })
      .toFile(origem.replace(/\.png$/, ".jpg"));
    await unlink(origem);
  }
  console.log("capturas convertidas para JPEG");
}

const ia = respondedorDeIA();
await new Promise((pronto) => ia.listen(PORTA_IA, pronto));
const app = subirAplicacao();

try {
  await esperarAplicacao();
  await mkdir(DESTINO, { recursive: true });

  const navegador = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: [`--host-resolver-rules=MAP *.birdjud.com.br 127.0.0.1`],
  });
  const contexto = await navegador.newContext({
    viewport: { width: 1360, height: 900 },
    deviceScaleFactor: 2,
    baseURL: BASE,
  });
  const pagina = await contexto.newPage();

  await pagina.goto("/login", { waitUntil: "networkidle" });
  await pagina.fill('input[name="email"]', "helena@modelo.adv.br");
  await pagina.fill('input[name="senha"]', SENHA);
  await pagina.click('button[type="submit"]');
  await pagina.waitForURL(`${BASE}/`, { timeout: 30000 });
  await pagina.waitForLoadState("networkidle");

  const telas = [
    { arquivo: "painel", caminho: "/" },
    { arquivo: "publicacoes", caminho: "/publicacoes" },
    { arquivo: "agenda", caminho: "/agenda" },
    { arquivo: "notas", caminho: "/notas" },
    { arquivo: "cobrancas", caminho: "/cobrancas" },
  ];

  for (const tela of telas) {
    await pagina.goto(tela.caminho, { waitUntil: "networkidle" });
    await pagina.waitForTimeout(400);
    await pagina.screenshot({ path: `${DESTINO}/${tela.arquivo}.png` });
    console.log("capturada:", tela.arquivo);
  }

  // Leitura de documento: abre o formulario, envia um arquivo e espera a IA.
  await pagina.goto("/clientes", { waitUntil: "networkidle" });
  await pagina.getByRole("button", { name: /novo cliente/i }).click();
  await pagina.setInputFiles('input[type="file"]', {
    name: "contrato-social-aurora.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% documento de demonstracao\n"),
  });
  await pagina.getByRole("button", { name: /ler documentos/i }).click();
  await pagina.getByText(/o que a ia leu/i).waitFor({ timeout: 30000 });
  await pagina.waitForTimeout(400);
  await pagina.screenshot({ path: `${DESTINO}/leitura-ia.png` });
  console.log("capturada: leitura-ia");

  await navegador.close();

  // PNG de 2x pesa 300 KB por tela. A vitrine e a primeira coisa que carrega:
  // vira JPEG de 1700 px, que e onde a qualidade ainda se sustenta.
  await otimizar();
} finally {
  app.kill();
  ia.close();
}
