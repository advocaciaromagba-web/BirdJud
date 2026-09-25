"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { PROVEDOR_OPERADOR } from "@/lib/auth-comum";

export function FormularioOperador() {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);

    const dados = new FormData(evento.currentTarget);
    const resposta = await signIn(PROVEDOR_OPERADOR, {
      redirect: false,
      email: String(dados.get("email") ?? ""),
      senha: String(dados.get("senha") ?? ""),
    });
    setEnviando(false);

    if (resposta?.ok) {
      window.location.href = "/plataforma";
      return;
    }
    setErro("Nao foi possivel entrar.");
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
          className="campo"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Senha
        <input
          name="senha"
          type="password"
          required
          autoComplete="current-password"
          className="campo"
        />
      </label>
      {erro ? <p className="text-sm text-red-700">{erro}</p> : null}
      <button
        type="submit"
        disabled={enviando}
        className="botao-principal justify-self-start"
      >
        {enviando ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
