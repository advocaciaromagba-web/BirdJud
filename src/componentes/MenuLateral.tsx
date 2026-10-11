"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { iniciaisDe } from "@/lib/nomes";
import { Icone, type NomeDeIcone } from "./Icone";
import { CampoDeBusca } from "./CampoDeBusca";

export type ItemDeMenu = { href: string; rotulo: string; icone: NomeDeIcone };

function ehAtual(href: string, caminho: string): boolean {
  return href === "/"
    ? caminho === "/"
    : caminho === href || caminho.startsWith(`${href}/`);
}

const NOME_DO_PAPEL: Record<string, string> = {
  ADMIN: "Administrador(a)",
  ADVOGADO: "Advogado(a)",
  USUARIO: "Equipe",
};

/**
 * O menu lateral.
 *
 * E uma barra ESCURA, e a cor dela sai da marca do escritorio (ver menuDe em
 * src/lib/identidade.ts): a barra puxa a cor principal para perto do preto, e
 * o item atual usa a cor de destaque. Escuro de um lado, claro do outro, dá
 * ao sistema a separacao que a foto de referencia tem — e, sendo derivada,
 * cada escritorio recebe a SUA barra, nao a de outro.
 *
 * Lista PLANA, sem titulo de grupo. Agrupar em Trabalho/Dinheiro/Escritorio
 * custava tres linhas de cabecalho e uma pergunta a cada clique ("isso e
 * dinheiro ou escritorio?"). A ordem resolve sozinha: o dia a dia em cima, o
 * dinheiro no meio, a administracao embaixo.
 *
 * Itens COMPACTOS (40px, nao 44) de proposito. A barra tem altura de tela e
 * rola por dentro: item que nao cabe some sem aviso, e numa captura de
 * 1125px tres areas — Modelos, Arquivos e Equipe — tinham ficado abaixo da
 * dobra. Em lista agrupada a pagina inteira rolava e o problema nao existia.
 * Se um dia a lista crescer a ponto de nao caber nem assim, o certo e cortar
 * item, nao encolher mais.
 *
 * E cliente por um motivo so: marcar onde a pessoa esta.
 *
 * No celular vira gaveta que desliza por cima, com o fundo escurecido —
 * empurrar o conteudo fazia a pagina inteira pular.
 */
export function MenuLateral({
  marca,
  itens,
  rodape,
  nomeUsuario,
  papel,
}: {
  marca: React.ReactNode;
  itens: ItemDeMenu[];
  /** Configuracoes e afins: mesmo visual, separados por uma linha. */
  rodape: ItemDeMenu[];
  nomeUsuario: string;
  papel: string;
}) {
  const caminho = usePathname() ?? "/";
  const [aberto, setAberto] = useState(false);

  const link = (item: ItemDeMenu) => {
    const atual = ehAtual(item.href, caminho);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={() => setAberto(false)}
          aria-current={atual ? "page" : undefined}
          className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors"
          style={
            atual
              ? {
                  backgroundColor: "var(--menu-ativo)",
                  color: "var(--menu-sobre-ativo)",
                  fontWeight: 600,
                }
              : { color: "var(--menu-texto)" }
          }
          /*
           * O realce do cursor vai por evento, e nao por classe: a cor sai de
           * variavel CSS calculada por escritorio, e Tailwind nao gera classe
           * de hover para valor que so existe em tempo de execucao.
           */
          onMouseEnter={(e) => {
            if (!atual) e.currentTarget.style.backgroundColor = "var(--menu-realce)";
          }}
          onMouseLeave={(e) => {
            if (!atual) e.currentTarget.style.backgroundColor = "";
          }}
        >
          <span className="shrink-0">
            <Icone nome={item.icone} />
          </span>
          <span className="truncate">{item.rotulo}</span>
        </Link>
      </li>
    );
  };

  const corpo = (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--menu-fundo)" }}
    >
      {/* O logotipo em cartao branco: marca de escritorio quase sempre foi
          desenhada para fundo claro, e sobre a barra escura ela sumiria. */}
      <div className="p-3">
        <div className="rounded-lg bg-white px-3 py-2">{marca}</div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3">
        <ul className="grid gap-0.5">{itens.map(link)}</ul>
      </nav>

      {rodape.length > 0 ? (
        <div
          className="border-t px-3 py-2"
          style={{ borderColor: "var(--menu-borda)" }}
        >
          <ul className="grid gap-0.5">{rodape.map(link)}</ul>
        </div>
      ) : null}

      <div
        className="border-t p-3"
        style={{ borderColor: "var(--menu-borda)" }}
      >
        <div className="mb-2 flex items-center gap-2">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold"
            style={{
              backgroundColor: "var(--menu-ativo)",
              color: "var(--menu-sobre-ativo)",
            }}
          >
            {iniciaisDe(nomeUsuario)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm text-white">{nomeUsuario}</p>
            <p className="text-xs" style={{ color: "var(--menu-texto-fraco)" }}>
              {NOME_DO_PAPEL[papel] ?? papel.toLowerCase()}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full rounded-xl border px-3 py-2 text-xs transition-colors"
          style={{
            borderColor: "var(--menu-borda)",
            color: "var(--menu-texto)",
          }}
        >
          Sair
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Tela larga: a barra fica sempre visivel. */}
      <aside aria-label="Menu principal" className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-0 h-dvh">{corpo}</div>
      </aside>

      {/* Celular: barra de cima escura, com o botao da gaveta. */}
      <div className="lg:hidden">
        <div
          className="sticky top-0 z-30"
          style={{ backgroundColor: "var(--menu-fundo)" }}
        >
          <div className="flex items-center gap-2 px-3 py-2">
            <button
              type="button"
              onClick={() => setAberto(true)}
              aria-expanded={aberto}
              aria-label="Abrir menu"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg"
              style={{ color: "var(--menu-texto)" }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="min-w-0 flex-1 rounded-lg bg-white px-2 py-1">
              {marca}
            </div>
          </div>
          <div className="px-3 pb-2">
            <CampoDeBusca />
          </div>
        </div>

        {aberto ? (
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setAberto(false)}
            aria-hidden="true"
          />
        ) : null}

        <aside
          aria-label="Menu principal no celular"
          className={`fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-200 ${
            aberto ? "translate-x-0" : "-translate-x-full"
          }`}
          aria-hidden={!aberto}
        >
          {corpo}
        </aside>
      </div>
    </>
  );
}
