import type { MetadataRoute } from "next";
import { DOCUMENTOS } from "@/lib/juridico";
import { dominioDaPlataforma } from "@/lib/dominio";

/** As paginas publicas da plataforma. O sistema do escritorio nao entra. */
export default function sitemap(): MetadataRoute.Sitemap {
  const dominio = dominioDaPlataforma();
  const base = `https://${dominio}`;
  const agora = new Date();

  return [
    { url: base, lastModified: agora, priority: 1 },
    { url: `${base}/planos`, lastModified: agora, priority: 0.8 },
    { url: `${base}/cadastro`, lastModified: agora, priority: 0.8 },
    ...DOCUMENTOS.map((documento) => ({
      url: `${base}/juridico/${documento.caminho}`,
      lastModified: agora,
      priority: 0.3,
    })),
  ];
}
