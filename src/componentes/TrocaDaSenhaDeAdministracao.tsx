"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Trocar a segunda senha. Exige a atual, e derruba os destravamentos abertos. */
export function TrocaDaSenhaDeAdministracao({
  definidaEm,
}: {
  definidaEm: string | null;
}) {
  const router = useRouter();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aberto, setAberto] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setAviso(null);
    if (nova !== confirma) {
      setErro("As duas senhas nao sao iguais.");
      return;
    }
    setEnviando(true);
    try {
      const resposta = await fetch("/api/administracao/senha", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ atual, nova }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(corpo.erro ?? "Nao foi possivel trocar a senha.");
        return;
      }
      setAtual("");
      setNova("");
      setConfirma("");
      setAviso(corpo.detalhe ?? "Senha trocada.");
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="cartao">
      <p className="sobretitulo">Acesso</p>
      <h2 className="mt-1 text-lg font-bold">Senha de administracao</h2>
      <p className="mt-2 leitura text-slate-600">
        E a segunda senha, que guarda o financeiro e esta area. Trocar derruba
        todas as sessoes destravadas, inclusive a sua — e isso e de proposito:
        a hora de trocar e quando alguem deixa o escritorio.
        {definidaEm && (
          <> Definida pela ultima vez em {new Date(definidaEm).toLocaleDateString("pt-BR")}.</>
        )}
      </p>

      {!aberto ? (
        <button
          className="botao-secundario mt-4"
          type="button"
          onClick={() => setAberto(true)}
        >
          Trocar senha
        </button>
      ) : (
        <form onSubmit={enviar} className="mt-4 space-y-4">
          <div>
            <label className="rotulo" htmlFor="adm-atual">Senha atual</label>
            <input
              id="adm-atual"
              className="campo"
              type="password"
              autoComplete="current-password"
              value={atual}
              onChange={(e) => setAtual(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="adm-nova">Nova senha</label>
            <input
              id="adm-nova"
              className="campo"
              type="password"
              autoComplete="new-password"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="adm-confirma">Repita a nova senha</label>
            <input
              id="adm-confirma"
              className="campo"
              type="password"
              autoComplete="new-password"
              value={confirma}
              onChange={(e) => setConfirma(e.target.value)}
              required
            />
          </div>

          {erro && <p className="aviso-erro">{erro}</p>}
          {aviso && <p className="aviso-ok">{aviso}</p>}

          <div className="flex gap-3">
            <button className="botao-principal" type="submit" disabled={enviando}>
              {enviando ? "Trocando..." : "Trocar senha"}
            </button>
            <button
              className="botao-discreto"
              type="button"
              onClick={() => setAberto(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
