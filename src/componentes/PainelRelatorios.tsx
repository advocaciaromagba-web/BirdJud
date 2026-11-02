"use client";

import { useState } from "react";

type Disponivel = { tipo: string; nome: string; explicacao: string; protegido: boolean };

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Atalhos de periodo, calculados no fuso de quem esta na tela. */
function atalho(qual: string): [string, string] {
  const hoje = new Date();
  const a = hoje.getFullYear();
  const m = hoje.getMonth();
  if (qual === "mes") return [iso(new Date(a, m, 1, 12)), iso(new Date(a, m + 1, 0, 12))];
  if (qual === "mesPassado") return [iso(new Date(a, m - 1, 1, 12)), iso(new Date(a, m, 0, 12))];
  if (qual === "ano") return [iso(new Date(a, 0, 1, 12)), iso(new Date(a, 11, 31, 12))];
  if (qual === "anoPassado") return [iso(new Date(a - 1, 0, 1, 12)), iso(new Date(a - 1, 11, 31, 12))];
  return [iso(new Date(a, m - 11, 1, 12)), iso(new Date(a, m + 1, 0, 12))];
}

const ATALHOS = [
  ["mes", "Este mês"],
  ["mesPassado", "Mês passado"],
  ["ano", "Este ano"],
  ["anoPassado", "Ano passado"],
  ["12", "Últimos 12 meses"],
] as const;

/**
 * Relatorios em PDF por periodo. Um periodo so no topo vale para todos; o
 * arquivo e montado na hora, com os numeros de agora.
 */
export function PainelRelatorios({ relatorios }: { relatorios: Disponivel[] }) {
  const [periodo, setPeriodo] = useState<[string, string]>(atalho("mes"));
  const [todos, setTodos] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [recado, setRecado] = useState<{ tipo: string; texto: string; destrancar?: boolean } | null>(null);

  async function baixar(tipo: string) {
    setOcupado(tipo);
    setRecado(null);
    try {
      const url = `/api/relatorios?tipo=${tipo}&de=${periodo[0]}&ate=${periodo[1]}${tipo === "clientes" && todos ? "&todos=1" : ""}`;
      const r = await fetch(url);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setRecado({ tipo, texto: j.erro ?? "Não consegui montar o relatório.", destrancar: r.status === 403 || r.status === 423 });
        return;
      }
      const blob = await r.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `relatorio-${tipo}-${periodo[0]}-a-${periodo[1]}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      setRecado({ tipo, texto: "Não consegui falar com o servidor." });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="grid gap-6">
      <section className="cartao">
        <h2 className="font-semibold">Período</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {ATALHOS.map(([chave, rotulo]) => {
            const valor = atalho(chave);
            const ativo = valor[0] === periodo[0] && valor[1] === periodo[1];
            return (
              <button
                key={chave}
                type="button"
                aria-pressed={ativo}
                onClick={() => setPeriodo(valor)}
                className={`rounded-full border px-3 py-1 text-sm ${ativo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
              >
                {rotulo}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="grid gap-1">
            <span className="rotulo">De</span>
            <input type="date" className="campo" value={periodo[0]} onChange={(e) => setPeriodo([e.target.value, periodo[1]])} />
          </label>
          <label className="grid gap-1">
            <span className="rotulo">Até</span>
            <input type="date" className="campo" value={periodo[1]} onChange={(e) => setPeriodo([periodo[0], e.target.value])} />
          </label>
        </div>
      </section>

      <ul className="grid gap-4 md:grid-cols-2">
        {relatorios.map((r) => (
          <li key={r.tipo} className="cartao flex flex-col">
            <h3 className="font-semibold">{r.nome}</h3>
            <p className="mt-1 flex-1 text-left text-sm text-slate-600">{r.explicacao}</p>
            {r.tipo === "clientes" ? (
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />
                Todos os clientes, não só os cadastrados no período
              </label>
            ) : null}
            {r.protegido ? <p className="mt-2 text-xs text-slate-500">Pede o Financeiro destrancado (segunda senha).</p> : null}
            <div className="mt-3">
              <button type="button" className="botao-principal" disabled={!!ocupado || !periodo[0] || !periodo[1]} onClick={() => baixar(r.tipo)}>
                {ocupado === r.tipo ? "Montando…" : "Baixar PDF"}
              </button>
            </div>
            {recado?.tipo === r.tipo ? (
              <p role="status" className="mt-2 text-sm text-red-700">
                {recado.texto}{" "}
                {recado.destrancar ? (
                  <a href="/financeiro" className="underline">
                    Destrancar o Financeiro
                  </a>
                ) : null}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
