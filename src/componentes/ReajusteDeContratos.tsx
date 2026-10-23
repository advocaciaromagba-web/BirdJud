"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Linha = { escritorioId: string; nome: string; atualCentavos: number; novoCentavos: number; desde: string; recente: boolean };

const reais = (c: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);

async function chamar(corpo: unknown) {
  const r = await fetch("/api/plataforma/financeiro", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
  return { ok: r.ok, json: (await r.json().catch(() => ({}))) as { erro?: string; detalhe?: string; previa?: Linha[] } };
}

/** Reajuste dos valores fechados: previa primeiro, depois aplicar. */
export function ReajusteDeContratos() {
  const router = useRouter();
  const [percentual, setPercentual] = useState("");
  const [previa, setPrevia] = useState<Linha[] | null>(null);
  const [incluirRecentes, setIncluirRecentes] = useState(false);
  const [avisar, setAvisar] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState<{ ok: boolean; texto: string } | null>(null);
  const pct = Number(percentual.replace(",", "."));

  async function verPrevia() {
    setOcupado(true);
    setRecado(null);
    const r = await chamar({ acao: "previaReajuste", percentual: pct });
    setOcupado(false);
    if (!r.ok) return setRecado({ ok: false, texto: r.json.erro ?? "Falhou." });
    setPrevia(r.json.previa ?? []);
  }

  async function aplicar() {
    const alvo = (previa ?? []).filter((l) => incluirRecentes || !l.recente).length;
    if (!window.confirm(`Reajustar ${alvo} contrato(s) em ${percentual}%?${avisar ? " Cada escritório recebe um e-mail com o valor novo." : ""}`)) return;
    setOcupado(true);
    const r = await chamar({ acao: "aplicarReajuste", percentual: pct, incluirRecentes, avisar });
    setOcupado(false);
    setRecado({ ok: r.ok, texto: r.json.detalhe ?? r.json.erro ?? "Falhou." });
    if (r.ok) {
      setPrevia(null);
      router.refresh();
    }
  }

  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <input inputMode="decimal" className="w-24 rounded border border-slate-300 px-2 py-1 text-right" placeholder="IPCA, ex.: 4,5" value={percentual} onChange={(e) => { setPercentual(e.target.value); setPrevia(null); }} />
        <span>%</span>
        <button type="button" className="botao-secundario" disabled={ocupado || !percentual.trim() || !Number.isFinite(pct)} onClick={verPrevia}>
          Ver a prévia
        </button>
      </div>
      {previa ? (
        previa.length ? (
          <>
            <div className="mt-3 overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Escritório</th>
                    <th className="text-right">Hoje</th>
                    <th className="text-right">Reajustado</th>
                    <th>Último reajuste</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.map((l) => (
                    <tr key={l.escritorioId} className={l.recente && !incluirRecentes ? "opacity-50" : ""}>
                      <td>{l.nome}</td>
                      <td className="text-right">{reais(l.atualCentavos)}</td>
                      <td className="text-right">{reais(l.novoCentavos)}</td>
                      <td>
                        {new Date(l.desde).toLocaleDateString("pt-BR")}
                        {l.recente ? <span className="block text-xs text-amber-700">menos de 12 meses</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="mt-3 flex items-center gap-2">
              <input type="checkbox" checked={incluirRecentes} onChange={(e) => setIncluirRecentes(e.target.checked)} />
              Incluir quem foi reajustado ou assinou há menos de 12 meses (o contrato prevê reajuste anual)
            </label>
            <label className="mt-1 flex items-center gap-2">
              <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} />
              Avisar cada escritório por e-mail com o valor novo
            </label>
            <button type="button" className="botao-principal mt-3" disabled={ocupado} onClick={aplicar}>
              Aplicar o reajuste
            </button>
          </>
        ) : (
          <p className="vazio mt-3">Nenhum contrato com valor fechado. Quem segue a tabela acompanha o reajuste da tabela, acima.</p>
        )
      ) : null}
      {recado ? (
        <p role="status" className={`mt-3 ${recado.ok ? "text-green-800" : "text-red-700"}`}>
          {recado.texto}
        </p>
      ) : null}
    </div>
  );
}
