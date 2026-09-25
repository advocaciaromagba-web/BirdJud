"use client";

import Link from "next/link";
import { useState } from "react";
import { MarcaBirdJud } from "./MarcaBirdJud";

const AREAS = [
  { href: "/#recursos", rotulo: "Recursos" },
  { href: "/#sistema", rotulo: "O sistema por dentro" },
  { href: "/planos", rotulo: "Planos" },
  { href: "/#quem-somos", rotulo: "Quem somos" },
  { href: "/#contato", rotulo: "Contato" },
];

/**
 * O cabecalho das paginas publicas.
 *
 * Fica em todas elas para que quem chegou pela pagina de planos ou por um
 * documento juridico tenha o mesmo caminho de volta — e para que o botao de
 * cadastro esteja sempre a um clique, sem precisar rolar ate o fim.
 *
 * E cliente por um motivo so: no celular o menu recolhe.
 */
export function CabecalhoPublico() {
  const [aberto, setAberto] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <MarcaBirdJud tamanho="pequena" />

        <nav className="ml-6 hidden flex-1 items-center gap-6 text-sm lg:flex">
          {AREAS.map((area) => (
            <Link
              key={area.href}
              href={area.href}
              className="text-slate-600 transition hover:text-slate-900"
            >
              {area.rotulo}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-3 lg:flex">
          <Link href="/cadastro" className="botao-principal">
            Criar o sistema do meu escritorio
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setAberto((estava) => !estava)}
          aria-expanded={aberto}
          aria-label="Menu"
          className="ml-auto grid h-11 w-11 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
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
              d={aberto ? "M6 6l12 12M18 6 6 18" : "M4 7h16M4 12h16M4 17h16"}
            />
          </svg>
        </button>
      </div>

      {aberto ? (
        <div className="border-t border-slate-200 bg-white lg:hidden">
          <nav className="mx-auto grid max-w-6xl gap-1 px-4 py-3 sm:px-6">
            {AREAS.map((area) => (
              <Link
                key={area.href}
                href={area.href}
                onClick={() => setAberto(false)}
                className="flex min-h-11 items-center rounded-lg px-3 text-sm text-slate-700 hover:bg-slate-100"
              >
                {area.rotulo}
              </Link>
            ))}
            <Link
              href="/cadastro"
              onClick={() => setAberto(false)}
              className="botao-principal mt-2"
            >
              Criar o sistema do meu escritorio
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
