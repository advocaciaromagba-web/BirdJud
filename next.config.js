/** @type {import('next').NextConfig} */

// Cabecalhos de seguranca aplicados a todas as respostas.
//
// A CSP nao usa 'unsafe-inline' em script-src: o Next injeta scripts inline
// proprios, entao 'strict-dynamic' com nonce seria o certo — e exige middleware
// gerando nonce por requisicao. Ate la, 'unsafe-inline' fica so em style-src,
// de que o Tailwind precisa.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // data: por causa do QR Code do segundo fator; https: pela logo do escritorio.
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const CABECALHOS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:caminho*", headers: CABECALHOS }];
  },
};

module.exports = nextConfig;
