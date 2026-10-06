"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type MesNaTela = {
  nome: string;
  realizado: string;
  realizadoCentavos: number;
  despesas: string;
  previsto: string;
};

export type RitmoNaTela = {
  comoEsta: string;
  situacao: string;
  cumpridoPorCento: number;
  esperado: string;
  diferenca: string;
  sobra: boolean;
  falta: string;
  porMesRestante: string | null;
  projecao: string;
};

const COR_DA_SITUACAO: Record<string, string> = {
  CUMPRIDA: "text-emerald-700",
  ADIANTADO: "text-emerald-700",
  NO_RITMO: "text-slate-700",
  ATRASADO: "text-amber-700",
};

const BARRA_DA_SITUACAO: Record<string, string> = {
  CUMPRIDA: "bg-emerald-500",
  ADIANTADO: "bg-emerald-500",
  NO_RITMO: "bg-slate-800",
  ATRASADO: "bg-amber-500",
};

/**
 * O ano contra a meta.
 *
 * O que esta tela diz, e que um percentual sozinho nao diria: se DA TEMPO.
 * "76% da meta" em marco e otimo e em dezembro e um ano perdido — por isso o
 * numero grande e o ritmo, e nao o percentual.
 */
export function PainelDoAno({
  ano,
  anos,
  meses,
  meta,
  ritmo,
  realizado,
  despesas,
  previsto,
  maiorMes,
}: {
  ano: number;
  anos: number[];
  meses: MesNaTela[];
  meta: string | null;
  ritmo: RitmoNaTela | null;
  realizado: string;
  despesas: string;
  previsto: string;
  maiorMes: number;
}) {
  const router = useRouter();
  const [valor, setValor] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);

  async function gravar() {
    setOcupado(true);
    setErro(null);
    const resposta = await fetch("/api/metas", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ano, valor }),
    });
    setOcupado(false);
    if (!resposta.ok) {
      const d = await resposta.json().catch(() => null);
      setErro(d?.erro ?? "Nao consegui gravar a meta.");
      return;
    }
    setEditando(false);
    setValor("");
    router.refresh();
  }

  return (
    <section className="cartao">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">O ano de {ano}</h2>
        <select
          className="campo w-28"
          value={ano}
          onChange={(e) => router.push(`/financeiro?ano=${e.target.value}`)}
        >
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-xs text-slate-500">Receita realizada</p>
          <p className="text-xl font-semibold tabular-nums">{realizado}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Despesas pagas</p>
          <p className="text-xl font-semibold tabular-nums">{despesas}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Ainda a receber</p>
          <p className="text-xl font-semibold tabular-nums text-slate-600">
            {previsto}
          </p>
        </div>
      </div>

      {ritmo ? (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className={`font-medium ${COR_DA_SITUACAO[ritmo.situacao] ?? ""}`}>
              {ritmo.comoEsta}
            </p>
            <button
              type="button"
              onClick={() => setEditando((v) => !v)}
              className="botao-discreto"
            >
              meta de {meta}
            </button>
          </div>

          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-slate-100">
            <div
              className={`h-full ${BARRA_DA_SITUACAO[ritmo.situacao] ?? "bg-slate-800"}`}
              style={{ width: `${Math.min(100, ritmo.cumpridoPorCento)}%` }}
            />
          </div>

          <p className="mt-2 text-sm text-slate-600">
            {ritmo.cumpridoPorCento}% da meta. Para estar no ritmo a esta altura
            do ano, {ritmo.esperado} —{" "}
            {ritmo.sobra ? (
              <span className="text-emerald-700">{ritmo.diferenca} acima</span>
            ) : (
              <span className="text-amber-700">{ritmo.diferenca} abaixo</span>
            )}
            .
          </p>
          {ritmo.porMesRestante ? (
            <p className="mt-1 text-sm text-slate-600">
              Faltam {ritmo.falta}: {ritmo.porMesRestante} por mes no tempo que
              sobra. No ritmo de hoje, o ano fecha em {ritmo.projecao}.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-600">
            Sem meta para {ano}. Com uma meta, o painel passa a dizer se da
            tempo — e nao so quanto entrou.
          </p>
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="botao-secundario mt-2"
          >
            Definir a meta de {ano}
          </button>
        </div>
      )}

      {editando ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="rotulo" htmlFor="meta-valor">
              Meta de faturamento de {ano} (R$)
            </label>
            <input
              id="meta-valor"
              className="campo"
              inputMode="decimal"
              placeholder="600.000,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
            <p className="ajuda">Em branco, apaga a meta do ano.</p>
          </div>
          <button
            type="button"
            onClick={gravar}
            disabled={ocupado}
            className="botao-principal disabled:opacity-50"
          >
            {ocupado ? "Gravando..." : "Gravar"}
          </button>
        </div>
      ) : null}

      {erro ? <p className="aviso-erro mt-3">{erro}</p> : null}

      <ol className="mt-5 grid gap-1 border-t border-slate-100 pt-4">
        {meses.map((m) => (
          <li key={m.nome} className="flex items-center gap-3 text-xs">
            <span className="w-8 shrink-0 text-slate-500">{m.nome}</span>
            <span className="h-3 flex-1 overflow-hidden rounded bg-slate-50">
              <span
                className="block h-full bg-slate-800"
                style={{
                  width:
                    maiorMes > 0
                      ? `${Math.round((m.realizadoCentavos / maiorMes) * 100)}%`
                      : "0%",
                }}
              />
            </span>
            <span className="w-28 shrink-0 text-right tabular-nums text-slate-700">
              {m.realizado}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-slate-500">
        A barra e a receita que ENTROU no mes. Cobranca emitida e aguardando nao
        conta: bater a meta por causa de boleto que ninguem pagou seria o pior
        jeito de se enganar.
      </p>
    </section>
  );
}
