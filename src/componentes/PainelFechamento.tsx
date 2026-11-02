"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type FechamentoNaTela = {
  competencia: string;
  rotulo: string;
  receita: number;
  despesa: number;
  porForma: [string, number][];
  porQuemRecebeu: [string, number][];
  fechado: string;
  refeito: string | null;
  /** A soma de agora, quando diferente da foto. */
  agora: { receita: number; despesa: number } | null;
};

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Fechamento de caixa: a foto de cada mes, com a quebra por forma e por quem
 * recebeu. O mes fechado nao trava: se a soma de agora mudou, a diferenca
 * aparece, com o botao de refazer a foto ao lado.
 */
export function PainelFechamento({ fechamentos, mesPassadoAberto }: { fechamentos: FechamentoNaTela[]; mesPassadoAberto: { competencia: string; rotulo: string } | null }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function fechar(competencia: string, refazer: boolean) {
    if (refazer && !window.confirm("Refazer a foto deste mês com a soma de agora? Fica registrado quem refez e quando.")) return;
    setOcupado(competencia);
    setErro(null);
    const r = await fetch("/api/fechamento-de-caixa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competencia }),
    });
    setOcupado(null);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErro(j.erro ?? "Não deu certo.");
      return;
    }
    router.refresh();
  }

  return (
    <section className="cartao mt-5">
      <h2 className="text-lg font-bold">Fechamento de caixa</h2>
      <p className="ajuda">
        A foto de cada mês, com o total congelado. Fecha sozinho depois que o mês termina. Lançamento atrasado continua entrando: quando a soma de agora muda, a
        diferença aparece aqui.
      </p>
      {mesPassadoAberto ? (
        <p className="mt-2 text-sm">
          {mesPassadoAberto.rotulo} ainda não foi fechado.{" "}
          <button type="button" className="text-marca underline" disabled={!!ocupado} onClick={() => fechar(mesPassadoAberto.competencia, false)}>
            Fechar agora
          </button>
        </p>
      ) : null}
      {erro ? <p className="mt-2 text-sm text-red-700">{erro}</p> : null}
      {fechamentos.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Nenhum mês fechado ainda.</p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {fechamentos.map((f) => (
            <li key={f.competencia} className="rounded border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="font-semibold">{f.rotulo.charAt(0).toUpperCase() + f.rotulo.slice(1)}</span>
                <span className="tabular-nums text-emerald-800">Receita {reais(f.receita)}</span>
                <span className="tabular-nums">Despesa {reais(f.despesa)}</span>
                <span className={`tabular-nums font-medium ${f.receita - f.despesa < 0 ? "text-red-700" : ""}`}>Resultado {reais(f.receita - f.despesa)}</span>
                <span className="ml-auto text-xs text-slate-500">
                  {f.fechado}
                  {f.refeito ? ` · ${f.refeito}` : ""}
                </span>
              </div>
              {f.agora ? (
                <p className="mt-1 text-amber-800">
                  Mudou depois do fechamento: agora a receita é {reais(f.agora.receita)} ({reais(f.agora.receita - f.receita)}) e a despesa {reais(f.agora.despesa)} (
                  {reais(f.agora.despesa - f.despesa)}).{" "}
                  <button type="button" className="underline" disabled={!!ocupado} onClick={() => fechar(f.competencia, true)}>
                    {ocupado === f.competencia ? "Refazendo…" : "Refazer a foto"}
                  </button>
                </p>
              ) : null}
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Receita por forma</p>
                  {f.porForma.length ? (
                    f.porForma.map(([k, v]) => (
                      <p key={k} className="flex justify-between gap-2">
                        <span>{k}</span>
                        <span className="tabular-nums">{reais(v)}</span>
                      </p>
                    ))
                  ) : (
                    <p className="text-slate-500">—</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Receita por quem recebeu</p>
                  {f.porQuemRecebeu.length ? (
                    f.porQuemRecebeu.map(([k, v]) => (
                      <p key={k} className="flex justify-between gap-2">
                        <span>{k}</span>
                        <span className="tabular-nums">{reais(v)}</span>
                      </p>
                    ))
                  ) : (
                    <p className="text-slate-500">—</p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
