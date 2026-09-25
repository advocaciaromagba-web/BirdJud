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
      <div className="cartao mt-8">
        <h2>Escritorio criado</h2>
        <p className="mt-2 text-slate-700">
          O endereco do seu escritorio e{" "}
          <strong style={{ color: "var(--marca-primaria)" }}>
            {pronto.endereco}
          </strong>
          . Entre por ele com o e-mail e a senha que voce acabou de definir.
        </p>
        <p className="ajuda">
          Periodo de teste de {dias} dias. A primeira fatura so e gerada depois
          disso.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="cartao mt-8 grid gap-4">
      <div>
        <label htmlFor="cad-escritorio" className="rotulo">
          Nome do escritorio
        </label>
        <input
          id="cad-escritorio"
          name="escritorio"
          required
          className="campo"
        />
      </div>
      <div>
        <label htmlFor="cad-slug" className="rotulo">
          Endereco do sistema
        </label>
        <input
          id="cad-slug"
          name="slug"
          required
          pattern="[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]"
          className="campo"
        />
        <p className="ajuda">
          Vai ficar assim: <code>seu-escritorio.{dominio}</code>
        </p>
      </div>
      <div>
        <label htmlFor="cad-nome" className="rotulo">
          Seu nome
        </label>
        <input id="cad-nome" name="nome" required className="campo" />
      </div>
      <div>
        <label htmlFor="cad-email" className="rotulo">
          Seu e-mail
        </label>
        <input
          id="cad-email"
          name="email"
          type="email"
          required
          className="campo"
        />
      </div>
      <div>
        <label htmlFor="cad-senha" className="rotulo">
          Senha
        </label>
        <input
          id="cad-senha"
          name="senha"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className="campo"
        />
        <p className="ajuda">Minimo de 10 caracteres.</p>
      </div>
      <label className="grid grid-cols-[auto_1fr] items-start gap-2 text-sm">
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
                className="underline"
                style={{ color: "var(--marca-primaria)" }}
              >
                {documento.rotulo}
              </a>
            </span>
          ))}
          .
          <span className="ajuda block">
            Versao {VERSAO_DOS_DOCUMENTOS}. O aceite fica registrado com data e
            hora.
          </span>
        </span>
      </label>

      {erro ? <p className="aviso-erro">{erro}</p> : null}
      <button
        type="submit"
        disabled={enviando}
        className="botao-principal justify-self-start"
      >
        {enviando ? "Criando..." : `Comecar teste de ${dias} dias`}
      </button>
    </form>
  );
}
