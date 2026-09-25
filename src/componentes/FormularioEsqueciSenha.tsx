"use client";

import Link from "next/link";
import { useState } from "react";

export function FormularioEsqueciSenha() {
  const [enviando, setEnviando] = useState(false);
  const [recado, setRecado] = useState<{ texto: string; ok: boolean } | null>(
    null,
  );

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setRecado(null);

    const dados = new FormData(evento.currentTarget);
    const resposta = await fetch("/api/senha/esqueci", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: String(dados.get("email") ?? "") }),
    });
    const json = await resposta.json().catch(() => ({}));
    setEnviando(false);
    setRecado({
      texto: resposta.ok
        ? (json.detalhe ?? "Pedido recebido.")
        : (json.erro ?? "Nao foi possivel enviar o link."),
      ok: resposta.ok,
    });
  }

  return (
    <form onSubmit={enviar} className="mt-6 grid gap-4">
      <div>
        <label htmlFor="esqueci-email" className="rotulo">
          Seu e-mail
        </label>
        <input
          id="esqueci-email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="campo"
        />
        <p className="ajuda esquerda">
          O mesmo e-mail com que voce entra neste endereco.
        </p>
      </div>

      {recado ? (
        <p className={recado.ok ? "aviso-ok" : "aviso-erro"}>{recado.texto}</p>
      ) : null}

      <button type="submit" disabled={enviando} className="botao-principal">
        {enviando ? "Enviando..." : "Enviar o link"}
      </button>

      <Link href="/login" className="botao-discreto justify-self-start">
        Voltar para a entrada
      </Link>
    </form>
  );
}
