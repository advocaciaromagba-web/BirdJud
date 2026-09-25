"use client";

import { useState } from "react";
import { DOCUMENTOS, VERSAO_DOS_DOCUMENTOS } from "@/lib/juridico";

export function FormularioCadastro({
  dominio,
  dias,
}: {
  dominio: string;
  dias: number;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState<{ endereco: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);

    const dados = new FormData(evento.currentTarget);
    const resposta = await fetch("/api/cadastro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        escritorio: String(dados.get("escritorio") ?? ""),
        slug: String(dados.get("slug") ?? "").toLowerCase(),
        nome: String(dados.get("nome") ?? ""),
        email: String(dados.get("email") ?? ""),
        senha: String(dados.get("senha") ?? ""),
        aceite: dados.get("aceite") === "on",
        versaoAceita: VERSAO_DOS_DOCUMENTOS,
      }),
    });
    const json = await resposta.json().catch(() => ({}));
    setEnviando(false);

    if (resposta.ok) {
      setPronto({ endereco: json.endereco });
      return;
    }
    setErro(json.erro ?? "Nao foi possivel cadastrar.");
  }

  if (pronto) {
    return (
      <div className="mt-8 rounded border border-neutral-200 p-5">
        <h2 className="font-semibold">Escritorio criado</h2>
        <p className="mt-2 text-neutral-700">
          O endereco do seu escritorio e{" "}
          <strong className="text-marca">{pronto.endereco}</strong>. Entre por
          ele com o e-mail e a senha que voce acabou de definir.
        </p>
        <p className="mt-2 text-sm text-neutral-500">
          Periodo de teste de {dias} dias. A primeira fatura so e gerada depois
          disso.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="mt-8 grid gap-3">
      <label className="grid gap-1 text-sm">
        Nome do escritorio
        <input
          name="escritorio"
          required
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Endereco do sistema
        <span className="text-xs text-neutral-500">
          Vai ficar assim: <code>seu-escritorio.{dominio}</code>
        </span>
        <input
          name="slug"
          required
          pattern="[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]"
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Seu nome
        <input
          name="nome"
          required
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Seu e-mail
        <input
          name="email"
          type="email"
          required
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Senha (minimo 10 caracteres)
        <input
          name="senha"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className="rounded border border-neutral-300 px-3 py-2"
        />
      </label>
      <label className="mt-2 grid grid-cols-[auto_1fr] items-start gap-2 text-sm">
        <input
          name="aceite"
          type="checkbox"
          required
          className="mt-1 accent-[var(--marca-primaria)]"
        />
        <span>
          Li e aceito{" "}
          {DOCUMENTOS.map((documento, indice) => (
            <span key={documento.chave}>
              {indice > 0
                ? indice === DOCUMENTOS.length - 1
                  ? " e "
                  : ", "
                : ""}
              <a
                href={`/juridico/${documento.caminho}`}
                target="_blank"
                rel="noreferrer"
                className="text-marca underline"
              >
                {documento.rotulo}
              </a>
            </span>
          ))}
          .
          <span className="block text-xs text-neutral-500">
            Versao {VERSAO_DOS_DOCUMENTOS}. O aceite fica registrado com data e
            hora.
          </span>
        </span>
      </label>

      {erro ? <p className="text-sm text-red-700">{erro}</p> : null}
      <button
        type="submit"
        disabled={enviando}
        className="justify-self-start rounded bg-marca px-4 py-2 font-semibold text-white disabled:opacity-60"
      >
        {enviando ? "Criando..." : `Comecar teste de ${dias} dias`}
      </button>
    </form>
  );
}
