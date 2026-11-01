"use client";

import { useId, useMemo, useRef, useState } from "react";

import { filtrarClientes, type ClienteParaEscolher } from "@/lib/busca-de-cliente";

export type { ClienteParaEscolher };

/**
 * Campo de cliente com busca, no lugar do <select>.
 *
 * O menu nativo do navegador se dimensiona pela opcao mais comprida: com
 * centenas de clientes, varios com nome de empresa, ele passava da largura da
 * janela e cortava o comeco dos nomes. Aqui o nome quebra em linha nova, o
 * CPF/CNPJ aparece embaixo e da para achar digitando parte do nome ou do
 * numero. O botao de limpar devolve o campo ao vazio — no <select> isso era
 * escolher a opcao em branco.
 *
 * Funciona controlado (valor + aoMudar) ou dentro de formulario comum (name +
 * valorInicial), com um campo escondido levando o id.
 */
export function SeletorDeCliente({
  clientes,
  valor,
  valorInicial = null,
  aoMudar,
  name,
  vazio = "Nenhum",
  rotulo,
  required = false,
  className = "",
}: {
  clientes: ClienteParaEscolher[];
  valor?: string | null;
  valorInicial?: string | null;
  aoMudar?: (id: string | null) => void;
  name?: string;
  /** O que o campo diz quando nenhum cliente esta escolhido. */
  vazio?: string;
  rotulo?: string;
  required?: boolean;
  className?: string;
}) {
  const controlado = valor !== undefined;
  const [interno, setInterno] = useState<string | null>(valorInicial);
  const escolhido = controlado ? valor || null : interno;
  const atual = clientes.find((c) => c.id === escolhido) ?? null;

  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const lista = useMemo(() => filtrarClientes(clientes, termo), [clientes, termo]);
  const idDaLista = useId();
  const campo = useRef<HTMLInputElement>(null);

  function escolher(id: string | null) {
    if (!controlado) setInterno(id);
    aoMudar?.(id);
    setTermo("");
    setAberto(false);
  }

  return (
    <div className={`relative ${className}`}>
      {name ? <input type="hidden" name={name} value={escolhido ?? ""} /> : null}
      <input
        ref={campo}
        type="text"
        role="combobox"
        aria-expanded={aberto}
        aria-controls={idDaLista}
        aria-autocomplete="list"
        aria-label={rotulo ?? "Cliente"}
        className="campo"
        // O espaco do botao de limpar vai em style: a classe .campo do
        // globals.css ganharia de uma utilitaria pr-9.
        style={atual ? { paddingRight: "2.25rem" } : undefined}
        placeholder={atual ? atual.nome : vazio}
        value={aberto ? termo : (atual?.nome ?? "")}
        required={required && !escolhido}
        onFocus={() => {
          setAberto(true);
          setAtivo(0);
        }}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onChange={(e) => {
          setTermo(e.target.value);
          setAberto(true);
          setAtivo(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAberto(true);
            setAtivo((a) => Math.min(a + 1, lista.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAtivo((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && aberto) {
            e.preventDefault();
            if (lista[ativo]) escolher(lista[ativo].id);
          } else if (e.key === "Escape") {
            setAberto(false);
          }
        }}
      />
      {atual && !aberto ? (
        <button
          type="button"
          aria-label="Limpar cliente"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 text-lg leading-none text-slate-400 hover:text-slate-700"
          onClick={() => {
            escolher(null);
            campo.current?.focus();
          }}
        >
          ×
        </button>
      ) : null}
      {aberto ? (
        <ul
          id={idDaLista}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full min-w-[16rem] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {lista.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={c.id === escolhido}
              className={`cursor-pointer px-3 py-1.5 ${i === ativo ? "bg-slate-100" : ""} ${c.id === escolhido ? "font-semibold" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(c.id);
              }}
              onMouseEnter={() => setAtivo(i)}
            >
              <span className="block break-words text-slate-900">{c.nome}</span>
              {c.documento ? <span className="block text-xs text-slate-500">{c.documento}</span> : null}
            </li>
          ))}
          {lista.length === 0 ? <li className="px-3 py-2 text-slate-500">Nenhum cliente com esse nome ou número.</li> : null}
          {!termo && clientes.length > lista.length ? (
            <li className="px-3 py-1.5 text-xs text-slate-500">Digite para procurar entre os {clientes.length} clientes.</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
