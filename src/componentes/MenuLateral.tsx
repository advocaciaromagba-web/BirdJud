"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icone, type NomeDeIcone } from "./Icone";
import { CampoDeBusca } from "./CampoDeBusca";
import { Sair } from "./Sair";

type Item = { href: string; rotulo: string; icone: NomeDeIcone };
type Grupo = { grupo: string; titulo: string; areas: Item[] };

function ehAtual(href: string, caminho: string): boolean {
  return href === "/"
    ? caminho === "/"
    : caminho === href || caminho.startsWith(`${href}/`);
}

/**
 * O menu em si.
 *
 * E cliente por um motivo so: marcar onde a pessoa esta. Saber em que tela se
 * esta e metade da orientacao em um sistema com doze areas.
 *
 * No celular ele vira gaveta. Fechada por padrao, porque doze itens
 * empilhados comiam meia tela antes do conteudo.
 */
export function MenuLateral({
  marca,
  grupos,
}: {
  marca: React.ReactNode;
  grupos: Grupo[];
}) {
  const caminho = usePathname() ?? "/";
  const [aberto, setAberto] = useState(false);

  const lista = (
    <nav className="grid gap-5 px-3 py-4">
      {grupos.map((bloco) => (
        <div key={bloco.grupo}>
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {bloco.titulo}
          </p>
          <ul className="grid gap-0.5">
            {bloco.areas.map((area) => {
              const atual = ehAtual(area.href, caminho);
              return (
                <li key={area.href}>
                  <Link
                    href={area.href}
                    onClick={() => setAberto(false)}
                    aria-current={atual ? "page" : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition ${
                      atual
                        ? "font-semibold text-[color:var(--marca-primaria)]"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                    style={
                      atual
                        ? {
                            backgroundColor:
                              "color-mix(in srgb, var(--marca-primaria) 10%, white)",
                          }
                        : undefined
                    }
                  >
                    <Icone nome={area.icone} />
                    {area.rotulo}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Tela larga: o menu fica sempre visivel. */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
        <div className="sticky top-0 max-h-dvh overflow-y-auto">
          <div className="px-3 pt-4">{marca}</div>
          {lista}
        </div>
      </aside>

      {/* Celular e tablet: barra de cima com a marca, a busca e a gaveta. */}
      <div className="lg:hidden">
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2 px-3 py-2">
            <button
              type="button"
              onClick={() => setAberto((estava) => !estava)}
              aria-expanded={aberto}
              aria-label="Menu"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path
                  d={
                    aberto ? "M6 6l12 12M18 6 6 18" : "M4 7h16M4 12h16M4 17h16"
                  }
                />
              </svg>
            </button>
            <div className="min-w-0 flex-1">{marca}</div>
            <Sair />
          </div>
          <div className="px-3 pb-2">
            <CampoDeBusca />
          </div>
        </div>

        {aberto ? (
          <div className="border-b border-slate-200 bg-white">{lista}</div>
        ) : null}
      </div>
    </>
  );
}
