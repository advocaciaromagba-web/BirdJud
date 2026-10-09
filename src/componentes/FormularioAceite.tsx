"use client";

import { useState } from "react";

export function FormularioAceite({
  documentos,
  versao,
}: {
  documentos: { rotulo: string; caminho: string }[];
  versao: string;
}) {
  const [marcado, setMarcado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aceitar() {
    setOcupado(true);
    setErro(null);
    const r = await fetch("/api/aceite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ aceite: true, versaoAceita: versao }),
    });
    if (!r.ok) {
      setOcupado(false);
      setErro((await r.json().catch(() => ({}))).erro ?? "Nao foi possivel registrar o aceite.");
      return;
    }
    // Navegacao completa: o aceite muda o que todas as telas deixam abrir.
    window.location.href = "/";
  }

  return (
    <div className="cartao mt-6 grid gap-4">
      <ul className="grid gap-2">
        {documentos.map((d) => (
          <li key={d.caminho}>
            <a
              href={`/juridico/${d.caminho}`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[color:var(--marca-primaria)] underline underline-offset-2"
            >
              {d.rotulo}
            </a>
          </li>
        ))}
      </ul>
      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={marcado}
          onChange={(e) => setMarcado(e.target.checked)}
          className="mt-1"
        />
        <span>
          Li e aceito os documentos acima, em nome do escritorio, na versao de{" "}
          {versao.split("-").reverse().join("/")}.
        </span>
      </label>
      {erro ? <p className="aviso-erro">{erro}</p> : null}
      <button
        type="button"
        disabled={!marcado || ocupado}
        onClick={aceitar}
        className="botao-principal justify-self-start disabled:opacity-50"
      >
        {ocupado ? "Registrando..." : "Aceitar e continuar"}
      </button>
    </div>
  );
}
