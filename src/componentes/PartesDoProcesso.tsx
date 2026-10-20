"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const POLO: Record<string, string> = { A: "polo ativo", P: "polo passivo" };

/**
 * As partes do processo, como o DJEN informou. Sem cliente ligado, cada
 * parte pode virar cliente com um clique — e o processo passa a ser dele.
 */
export function PartesDoProcesso({
  processoId,
  partes,
  temCliente,
}: {
  processoId: string;
  partes: { nome: string; polo: string | null }[];
  temCliente: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function tornarCliente(nome: string) {
    if (!window.confirm(`Cadastrar "${nome}" como cliente e ligar este processo a ele?`)) return;
    setOcupado(nome);
    setErro(null);
    const r = await fetch(`/api/processos/${processoId}/cliente-da-parte`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome }),
    });
    const json = await r.json().catch(() => ({}));
    setOcupado(null);
    if (!r.ok) return setErro(json.erro ?? "Não consegui cadastrar.");
    router.refresh();
  }

  if (partes.length === 0) return <span className="text-slate-400">—</span>;
  return (
    <ul className="grid gap-0.5 text-xs">
      {partes.slice(0, 6).map((p) => (
        <li key={`${p.nome}-${p.polo}`} className="flex flex-wrap items-center gap-1">
          <span className="text-slate-700">{p.nome}</span>
          {p.polo && POLO[p.polo] ? <span className="text-slate-400">({POLO[p.polo]})</span> : null}
          {!temCliente ? (
            <button
              type="button"
              disabled={ocupado !== null}
              onClick={() => tornarCliente(p.nome)}
              className="text-marca underline disabled:opacity-50"
            >
              {ocupado === p.nome ? "..." : "tornar cliente"}
            </button>
          ) : null}
        </li>
      ))}
      {erro ? <li className="text-red-700">{erro}</li> : null}
    </ul>
  );
}
