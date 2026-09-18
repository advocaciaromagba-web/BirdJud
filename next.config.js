/** @type {import('next').NextConfig} */

// Os cabecalhos de seguranca sao aplicados no middleware (src/middleware.ts),
// porque a CSP leva um nonce por requisicao e aqui nao ha como gera-lo.
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

module.exports = nextConfig;
