import type { MetadataRoute } from "next";

/**
 * O que os buscadores podem indexar.
 *
 * So a vitrine. O sistema de cada escritorio fica atras de login e nao tem o
 * que indexar; pior, um indexador insistente enche o limitador de tentativas
 * de login e gera ruido no registro de seguranca.
 */
export default function robots(): MetadataRoute.Robots {
  const dominio = process.env.DOMINIO_PLATAFORMA ?? "birdjud.com.br";

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/planos", "/cadastro", "/juridico/"],
      disallow: ["/api/", "/plataforma/", "/login", "/conta", "/plano"],
    },
    sitemap: `https://${dominio}/sitemap.xml`,
  };
}
