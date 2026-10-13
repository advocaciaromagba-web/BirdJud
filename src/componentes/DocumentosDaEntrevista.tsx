"use client";

import { useState } from "react";

export type ModeloEmUso = { especie: string; nome: string; doEscritorio: boolean };

/** As pecas que saem logo depois da entrevista. O recibo e da ficha do cliente. */
const DA_ENTREVISTA = ["CONTRATO", "PROCURACAO", "DECLARACAO"];

/**
 * Documentos do cliente, direto da entrevista.
 *
 * Fechou o atendimento e ligou ao cliente: contrato, procuracao e declaracao
 * saem aqui mesmo, no modelo que o escritorio FIXOU na aba Modelos (o dele ou
 * o do sistema). Assinatura eletronica e envio por WhatsApp continuam na ficha
 * do cliente, que tem quem assina, os advogados e o historico de envios.
 */
export function DocumentosDaEntrevista({ clienteId, modelos }: { clienteId: string; modelos: ModeloEmUso[] }) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function gerar(especie: string, formato: "PDF" | "DOCX") {
    setOcupado(`${especie}:${formato}`);
    setErro(null);
    try {
      const resposta = await fetch(`/api/modelos/${especie}/peca`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clienteId, formato }),
      });
      if (!resposta.ok) {
        const det = await resposta.json().catch(() => null);
        throw new Error(det?.erro ?? "Nao consegui montar o documento.");
      }
      const nome = resposta.headers.get("x-nome-do-arquivo") ?? `${especie.toLowerCase()}.${formato.toLowerCase()}`;
      const url = URL.createObjectURL(await resposta.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  const lista = modelos.filter((m) => DA_ENTREVISTA.includes(m.especie));

  return (
    <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Documentos do cliente</p>
      <ul className="grid gap-2">
        {lista.map((m) => (
          <li key={m.especie} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {m.nome}{" "}
              <span className="text-xs text-slate-500">
                ({m.doEscritorio ? "modelo do escritorio" : "modelo do sistema"})
              </span>
            </span>
            <span className="flex gap-2">
              {(["PDF", "DOCX"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  disabled={ocupado !== null}
                  onClick={() => gerar(m.especie, f)}
                  className="botao-secundario text-xs disabled:opacity-50"
                >
                  {ocupado === `${m.especie}:${f}` ? "Montando..." : f === "PDF" ? "PDF" : "Word"}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
      {erro ? <p className="aviso-erro text-xs">{erro}</p> : null}
      <p className="text-xs text-slate-500">
        Qual modelo sai e escolhido em <a href="/modelos" className="underline">Modelos de documento</a>. Para mandar
        assinar ou enviar por WhatsApp, abra a{" "}
        <a href={`/clientes/${clienteId}`} className="underline">
          ficha do cliente
        </a>
        .
      </p>
    </div>
  );
}
