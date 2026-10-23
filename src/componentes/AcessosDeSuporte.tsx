"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type AcessoNaTela = { id: string; quando: string; operador: string; motivo: string; situacao: string; aberto: boolean };

/** Os acessos de suporte do escritorio, com o botao de encerrar o que esta aberto. */
export function AcessosDeSuporte({ escritorioId, acessos }: { escritorioId: string; acessos: AcessoNaTela[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  if (!acessos.length) return <p className="vazio mt-2">Nenhum acesso de suporte registrado.</p>;
  return (
    <ul className="mt-2 divide-y divide-slate-200 text-sm">
      {acessos.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span>
            {a.quando} · {a.operador} · {a.situacao}
            <span className="block text-slate-500">{a.motivo}</span>
          </span>
          {a.aberto ? (
            <button
              type="button"
              className="botao-discreto"
              disabled={ocupado}
              onClick={async () => {
                setOcupado(true);
                await fetch(`/api/plataforma/escritorios/${escritorioId}/suporte`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ acao: "encerrar", acessoId: a.id }),
                });
                setOcupado(false);
                router.refresh();
              }}
            >
              Encerrar agora
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
