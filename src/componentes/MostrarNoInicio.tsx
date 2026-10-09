"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Liga e desliga o cartao do roteiro na tela inicial. */
export function MostrarNoInicio({ dispensado }: { dispensado: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function trocar() {
    setOcupado(true);
    await fetch("/api/primeiros-passos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ acao: dispensado ? "mostrar" : "dispensar" }),
    });
    setOcupado(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={trocar}
      disabled={ocupado}
      className="mt-3 text-sm text-slate-500 underline-offset-2 hover:underline disabled:opacity-60"
    >
      {dispensado ? "Mostrar o roteiro na tela inicial" : "Esconder o roteiro da tela inicial"}
    </button>
  );
}
