"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Campo da barra de navegacao. A busca em si acontece na pagina /busca. */
export function CampoDeBusca({ termoInicial = "" }: { termoInicial?: string }) {
  const router = useRouter();
  const [termo, setTermo] = useState(termoInicial);

  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        const limpo = termo.trim();
        if (limpo.length >= 3) router.push(`/busca?q=${encodeURIComponent(limpo)}`);
      }}
      className="ml-auto"
    >
      <input
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder="Buscar cliente, processo, publicacao…"
        aria-label="Buscar"
        className="w-56 rounded border border-neutral-300 px-3 py-1 text-sm focus:border-marca focus:outline-none"
      />
    </form>
  );
}
