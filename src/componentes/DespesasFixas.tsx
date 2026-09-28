"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { emReais } from "@/lib/dinheiro";
import { CATEGORIAS_DE_DESPESA, rotuloDaCategoria } from "@/lib/financeiro";

type Fixa = {
  id: string;
  descricao: string;
  categoria: string;
  fornecedor: string | null;
  valorCentavos: number;
  diaDoVencimento: number;
  ativo: boolean;
};

/**
 * Despesas fixas: o que se repete todo mes.
 *
 * O botao de gerar e idempotente do lado do servidor (indice unico em
 * despesaFixa + competencia), entao clicar duas vezes nao duplica nada. Isso
 * importa porque quem clica "gerar" e gente com pressa.
 */
export function DespesasFixas({
  despesas,
  competencia,
  nomeDaCompetencia,
}: {
  despesas: Fixa[];
  competencia: string;
  nomeDaCompetencia: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nova, setNova] = useState({
    descricao: "",
    categoria: "ALUGUEL",
    fornecedor: "",
    valor: "",
    diaDoVencimento: "10",
  });

  async function criar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      const resposta = await fetch("/api/despesas-fixas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nova),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(corpo.erro ?? "Nao foi possivel gravar.");
        return;
      }
      setNova({ descricao: "", categoria: "ALUGUEL", fornecedor: "", valor: "", diaDoVencimento: "10" });
      setAberto(false);
      router.refresh();
    } finally {
      setOcupado(false);
    }
  }

  async function gerar() {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      const resposta = await fetch("/api/despesas-fixas", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competencia }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(corpo.erro ?? "Nao foi possivel gerar.");
        return;
      }
      setAviso(
        corpo.criados === 0
          ? `Nada a gerar: as ${corpo.jaExistiam} despesas fixas ja estao lancadas em ${nomeDaCompetencia}.`
          : `${corpo.criados} lancamento(s) criado(s) em ${nomeDaCompetencia}. O valor e previsto — corrija quando a conta chegar.`,
      );
      router.refresh();
    } finally {
      setOcupado(false);
    }
  }

  async function alternar(id: string, ativo: boolean) {
    setOcupado(true);
    try {
      await fetch(`/api/despesas-fixas/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ativo }),
      });
      router.refresh();
    } finally {
      setOcupado(false);
    }
  }

  const ativas = despesas.filter((d) => d.ativo);
  const totalMensal = ativas.reduce((s, d) => s + d.valorCentavos, 0);

  return (
    <section className="cartao">
      <p className="sobretitulo">Todo mes</p>
      <h2 className="mt-1 text-lg font-bold">Despesas fixas</h2>
      <p className="mt-2 leitura text-slate-600">
        Aluguel, contabilidade, internet, energia. Cadastre uma vez e gere os
        lancamentos do mes com um clique. O valor e uma previsao — conta de
        consumo muda todo mes, e o lancamento e corrigido quando a conta chega.
      </p>

      {ativas.length > 0 && (
        <p className="mt-3 text-sm text-slate-500 esquerda">
          {ativas.length} despesa(s) ativa(s), somando {emReais(totalMensal)} por
          mes.
        </p>
      )}

      {despesas.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 text-sm">
          {despesas.map((d) => (
            <li key={d.id} className="flex flex-wrap items-baseline gap-x-3 py-2">
              <span className="w-12 shrink-0 tabular-nums text-slate-500">
                dia {d.diaDoVencimento}
              </span>
              <span className={`min-w-0 flex-1 ${d.ativo ? "" : "text-slate-400 line-through"}`}>
                {d.descricao}
                <span className="ml-2 text-xs text-slate-500">
                  {rotuloDaCategoria(d.categoria)}
                </span>
              </span>
              <span className="tabular-nums font-medium">
                {emReais(d.valorCentavos)}
              </span>
              <button
                type="button"
                className="botao-discreto"
                onClick={() => alternar(d.id, !d.ativo)}
                disabled={ocupado}
              >
                {d.ativo ? "desligar" : "ligar"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {erro && <p className="aviso-erro mt-3">{erro}</p>}
      {aviso && <p className="aviso-ok mt-3">{aviso}</p>}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className="botao-secundario"
          onClick={() => setAberto((a) => !a)}
        >
          {aberto ? "Cancelar" : "Nova despesa fixa"}
        </button>
        {ativas.length > 0 && (
          <button
            type="button"
            className="botao-principal"
            onClick={gerar}
            disabled={ocupado}
          >
            {ocupado ? "..." : `Gerar lancamentos de ${nomeDaCompetencia}`}
          </button>
        )}
      </div>

      {aberto && (
        <form onSubmit={criar} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="rotulo" htmlFor="fixa-descricao">Descricao</label>
            <input
              id="fixa-descricao"
              className="campo"
              required
              value={nova.descricao}
              onChange={(e) => setNova({ ...nova, descricao: e.target.value })}
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="fixa-categoria">Categoria</label>
            <select
              id="fixa-categoria"
              className="campo"
              value={nova.categoria}
              onChange={(e) => setNova({ ...nova, categoria: e.target.value })}
            >
              {CATEGORIAS_DE_DESPESA.map((c) => (
                <option key={c} value={c}>
                  {rotuloDaCategoria(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="rotulo" htmlFor="fixa-fornecedor">Fornecedor</label>
            <input
              id="fixa-fornecedor"
              className="campo"
              value={nova.fornecedor}
              onChange={(e) => setNova({ ...nova, fornecedor: e.target.value })}
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="fixa-valor">Valor previsto (R$)</label>
            <input
              id="fixa-valor"
              className="campo"
              required
              value={nova.valor}
              onChange={(e) => setNova({ ...nova, valor: e.target.value })}
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="fixa-dia">Dia do vencimento</label>
            <input
              id="fixa-dia"
              className="campo"
              type="number"
              min={1}
              max={31}
              required
              value={nova.diaDoVencimento}
              onChange={(e) => setNova({ ...nova, diaDoVencimento: e.target.value })}
            />
            <p className="ajuda">
              Dia 31 em mes de 30 cai no ultimo dia do mes, como no boleto.
            </p>
          </div>
          <div className="sm:col-span-2">
            <button className="botao-principal" type="submit" disabled={ocupado}>
              {ocupado ? "Gravando..." : "Adicionar"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
