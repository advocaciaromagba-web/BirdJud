"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Campo = {
  nome: string;
  rotulo: string;
  tipo?: "text" | "email" | "password" | "date" | "datetime-local" | "select";
  obrigatorio?: boolean;
  opcoes?: { valor: string; rotulo: string }[];
};

/**
 * Formulario de criacao usado por clientes, processos, agenda e usuarios.
 *
 * Um so lugar para o tratamento de erro da API e para o recarregamento da
 * lista depois de gravar.
 */
export function FormularioCriar({
  rota,
  campos,
  textoBotao = "Adicionar",
}: {
  rota: string;
  campos: Campo[];
  textoBotao?: string;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);

    const form = evento.currentTarget;
    const dados = new FormData(form);
    const corpo: Record<string, string> = {};
    for (const campo of campos) {
      const valor = String(dados.get(campo.nome) ?? "").trim();
      if (valor) corpo[campo.nome] = valor;
    }

    const resposta = await fetch(rota, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    setEnviando(false);

    if (resposta.ok) {
      form.reset();
      router.refresh();
      return;
    }
    const json = await resposta.json().catch(() => ({}));
    setErro(json.erro ?? "Nao foi possivel gravar.");
  }

  return (
    <form onSubmit={enviar} className="mt-6 grid gap-3 rounded border border-neutral-200 p-4">
      {campos.map((campo) => (
        <label key={campo.nome} className="grid gap-1 text-sm">
          {campo.rotulo}
          {campo.tipo === "select" ? (
            <select
              name={campo.nome}
              required={campo.obrigatorio}
              className="rounded border border-neutral-300 px-3 py-2"
            >
              <option value="">—</option>
              {campo.opcoes?.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {opcao.rotulo}
                </option>
              ))}
            </select>
          ) : (
            <input
              name={campo.nome}
              type={campo.tipo ?? "text"}
              required={campo.obrigatorio}
              className="rounded border border-neutral-300 px-3 py-2"
            />
          )}
        </label>
      ))}
      {erro ? <p className="text-sm text-red-700">{erro}</p> : null}
      <button
        type="submit"
        disabled={enviando}
        className="justify-self-start rounded bg-marca px-4 py-2 font-semibold text-white disabled:opacity-60"
      >
        {enviando ? "Gravando..." : textoBotao}
      </button>
    </form>
  );
}
