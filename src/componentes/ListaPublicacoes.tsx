"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type PublicacaoNaTela = {
  temIA: boolean;
  analise: string | null;
  id: string;
  numeroProcesso: string | null;
  numeroFormatado: string | null;
  temProcesso: boolean;
  tribunal: string | null;
  orgao: string | null;
  tipoComunicacao: string | null;
  texto: string;
  link: string | null;
  oab: string | null;
  data: string;
  urgente: boolean;
  prazoDias: number | null;
  lida: boolean;
};

export function ListaPublicacoes({
  publicacoes,
}: {
  publicacoes: PublicacaoNaTela[];
}) {
  if (publicacoes.length === 0) {
    return (
      <p className="mt-6 text-slate-600">
        Nenhuma publicacao em aberto. As capturas rodam de madrugada, por OAB
        monitorada.
      </p>
    );
  }

  return (
    <ul className="mt-6 grid gap-3">
      {publicacoes.map((publicacao) => (
        <Cartao key={publicacao.id} publicacao={publicacao} />
      ))}
    </ul>
  );
}

function Cartao({ publicacao }: { publicacao: PublicacaoNaTela }) {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [analise, setAnalise] = useState<string | null>(publicacao.analise);
  const [erroIA, setErroIA] = useState<string | null>(null);

  async function analisar() {
    setOcupado(true);
    setErroIA(null);
    const resposta = await fetch("/api/ia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: "ANALISE_PUBLICACAO",
        publicacaoId: publicacao.id,
      }),
    });
    const json = await resposta.json().catch(() => ({}));
    setOcupado(false);
    if (resposta.ok) {
      setAnalise(json.analise.texto);
      router.refresh();
      return;
    }
    setErroIA(json.erro ?? "Nao foi possivel analisar.");
  }

  async function marcar(campos: { lida?: boolean; arquivada?: boolean }) {
    setOcupado(true);
    await fetch("/api/publicacoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: publicacao.id, ...campos }),
    });
    setOcupado(false);
    router.refresh();
  }

  return (
    <li
      className={`rounded border p-4 ${
        publicacao.urgente ? "border-red-300 bg-red-50/40" : "border-slate-200"
      } ${publicacao.lida ? "opacity-70" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {publicacao.urgente ? (
          <span className="rounded bg-red-100 px-2 py-0.5 font-semibold text-red-800">
            urgente
          </span>
        ) : null}
        {publicacao.prazoDias !== null ? (
          <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
            prazo sugerido: {publicacao.prazoDias} dia(s)
          </span>
        ) : null}
        {publicacao.lida ? (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">
            lida
          </span>
        ) : null}
        <span className="text-slate-500">{publicacao.data}</span>
        {publicacao.oab ? (
          <span className="text-slate-500">· OAB {publicacao.oab}</span>
        ) : null}
      </div>

      <p className="mt-2 font-semibold">
        {publicacao.numeroFormatado ?? "Sem numero de processo"}
        {publicacao.numeroFormatado && !publicacao.temProcesso ? (
          <span className="ml-2 text-xs font-normal text-amber-700">
            processo nao cadastrado
          </span>
        ) : null}
      </p>
      <p className="text-sm text-slate-500">
        {[publicacao.tribunal, publicacao.orgao, publicacao.tipoComunicacao]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <p
        className={`mt-3 whitespace-pre-line text-sm ${aberta ? "" : "line-clamp-3"}`}
      >
        {publicacao.texto}
      </p>

      {analise ? (
        <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Leitura da IA · rascunho, confira nos autos
          </p>
          <p className="mt-2 whitespace-pre-line">{analise}</p>
        </div>
      ) : null}
      {erroIA ? <p className="mt-2 text-sm text-red-700">{erroIA}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        {publicacao.temIA && !analise ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={analisar}
            className="rounded border border-marca px-3 py-2 font-semibold text-marca disabled:opacity-60"
          >
            {ocupado ? "Lendo..." : "Ler com IA"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setAberta((v) => !v)}
          className="rounded border border-slate-300 px-3 py-2 font-semibold"
        >
          {aberta ? "Recolher" : "Ler tudo"}
        </button>
        {!publicacao.lida ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => marcar({ lida: true })}
            className="botao-principal"
          >
            Marcar como lida
          </button>
        ) : null}
        <button
          type="button"
          disabled={ocupado}
          onClick={() => marcar({ arquivada: true })}
          className="rounded border border-slate-300 px-3 py-2 text-slate-700 disabled:opacity-60"
        >
          Arquivar
        </button>
        {publicacao.link ? (
          <a
            href={publicacao.link}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-slate-300 px-3 py-1 text-marca"
          >
            Abrir no diario
          </a>
        ) : null}
      </div>
    </li>
  );
}
