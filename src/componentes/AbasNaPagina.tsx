"use client";

import { useEffect, useState, type ReactNode } from "react";

export type Aba = { id: string; rotulo: string; conteudo: ReactNode };

/**
 * Abas dentro de uma pagina, numa fileira grudada no topo. A aba escolhida vai
 * para o endereco (#despesas-fixas): recarregar, voltar de outra tela ou mandar
 * o link abre onde a pessoa estava. As outras abas continuam montadas
 * (escondidas), para formulario pela metade nao se perder na troca.
 */
export function AbasNaPagina({ abas, rotulo }: { abas: Aba[]; rotulo: string }) {
  const [ativa, setAtiva] = useState(abas[0]?.id ?? "");

  useEffect(() => {
    const doEndereco = () => {
      const h = window.location.hash.slice(1);
      if (abas.some((a) => a.id === h)) setAtiva(h);
    };
    doEndereco();
    window.addEventListener("hashchange", doEndereco);
    return () => window.removeEventListener("hashchange", doEndereco);
  }, [abas]);

  function escolher(id: string) {
    setAtiva(id);
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${id}`);
  }

  return (
    <div className="mt-4">
      <div className="sticky top-0 z-10 -mx-1 overflow-x-auto bg-[color:var(--off-white)] px-1 py-2">
        <div role="tablist" aria-label={rotulo} className="flex w-max gap-1 border-b border-slate-200">
          {abas.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              id={`aba-${a.id}`}
              aria-selected={a.id === ativa}
              aria-controls={`painel-${a.id}`}
              onClick={() => escolher(a.id)}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                a.id === ativa ? "border-slate-900 font-semibold text-slate-900" : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
      </div>
      {abas.map((a) => (
        <div key={a.id} role="tabpanel" id={`painel-${a.id}`} aria-labelledby={`aba-${a.id}`} hidden={a.id !== ativa} className="min-w-0">
          {a.conteudo}
        </div>
      ))}
    </div>
  );
}
