"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { PROVEDOR } from "@/lib/auth-comum";

// O escritorio nao e passado daqui: o servidor o resolve pelo endereco.
export function FormularioLogin() {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);

    const dados = new FormData(evento.currentTarget);
    const resposta = await signIn(PROVEDOR, {
      redirect: false,
      email: String(dados.get("email") ?? ""),
      senha: String(dados.get("senha") ?? ""),
      codigo: String(dados.get("codigo") ?? ""),
    });

    setEnviando(false);
    if (resposta?.ok) {
      window.location.href = "/";
      return;
    }
    // Mensagem unica de proposito: nao dizer se o e-mail existe, se a senha
    // esta errada ou se o usuario esta bloqueado.
    setErro("Nao foi possivel entrar. Confira os dados e tente novamente.");
  }

  return (
    <form onSubmit={enviar} className="mt-6 grid gap-3">
      <label className="grid gap-1 text-sm">
        E-mail
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Senha
        <input
          name="senha"
          type="password"
          required
          autoComplete="current-password"
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Codigo de 6 digitos <span className="text-neutral-500">(se ativado)</span>
        <input
          name="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>
      {erro ? <p className="text-sm text-red-700">{erro}</p> : null}
      <button
        type="submit"
        disabled={enviando}
        className="mt-2 rounded bg-marca px-4 py-2 font-semibold text-white disabled:opacity-60"
      >
        {enviando ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
