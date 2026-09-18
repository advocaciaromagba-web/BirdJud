// Politica de seguranca de conteudo com nonce por requisicao.
//
// Sem nonce, a CSP precisaria de 'unsafe-inline' em script-src — e o Next
// injeta scripts inline proprios. Com nonce + 'strict-dynamic', so o que a
// pagina realmente emitiu roda, e um script injetado por terceiro nao.
export const CABECALHO_NONCE = "x-nonce";

export function montarCSP(
  nonce: string,
  producao: boolean,
  /**
   * `upgrade-insecure-requests` so entra quando a propria requisicao veio por
   * HTTPS. Emitido em um ambiente servido por HTTP, ele faz o navegador tentar
   * buscar os proprios scripts da pagina em HTTPS e a aplicacao nao carrega.
   */
  seguro = producao
): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic' faz o navegador confiar no que o script com nonce
    // carregar; 'unsafe-eval' so em desenvolvimento, que o Next usa no refresh.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${producao ? "" : " 'unsafe-eval'"}`,
    // O Tailwind emite estilo inline: aqui o 'unsafe-inline' continua, e o
    // risco e bem menor do que em script.
    "style-src 'self' 'unsafe-inline'",
    // data: por causa do QR Code do segundo fator; https: pela logo do escritorio.
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(seguro ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export const CABECALHOS_DE_SEGURANCA: [string, string][] = [
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"],
];
