import { headers } from "next/headers";
import { escritorioPorSlug, MARCA_NEUTRA, slugDoHost } from "@/lib/escritorio";

export default async function Pagina() {
  const slug = slugDoHost(headers().get("host"));
  const marca = (slug ? await escritorioPorSlug(slug) : null) ?? MARCA_NEUTRA;
  const daPlataforma = marca.id === null;

  return (
    <main className="mx-auto max-w-2xl p-10">
      <p className="text-sm uppercase tracking-wide text-marca">BirdJud</p>
      <h1 className="mt-2 text-3xl font-bold">{marca.nome}</h1>
      <p className="mt-4 text-neutral-600">
        {daPlataforma
          ? "Nenhum escritorio identificado neste endereco. Cada escritorio atende em seu proprio subdominio."
          : "Sistema no ar. Fase 1: autenticacao e telas do nucleo."}
      </p>
    </main>
  );
}
