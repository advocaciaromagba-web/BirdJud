// Confere o sistema em tela pequena, com navegador de verdade.
//
//   npm run conferir-celular          (com a aplicacao ja rodando na 3000)
//
// Duas coisas que so aparecem assim, e que ja apareceram aqui:
//
//   ROLAGEM LATERAL — uma palavra sem espaco (chave de nota, e-mail, link)
//   alarga a pagina inteira, e o navegador responde afastando o zoom: letra
//   miuda em todo o sistema por causa de uma linha.
//
//   ALVO PEQUENO — link de 20px de altura. O dedo acerta cerca de 9mm; no
//   corredor do forum, com pressa, nao acerta.
//
// O Chromium nao deixa forjar o cabecalho Host, entao o DNS do proprio
// navegador aponta o subdominio do escritorio de teste para a maquina local.
import { chromium, devices } from "playwright";

const telas = [
  { nome: "celular", ...devices["iPhone 13"] },
  { nome: "tablet", viewport: { width: 768, height: 1024 } },
];

const paginas = ["/", "/processos", "/publicacoes", "/cobrancas", "/arquivos", "/notas", "/agenda", "/conta"];

// O Chromium nao deixa forjar o cabecalho Host: em vez disso, o DNS do
// proprio navegador aponta o subdominio para a maquina local.
const navegador = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--host-resolver-rules=MAP *.birdjud.com.br 127.0.0.1"],
});
for (const tela of telas) {
  const contexto = await navegador.newContext({
    ...tela,
    baseURL: "http://teste.birdjud.com.br:3000",
  });
  const pagina = await contexto.newPage();

  // login
  await pagina.goto("/login");
  await pagina.fill('input[name="email"]', "admin@teste.br");
  await pagina.fill('input[name="senha"]', "senha-de-teste-123");
  await pagina.click('button[type="submit"]');
  await pagina.waitForURL("**/", { timeout: 15000 }).catch(() => {});

  for (const caminho of paginas) {
    await pagina.goto(caminho, { waitUntil: "networkidle" });
    const largura = pagina.viewportSize().width;
    const medidas = await pagina.evaluate(() => {
      const doc = document.documentElement;
      // Elementos que passam da largura da janela: o que causa rolagem lateral.
      const vazando = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) {
          vazando.push(`${el.tagName.toLowerCase()}.${(el.className||"").toString().slice(0,40)} (${Math.round(r.left)}..${Math.round(r.right)})`);
        }
      }
      // Alvos de toque pequenos demais (menos de 32px de altura).
      const pequenos = [...document.querySelectorAll("a,button,input,select")]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.height < 32; })
        .map((el) => `${el.tagName.toLowerCase()}: ${(el.textContent||el.getAttribute("name")||"").trim().slice(0,30)}`);
      return {
        rolagemLateral: doc.scrollWidth > window.innerWidth + 1,
        scrollWidth: doc.scrollWidth,
        vazando: vazando.slice(0, 4),
        pequenos: [...new Set(pequenos)].slice(0, 4),
      };
    });
    console.log(
      `${tela.nome.padEnd(8)} ${caminho.padEnd(14)} janela ${largura} · conteudo ${medidas.scrollWidth}` +
        (medidas.rolagemLateral ? "  ROLAGEM LATERAL" : "") +
        (medidas.vazando.length ? `\n         vaza: ${medidas.vazando.join(" | ")}` : "") +
        (medidas.pequenos.length ? `\n         alvo pequeno: ${medidas.pequenos.join(" | ")}` : "")
    );
  }
  await contexto.close();
}
await navegador.close();
