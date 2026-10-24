"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { centavosDoTexto as centavos, type TabelaDePrecos } from "@/lib/precos";

type Linha = { chave: string; rotulo: string };

const reais = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const porcento = (f: number) => String(Math.round(f * 1000) / 10).replace(".", ",");

async function chamar(corpo: unknown) {
  const r = await fetch("/api/plataforma/financeiro", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const json = (await r.json().catch(() => ({}))) as { erro?: string; detalhe?: string };
  return { ok: r.ok, texto: json.detalhe ?? json.erro ?? (r.ok ? "Feito." : "Falhou.") };
}

/**
 * Editor da tabela de precos do console. Valores em reais na tela, centavos
 * na API. O Essencial e a mensalidade da faixa (o nucleo sozinho): a linha
 * dele vale para os dois.
 */
export function EditorDaTabela({
  tabela,
  planos,
  faixas,
  modulos,
}: {
  tabela: TabelaDePrecos;
  planos: Linha[];
  faixas: Linha[];
  modulos: Linha[];
}) {
  const router = useRouter();
  const [plano, setPlano] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(
      planos.map((p) => [
        p.chave,
        Object.fromEntries(faixas.map((f) => [f.chave, reais((tabela.plano as Record<string, Record<string, number>>)[p.chave][f.chave])])),
      ]),
    ),
  );
  const [modulo, setModulo] = useState<Record<string, string>>(() =>
    Object.fromEntries(modulos.map((m) => [m.chave, reais((tabela.modulo as Record<string, number>)[m.chave] ?? 0)])),
  );
  const [anual, setAnual] = useState(porcento(tabela.descontoAnual));
  const [trimestral, setTrimestral] = useState(porcento(tabela.descontoTrimestral));
  const [reajuste, setReajuste] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState<{ ok: boolean; texto: string } | null>(null);

  async function agir(corpo: unknown, pergunta?: string) {
    if (pergunta && !window.confirm(pergunta)) return;
    setOcupado(true);
    setRecado(null);
    const r = await chamar(corpo);
    setOcupado(false);
    setRecado(r);
    if (r.ok) router.refresh();
  }

  function salvar() {
    const montada = {
      faixa: Object.fromEntries(faixas.map((f) => [f.chave, centavos(plano.ESSENCIAL[f.chave])])),
      plano: Object.fromEntries(
        planos.map((p) => [p.chave, Object.fromEntries(faixas.map((f) => [f.chave, centavos(plano[p.chave][f.chave])]))]),
      ),
      modulo: Object.fromEntries(modulos.map((m) => [m.chave, centavos(modulo[m.chave])])),
      descontoAnual: Number(anual.replace(",", ".")) / 100,
      descontoTrimestral: Number(trimestral.replace(",", ".")) / 100,
    };
    const valores = [
      ...Object.values(montada.faixa),
      ...Object.values(montada.plano).flatMap((f) => Object.values(f)),
      ...Object.values(montada.modulo),
    ];
    if (valores.some((v) => !Number.isFinite(v))) {
      setRecado({ ok: false, texto: "Há um valor vazio ou inválido na tabela. Use o formato 149,90." });
      return;
    }
    void agir(
      { acao: "tabela", tabela: montada },
      "Gravar a tabela? Ela vale para os cadastros novos e para os escritórios sem valor fechado. Contrato com valor fechado não muda.",
    );
  }

  const campo = "w-24 rounded border border-slate-300 px-2 py-1 text-right";

  return (
    <div className="text-sm">
      <div className="overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th>Plano (R$ por mês)</th>
              {faixas.map((f) => (
                <th key={f.chave} className="text-right">
                  {f.rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {planos.map((p) => (
              <tr key={p.chave}>
                <td>
                  {p.rotulo}
                  {p.chave === "ESSENCIAL" ? <span className="block text-xs text-slate-500">= mensalidade da faixa</span> : null}
                </td>
                {faixas.map((f) => (
                  <td key={f.chave} className="text-right">
                    <input
                      aria-label={`${p.rotulo}, ${f.rotulo}`}
                      inputMode="decimal"
                      className={campo}
                      value={plano[p.chave][f.chave]}
                      onChange={(e) => setPlano({ ...plano, [p.chave]: { ...plano[p.chave], [f.chave]: e.target.value } })}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 font-semibold">Módulo avulso (R$ por mês, na faixa Solo)</h3>
      <p className="ajuda">Nas faixas maiores o módulo avulso acompanha o tamanho do escritório, pelo fator da faixa.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {modulos.map((m) => (
          <label key={m.chave} className="flex items-center justify-between gap-2">
            <span>{m.rotulo}</span>
            <input
              inputMode="decimal"
              className={campo}
              value={modulo[m.chave]}
              onChange={(e) => setModulo({ ...modulo, [m.chave]: e.target.value })}
            />
          </label>
        ))}
      </div>

      <h3 className="mt-6 font-semibold">Descontos de ciclo</h3>
      <div className="mt-2 flex flex-wrap gap-6">
        <label className="flex items-center gap-2">
          Trimestral (%)
          <input inputMode="decimal" className={campo} value={trimestral} onChange={(e) => setTrimestral(e.target.value)} />
        </label>
        <label className="flex items-center gap-2">
          Anual (%)
          <input inputMode="decimal" className={campo} value={anual} onChange={(e) => setAnual(e.target.value)} />
        </label>
      </div>
      <p className="ajuda">De 0% a 50%. O desconto vale para a próxima fatura de período de cada escritório nesse ciclo.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="botao-principal" disabled={ocupado} onClick={salvar}>
          Gravar a tabela
        </button>
        <button
          type="button"
          className="botao-discreto"
          disabled={ocupado}
          onClick={() => agir({ acao: "padrao" }, "Voltar à tabela padrão do sistema? Os valores editados aqui se perdem.")}
        >
          Voltar à tabela padrão
        </button>
      </div>

      <div className="mt-6 rounded border border-slate-200 p-3">
        <p className="font-semibold">Reajustar a tabela inteira</p>
        <p className="ajuda">Multiplica todos os preços de plano e de módulo pelo percentual e arredonda ao real. Os descontos de ciclo não mudam.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input inputMode="decimal" placeholder="ex.: 4,5" className={campo} value={reajuste} onChange={(e) => setReajuste(e.target.value)} />
          <span>%</span>
          <button
            type="button"
            className="botao-secundario"
            disabled={ocupado || !reajuste.trim()}
            onClick={() =>
              agir(
                { acao: "reajustarTabela", percentual: Number(reajuste.replace(",", ".")) },
                `Reajustar a tabela em ${reajuste}%? Vale para os cadastros novos e para quem não tem valor fechado.`,
              )
            }
          >
            Reajustar a tabela
          </button>
        </div>
      </div>

      {recado ? (
        <p role="status" className={`mt-3 ${recado.ok ? "text-green-800" : "text-red-700"}`}>
          {recado.texto}
        </p>
      ) : null}
    </div>
  );
}
