"use client";

import { useState } from "react";

const ESPECIES = [
  { chave: "CONTRATO", rotulo: "Contrato de honorarios" },
  { chave: "PROCURACAO", rotulo: "Procuracao" },
  { chave: "DECLARACAO", rotulo: "Declaracao de hipossuficiencia" },
];

/**
 * Gerar contrato, procuracao e declaracao para este cliente.
 *
 * A previa vem ANTES do download, e nao depois: o que a peca tem de errado —
 * campo sem valor no cadastro, campo que nao existe — tem de aparecer enquanto
 * ainda da para arrumar, nao no papel que o cliente ja assinou.
 */
export function PecasDoCliente({ clienteId }: { clienteId: string }) {
  const [vendo, setVendo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [previa, setPrevia] = useState<{
    especie: string;
    texto: string;
    semValor: string[];
    desconhecidos: string[];
    doEscritorio: boolean;
  } | null>(null);

  async function ver(especie: string) {
    setOcupado(especie);
    setErro(null);
    setPrevia(null);
    const resposta = await fetch(`/api/modelos/${especie}/peca`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clienteId, previa: true }),
    });
    setOcupado(null);
    const det = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      setErro(det?.erro ?? "Nao consegui montar a peca.");
      return;
    }
    setVendo(especie);
    setPrevia({ especie, ...det });
  }

  async function baixar(especie: string) {
    setOcupado(especie);
    setErro(null);
    const resposta = await fetch(`/api/modelos/${especie}/peca`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clienteId }),
    });
    setOcupado(null);
    if (!resposta.ok) {
      const det = await resposta.json().catch(() => null);
      setErro(det?.erro ?? "Nao consegui montar a peca.");
      return;
    }
    const nome =
      /filename="([^"]+)"/.exec(resposta.headers.get("content-disposition") ?? "")?.[1] ??
      `${especie.toLowerCase()}.docx`;
    const url = URL.createObjectURL(await resposta.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="cartao mt-6">
      <h2 className="font-semibold">Gerar documento</h2>
      <p className="mt-1 text-sm text-slate-600">
        Sai no modelo do escritorio, com os dados deste cliente. O que falta no
        cadastro aparece marcado na peca — confira antes de imprimir.
      </p>

      <div className="mt-3 grid gap-2">
        {ESPECIES.map((e) => (
          <div
            key={e.chave}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0"
          >
            <span className="text-sm">{e.rotulo}</span>
            <span className="flex gap-2">
              <button
                type="button"
                disabled={ocupado === e.chave}
                onClick={() => ver(e.chave)}
                className="botao-secundario disabled:opacity-50"
              >
                {ocupado === e.chave ? "..." : "Conferir"}
              </button>
              <button
                type="button"
                disabled={ocupado === e.chave}
                onClick={() => baixar(e.chave)}
                className="botao-principal disabled:opacity-50"
              >
                Baixar
              </button>
            </span>
          </div>
        ))}
      </div>

      {erro ? <p className="aviso-erro mt-3">{erro}</p> : null}

      {previa && vendo === previa.especie ? (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-500">
            {previa.doEscritorio
              ? "Modelo do escritorio."
              : "Modelo que ja vem no sistema — pode ser trocado em Modelos."}
          </p>
          {previa.semValor.length > 0 ? (
            <p className="mt-1 text-xs text-amber-700">
              Sem valor no cadastro, e por isso marcado na peca:{" "}
              {previa.semValor.join(", ")}.
            </p>
          ) : null}
          {previa.desconhecidos.length > 0 ? (
            <p className="mt-1 text-xs text-amber-700">
              O modelo pede campos que o sistema nao conhece:{" "}
              {previa.desconhecidos.map((d) => `{{${d}}}`).join(", ")}.
            </p>
          ) : null}
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs text-slate-700">
            {previa.texto}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
