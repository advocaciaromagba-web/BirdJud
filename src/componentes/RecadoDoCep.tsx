"use client";

import type { EstadoDoCep } from "./consultaDeCep";

/** O que a consulta do CEP achou, embaixo do campo. Fala para leitor de tela tambem. */
export function RecadoDoCep({ estado }: { estado: EstadoDoCep }) {
  if (estado.tipo === "parado") return null;
  const classe =
    estado.tipo === "buscando"
      ? "text-slate-500"
      : estado.tipo === "achou"
        ? estado.geral
          ? "text-amber-800"
          : "text-emerald-700"
        : "text-amber-800";
  return (
    <p className={`mt-1 text-xs ${classe}`} role="status" aria-live="polite">
      {estado.tipo === "buscando" ? "Buscando o endereco..." : estado.texto}
    </p>
  );
}
