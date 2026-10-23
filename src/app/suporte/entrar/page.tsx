import { EntradaDeSuporte } from "@/componentes/EntradaDeSuporte";

export const dynamic = "force-dynamic";

export const metadata = { title: "Entrada de suporte — BirdJud", robots: { index: false, follow: false } };

/** Destino do link de uso unico gerado no console (src/lib/acesso-de-suporte.ts). */
export default async function PaginaEntradaDeSuporte({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <main className="pagina-estreita">
      <h1>Entrada de suporte</h1>
      <EntradaDeSuporte token={t ?? ""} />
    </main>
  );
}
