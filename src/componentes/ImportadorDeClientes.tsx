"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CAMPOS_IMPORTAVEIS,
  ROTULO_DA_SITUACAO,
  type Contagem,
  type LinhaClassificada,
  type Mapeamento,
  type Situacao,
} from "@/lib/importacao-clientes";

type Analise = {
  formato: string;
  aba: string | null;
  cabecalho: string[];
  exemplos: string[][];
  mapeamento: Mapeamento;
  linhas: LinhaClassificada[];
  contagem: Contagem;
};

export type ImportacaoNaTela = {
  id: string;
  nomeDoArquivo: string;
  feitaPor: string | null;
  importados: number;
  jaExistiam: number;
  recusados: number;
  criadaEm: string;
  desfeitaEm: string | null;
  mantidosAoDesfazer: number | null;
};

const COR: Record<Situacao, string> = {
  NOVO: "etiqueta-ok",
  JA_CADASTRADO: "etiqueta-neutra",
  REPETIDO_NA_PLANILHA: "etiqueta-neutra",
  PROBLEMA: "etiqueta-erro",
  VAZIA: "etiqueta-neutra",
};

const quando = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** Relatorio da conferencia em CSV (ponto e virgula, como o Excel brasileiro abre). */
function baixarRelatorio(linhas: LinhaClassificada[], nome: string) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const corpo = [
    ["Linha", "Situacao", "Nome", "CPF/CNPJ", "Motivo", "Avisos"].join(";"),
    ...linhas
      .filter((l) => l.situacao !== "VAZIA")
      .map((l) =>
        [
          String(l.linha),
          ROTULO_DA_SITUACAO[l.situacao],
          l.dados.nome,
          l.dados.documento ?? "",
          l.motivo ?? "",
          l.avisos.join("; "),
        ]
          .map(esc)
          .join(";"),
      ),
  ].join("\r\n");
  const blob = new Blob(["﻿" + corpo], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `conferencia-${nome.replace(/\.[^.]+$/, "")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Importar clientes de planilha, em quatro passos: arquivo, colunas,
 * conferencia, importacao. Nada e gravado antes do ultimo, e o lote pode ser
 * desfeito depois.
 */
export function ImportadorDeClientes({ rota, importacoes }: { rota: string; importacoes: ImportacaoNaTela[] }) {
  const router = useRouter();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [mapa, setMapa] = useState<Mapeamento>([]);
  const [mapaMudou, setMapaMudou] = useState(false);
  const [filtro, setFiltro] = useState<Situacao | "TODAS">("TODAS");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ importacaoId: string; importados: number } | null>(null);

  async function enviar(acao: "analisar" | "importar", mapeamento: Mapeamento | null) {
    if (!arquivo) return null;
    const f = new FormData();
    f.set("arquivo", arquivo);
    f.set("acao", acao);
    if (mapeamento) f.set("mapeamento", JSON.stringify(mapeamento));
    const r = await fetch(rota, { method: "POST", body: f });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.erro ?? "Nao foi possivel ler a planilha.");
    return json;
  }

  async function analisar(mapeamento: Mapeamento | null) {
    setOcupado("analisar");
    setErro(null);
    setResultado(null);
    try {
      const a = (await enviar("analisar", mapeamento)) as Analise;
      setAnalise(a);
      setMapa(a.mapeamento);
      setMapaMudou(false);
      setFiltro(a.contagem.PROBLEMA ? "PROBLEMA" : "TODAS");
    } catch (e) {
      setErro((e as Error).message);
      setAnalise(null);
    } finally {
      setOcupado(null);
    }
  }

  async function importar() {
    if (!analise) return;
    if (!window.confirm(`Importar ${analise.contagem.NOVO} cliente(s) novo(s)? O resto fica no relatorio.`)) return;
    setOcupado("importar");
    setErro(null);
    try {
      const r = await enviar("importar", mapa);
      setResultado(r);
      setAnalise(null);
      setArquivo(null);
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function desfazer(id: string) {
    if (!window.confirm("Desfazer esta importacao? Os clientes que ela criou e que ainda nao tem nada ligado (processo, cobranca, documento...) serao apagados.")) return;
    setOcupado(`desfazer-${id}`);
    const r = await fetch(rota, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ acao: "desfazer", importacaoId: id }),
    });
    const json = await r.json().catch(() => ({}));
    setOcupado(null);
    if (!r.ok) {
      setErro(json.erro ?? "Nao foi possivel desfazer.");
      return;
    }
    setResultado(null);
    setErro(null);
    window.alert(
      `${json.apagados} cliente(s) apagado(s).` +
        (json.mantidos ? ` ${json.mantidos} ficaram porque ja tem dados ligados.` : ""),
    );
    router.refresh();
  }

  const visiveis = useMemo(
    () => (analise?.linhas ?? []).filter((l) => l.situacao !== "VAZIA" && (filtro === "TODAS" || l.situacao === filtro)),
    [analise, filtro],
  );
  const semNome = analise && !mapa.includes("nome");

  return (
    <div className="mt-6 grid gap-6">
      <section className="cartao">
        <h2 className="text-lg font-bold">1. A planilha</h2>
        <p className="mt-1 text-sm text-slate-600">
          Excel (.xlsx) ou CSV, exportados do sistema anterior. Uma linha por cliente, com os titulos das
          colunas na primeira linha. Ate 5 mil linhas e 10 MB. O arquivo e lido e descartado: nao fica guardado.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="file"
            aria-label="Planilha de clientes (.xlsx ou .csv)"
            accept=".xlsx,.csv,.xls,.txt"
            onChange={(e) => {
              setArquivo(e.target.files?.[0] ?? null);
              setAnalise(null);
              setResultado(null);
              setErro(null);
            }}
            className="text-sm"
          />
          <button type="button" disabled={!arquivo || ocupado === "analisar"} onClick={() => analisar(null)} className="botao-principal">
            {ocupado === "analisar" ? "Lendo..." : "Ler a planilha"}
          </button>
        </div>
        {erro ? <p className="aviso-erro mt-3">{erro}</p> : null}
        {resultado ? (
          <div className="aviso-ok mt-3">
            <p>
              <strong>{resultado.importados}</strong> cliente(s) importado(s). Eles ja aparecem em Clientes.
            </p>
            <button
              type="button"
              onClick={() => desfazer(resultado.importacaoId)}
              className="mt-2 text-sm font-medium underline"
            >
              Desfazer esta importacao
            </button>
          </div>
        ) : null}
      </section>

      {analise ? (
        <>
          <section className="cartao">
            <h2 className="text-lg font-bold">2. As colunas</h2>
            <p className="mt-1 text-sm text-slate-600">
              O sistema sugeriu para onde vai cada coluna{analise.aba ? ` da aba "${analise.aba}"` : ""}. Confira pelos
              exemplos e corrija o que estiver errado; coluna que nao interessa fica em "nao importar".
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Coluna da planilha</th>
                    <th>Exemplos</th>
                    <th>Vai para</th>
                  </tr>
                </thead>
                <tbody>
                  {analise.cabecalho.map((titulo, i) => (
                    <tr key={i}>
                      <td className="font-medium text-slate-900">{titulo}</td>
                      <td className="max-w-xs truncate text-xs text-slate-500">{analise.exemplos[i]?.join(" · ") || "—"}</td>
                      <td>
                        <select
                          className="campo"
                          value={mapa[i] ?? ""}
                          onChange={(e) => {
                            const novo = [...mapa];
                            const campo = (e.target.value || null) as Mapeamento[number];
                            // Um campo vai para uma coluna so: tira de onde estava.
                            if (campo) novo.forEach((c, k) => { if (c === campo) novo[k] = null; });
                            novo[i] = campo;
                            setMapa(novo);
                            setMapaMudou(true);
                          }}
                        >
                          <option value="">nao importar</option>
                          {CAMPOS_IMPORTAVEIS.map((c) => (
                            <option key={c.chave} value={c.chave}>
                              {c.rotulo}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {semNome ? <p className="aviso-erro mt-3">Escolha qual coluna e o nome do cliente: sem ela, nada entra.</p> : null}
            {mapaMudou ? (
              <button type="button" onClick={() => analisar(mapa)} disabled={ocupado === "analisar"} className="botao-principal mt-3">
                {ocupado === "analisar" ? "Conferindo..." : "Conferir de novo com estas colunas"}
              </button>
            ) : null}
          </section>

          <section className="cartao">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">3. A conferencia</h2>
              <button type="button" onClick={() => baixarRelatorio(analise.linhas, arquivo?.name ?? "planilha")} className="botao-secundario">
                Baixar relatorio (CSV)
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Nada foi gravado ainda. So os <strong>novos</strong> entram; o resto fica no relatorio, com o motivo, para
              corrigir na planilha e importar de novo — quem ja entrou nao entra duas vezes.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["TODAS", "NOVO", "PROBLEMA", "JA_CADASTRADO", "REPETIDO_NA_PLANILHA"] as const).map((s) => {
                const n = s === "TODAS"
                  ? analise.linhas.filter((l) => l.situacao !== "VAZIA").length
                  : analise.contagem[s];
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFiltro(s)}
                    className={`rounded-lg px-3 py-1.5 text-sm ${filtro === s ? "bg-slate-900 font-semibold text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                  >
                    {s === "TODAS" ? "Todas" : ROTULO_DA_SITUACAO[s]} ({n})
                  </button>
                );
              })}
            </div>
            <div className="mt-3 max-h-[28rem] overflow-auto">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Nome</th>
                    <th>CPF / CNPJ</th>
                    <th>Situacao</th>
                    <th>Motivo e avisos</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.slice(0, 300).map((l) => (
                    <tr key={l.linha} className="align-top">
                      <td className="tabular-nums text-slate-500">{l.linha}</td>
                      <td className="font-medium text-slate-900">{l.dados.nome || "—"}</td>
                      <td className="whitespace-nowrap tabular-nums">{l.dados.documento ?? "—"}</td>
                      <td>
                        <span className={COR[l.situacao]}>{ROTULO_DA_SITUACAO[l.situacao]}</span>
                      </td>
                      <td className="text-xs">
                        {l.motivo ? <p className={l.situacao === "PROBLEMA" ? "text-red-700" : "text-slate-600"}>{l.motivo}</p> : null}
                        {l.avisos.map((a) => (
                          <p key={a} className="text-amber-800">⚠ {a}</p>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visiveis.length > 300 ? (
                <p className="mt-2 text-xs text-slate-500">Mostrando 300 de {visiveis.length}. O relatorio tem todas.</p>
              ) : null}
            </div>
          </section>

          <section className="cartao">
            <h2 className="text-lg font-bold">4. Importar</h2>
            <p className="mt-1 text-sm text-slate-600">
              Entram {analise.contagem.NOVO} cliente(s). A importacao fica registrada e pode ser desfeita: saem os
              clientes que ainda nao tiverem nada ligado.
            </p>
            <button
              type="button"
              disabled={!analise.contagem.NOVO || mapaMudou || Boolean(semNome) || ocupado === "importar"}
              onClick={importar}
              className="botao-principal mt-3"
            >
              {ocupado === "importar" ? "Importando..." : `Importar ${analise.contagem.NOVO} cliente(s)`}
            </button>
            {mapaMudou ? <p className="ajuda">Confira de novo depois de mudar as colunas.</p> : null}
          </section>
        </>
      ) : null}

      {importacoes.length ? (
        <section className="cartao">
          <h2 className="text-lg font-bold">Importacoes anteriores</h2>
          <table className="tabela mt-3">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Arquivo</th>
                <th>Quem</th>
                <th className="text-right">Entraram</th>
                <th className="text-right">Ja existiam</th>
                <th className="text-right">Recusados</th>
                <th><span className="sr-only">Acoes</span></th>
              </tr>
            </thead>
            <tbody>
              {importacoes.map((i) => (
                <tr key={i.id}>
                  <td className="whitespace-nowrap tabular-nums">{quando.format(new Date(i.criadaEm))}</td>
                  <td>{i.nomeDoArquivo}</td>
                  <td>{i.feitaPor ?? "—"}</td>
                  <td className="text-right tabular-nums">{i.importados}</td>
                  <td className="text-right tabular-nums">{i.jaExistiam}</td>
                  <td className="text-right tabular-nums">{i.recusados}</td>
                  <td className="text-right text-xs">
                    {i.desfeitaEm ? (
                      <span className="text-slate-500">
                        desfeita{i.mantidosAoDesfazer ? ` (${i.mantidosAoDesfazer} mantidos)` : ""}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={ocupado === `desfazer-${i.id}`}
                        onClick={() => desfazer(i.id)}
                        className="font-medium text-red-700 hover:underline"
                      >
                        Desfazer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
