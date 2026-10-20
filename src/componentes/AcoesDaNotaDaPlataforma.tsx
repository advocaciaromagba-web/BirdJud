"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type NotaNaTela = {
  id: string;
  status: string;
  numero: string | null;
  erro: string | null;
  ambiente: string;
  enviadaEm: string | null;
};

const ROTULO: Record<string, string> = {
  EMITIDA: "Nota emitida",
  PROCESSANDO: "Nota pendente na Sefin",
  REJEITADA: "Nota recusada",
  CANCELADA: "Nota cancelada",
};

async function chamar(corpo: unknown) {
  const r = await fetch("/api/plataforma/notas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const json = (await r.json().catch(() => ({}))) as { erro?: string; detalhe?: string };
  return { ok: r.ok, texto: json.detalhe ?? json.erro ?? (r.ok ? "Feito." : "Falhou.") };
}

/**
 * A nota da mensalidade de uma fatura, no console: ver, emitir, conferir,
 * reenviar ao escritorio e cancelar.
 */
export function AcoesDaNotaDaPlataforma({ faturaId, nota }: { faturaId: string; nota: NotaNaTela | null }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState(1);
  const [justificativa, setJustificativa] = useState("");

  async function agir(corpo: unknown) {
    setOcupado(true);
    setRecado(null);
    const r = await chamar(corpo);
    setOcupado(false);
    setRecado(r);
    if (r.ok) setCancelando(false);
    router.refresh();
  }

  const botao = "rounded border border-slate-400 px-2 py-1 text-xs font-semibold disabled:opacity-60";
  const podeEmitir = !nota || nota.status === "REJEITADA" || nota.status === "CANCELADA";

  return (
    <div className="mt-1 text-xs">
      {nota ? (
        <p className={nota.status === "REJEITADA" ? "text-red-700" : "text-slate-600"}>
          {ROTULO[nota.status] ?? nota.status}
          {nota.numero ? ` ${nota.numero}` : ""}
          {nota.ambiente !== "PRODUCAO" ? " (teste)" : ""}
          {nota.status === "EMITIDA" && nota.enviadaEm ? ` · enviada em ${nota.enviadaEm}` : ""}
          {nota.status === "REJEITADA" && nota.erro ? ` — ${nota.erro}` : ""}
        </p>
      ) : null}
      <div className="mt-1 flex flex-wrap gap-2">
        {podeEmitir ? (
          <button
            type="button"
            className={botao}
            disabled={ocupado}
            onClick={() => {
              if (window.confirm("Emitir a nota fiscal desta fatura e mandar ao escritório?")) void agir({ acao: "emitir", faturaId });
            }}
          >
            {nota ? "Emitir de novo" : "Emitir nota"}
          </button>
        ) : null}
        {nota?.status === "PROCESSANDO" ? (
          <button type="button" className={botao} disabled={ocupado} onClick={() => agir({ acao: "verificar", id: nota.id })}>
            Verificar na Sefin
          </button>
        ) : null}
        {nota && (nota.status === "EMITIDA" || nota.status === "CANCELADA") ? (
          <a className={botao} href={`/api/notas-da-plataforma/${nota.id}/pdf`} target="_blank" rel="noopener noreferrer">
            PDF
          </a>
        ) : null}
        {nota?.status === "EMITIDA" ? (
          <>
            <button type="button" className={botao} disabled={ocupado} onClick={() => agir({ acao: "reenviar", id: nota.id })}>
              Reenviar e-mail
            </button>
            <button type="button" className={botao} disabled={ocupado} onClick={() => setCancelando((v) => !v)}>
              Cancelar nota
            </button>
          </>
        ) : null}
      </div>
      {cancelando && nota ? (
        <div className="mt-2 grid gap-2 rounded border border-slate-300 p-2">
          <label>
            <span className="block font-semibold">Motivo</span>
            <select className="campo mt-1" value={motivo} onChange={(e) => setMotivo(Number(e.target.value))}>
              <option value={1}>Erro na emissão</option>
              <option value={2}>Serviço não prestado</option>
              <option value={9}>Outros</option>
            </select>
          </label>
          <label>
            <span className="block font-semibold">Justificativa (mínimo 15 caracteres)</span>
            <input className="campo mt-1" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} maxLength={255} />
          </label>
          <button
            type="button"
            className={botao}
            disabled={ocupado || justificativa.trim().length < 15}
            onClick={() => agir({ acao: "cancelar", id: nota.id, motivo, justificativa: justificativa.trim() })}
          >
            Confirmar cancelamento
          </button>
        </div>
      ) : null}
      {recado ? (
        <p role="status" className={`mt-1 ${recado.ok ? "text-green-800" : "text-red-700"}`}>
          {recado.texto}
        </p>
      ) : null}
    </div>
  );
}
