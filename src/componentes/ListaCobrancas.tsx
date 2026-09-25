"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type CobrancaNaTela = {
  id: string;
  cliente: string;
  descricao: string;
  valor: string;
  vencimento: string;
  forma: string;
  status: string;
  linkPagamento: string | null;
  pagoEm: string | null;
};

const CORES: Record<string, string> = {
  ABERTA: "bg-slate-100 text-slate-700",
  PAGA: "bg-emerald-100 text-emerald-800",
  VENCIDA: "bg-amber-100 text-amber-900",
  CANCELADA: "bg-slate-100 text-slate-500",
  ESTORNADA: "bg-rose-100 text-rose-800",
};

export function ListaCobrancas({ cobrancas }: { cobrancas: CobrancaNaTela[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function chamar(
    corpo: Record<string, string>,
    sucesso: (json: Record<string, unknown>) => string,
  ) {
    setOcupado(true);
    setAviso(null);
    const resposta = await fetch("/api/cobrancas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const json = await resposta.json().catch(() => ({}));
    setOcupado(false);
    if (!resposta.ok) {
      setAviso(json.erro ?? "Nao foi possivel falar com o Asaas.");
      return;
    }
    setAviso(sucesso(json));
    router.refresh();
  }

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={ocupado}
          onClick={() =>
            chamar({ acao: "SINCRONIZAR" }, (json) => {
              const r = (json.resultado ?? {}) as {
                conferidas?: number;
                pagas?: number;
              };
              return `${r.conferidas ?? 0} conferida(s), ${r.pagas ?? 0} baixada(s).`;
            })
          }
          className="rounded border border-slate-300 px-3 py-2 text-sm hover:border-marca disabled:opacity-50"
        >
          {ocupado ? "Conferindo…" : "Conferir no Asaas"}
        </button>
        {aviso ? <span className="text-sm text-slate-600">{aviso}</span> : null}
      </div>

      {cobrancas.length === 0 ? (
        <p className="mt-6 text-slate-600">Nenhuma cobranca emitida ainda.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-200">
          {cobrancas.map((cobranca) => (
            <li
              key={cobranca.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3"
            >
              <span
                className={`rounded px-2 py-0.5 text-xs font-semibold ${CORES[cobranca.status] ?? CORES.ABERTA}`}
              >
                {cobranca.status}
              </span>
              <span className="font-semibold">{cobranca.valor}</span>
              <span>{cobranca.cliente}</span>
              <span className="text-slate-500">{cobranca.descricao}</span>
              <span className="ml-auto text-sm text-slate-500">
                {cobranca.pagoEm
                  ? `pago em ${cobranca.pagoEm}`
                  : `vence em ${cobranca.vencimento}`}
              </span>
              <span className="w-full text-sm">
                {cobranca.linkPagamento ? (
                  <a
                    href={cobranca.linkPagamento}
                    target="_blank"
                    rel="noreferrer"
                    className="text-marca hover:underline"
                  >
                    Link de pagamento
                  </a>
                ) : null}
                {cobranca.status === "ABERTA" ||
                cobranca.status === "VENCIDA" ? (
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() =>
                      chamar(
                        { acao: "CANCELAR", id: cobranca.id },
                        () => "Cobranca cancelada.",
                      )
                    }
                    className="-my-1 ml-3 py-2 text-slate-500 hover:text-rose-700 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
