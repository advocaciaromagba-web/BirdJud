"use client";

import Link from "next/link";
import { useState } from "react";

export function FormularioRedefinirSenha({ token }: { token: string }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    const nova = String(dados.get("senha") ?? "");
    const confirmacao = String(dados.get("confirmacao") ?? "");

    if (nova !== confirmacao) {
      setErro("As duas senhas precisam ser iguais.");
      return;
    }

    setEnviando(true);
    setErro(null);

    const resposta = await fetch("/api/senha/redefinir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, novaSenha: nova }),
    });
    const json = await resposta.json().catch(() => ({}));
    setEnviando(false);

    if (resposta.ok) {
      setPronto(true);
      return;
    }
    setErro(json.erro ?? "Nao foi possivel trocar a senha.");
  }

  if (pronto) {
    return (
      <div className="mt-6">
        <p className="aviso-ok">
          Senha trocada. As sessoes que estavam abertas foram encerradas, aqui e
          em qualquer outro aparelho.
        </p>
        <Link href="/login" className="botao-principal mt-4">
          Entrar com a senha nova
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="mt-6 grid gap-4">
      <div>
        <label htmlFor="nova-senha" className="rotulo">
          Senha nova
        </label>
        <input
          id="nova-senha"
          name="senha"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className="campo"
        />
        <p className="ajuda esquerda">Minimo de 10 caracteres.</p>
      </div>

      <div>
        <label htmlFor="confirmacao-senha" className="rotulo">
          Repita a senha nova
        </label>
        <input
          id="confirmacao-senha"
          name="confirmacao"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className="campo"
        />
      </div>

      {erro ? <p className="aviso-erro">{erro}</p> : null}

      <button type="submit" disabled={enviando} className="botao-principal">
        {enviando ? "Trocando..." : "Trocar a senha"}
      </button>
    </form>
  );
}
