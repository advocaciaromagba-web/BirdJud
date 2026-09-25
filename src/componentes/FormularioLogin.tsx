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
    <form onSubmit={enviar} className="mt-6 grid gap-4">
      <div>
        <label htmlFor="login-email" className="rotulo">
          E-mail
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="campo"
        />
      </div>
      <div>
        <label htmlFor="login-senha" className="rotulo">
          Senha
        </label>
        <input
          id="login-senha"
          name="senha"
          type="password"
          required
          autoComplete="current-password"
          className="campo"
        />
      </div>
      <div>
        <label htmlFor="login-codigo" className="rotulo">
          Codigo de 6 digitos
        </label>
        <input
          id="login-codigo"
          name="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          className="campo"
        />
        <p className="ajuda">
          So se o segundo fator estiver ativado na sua conta.
        </p>
      </div>
      {erro ? <p className="aviso-erro">{erro}</p> : null}
      <button type="submit" disabled={enviando} className="botao-principal">
        {enviando ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
