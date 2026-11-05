"use client";

import { useEffect, useState } from "react";
import { emReais } from "@/lib/dinheiro";
import { competenciaSeguinte, type Previsao } from "@/lib/previsao-conta";
import { GraficoDePizza } from "./GraficoDePizza";

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MES_INTEIRO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const curto = (c: string) => `${MES[Number(c.slice(5, 7)) - 1]}/${c.slice(2, 4)}`;
const longo = (c: string) => `${MES_INTEIRO[Number(c.slice(5, 7)) - 1]} de ${c.slice(0, 4)}`;
const diaBR = (iso: string) => iso.split("-").reverse().join("/").slice(0, 5);
const FONTE: Record<string, string> = { ASAAS: "Asaas", SISTEMA: "só no sistema", PROJETADA: "projetada" };

/**
 * Previsao de arrecadacao, mes a mes: o que VENCE em cada mes, quanto disso ja
 * entrou, quanto vai vencer e quanto venceu sem pagar. Le o Asaas pela rota
 * propria, para o servico de fora nao segurar a tela.
 */
export function PainelPrevisao({ mesAtual }: { mesAtual: string }) {
  const [inicio, setInicio] = useState(competenciaSeguinte(mesAtual, -1));
  const [dados, setDados] = useState<Previsao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState(mesAtual);
  const [verLinhas, setVerLinhas] = useState(false);

  useEffect(() => {
    let vivo = true;
    setDados(null);
    setErro(null);
    fetch(`/api/financeiro/previsao?de=${inicio}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!vivo) return;
        if (!r.ok || !j) setErro(j?.erro ?? "Não consegui montar a previsão.");
        else setDados(j as Previsao);
      })
      .catch(() => vivo && setErro("Não consegui montar a previsão."));
    return () => {
      vivo = false;
    };
  }, [inicio]);

  const mes = dados?.meses.find((m) => m.competencia === escolhido) ?? dados?.meses[0] ?? null;
  const maior = Math.max(1, ...(dados?.meses.map((m) => m.previsto) ?? [0]));

  return (
    <section className="cartao">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="sobretitulo">Previsão de arrecadação</p>
          <h2 className="mt-1 text-lg font-bold">O que vence mês a mês, e quanto já entrou</h2>
        </div>
        <div className="flex gap-2">
          <button type="button" className="botao-discreto" onClick={() => setInicio(competenciaSeguinte(inicio, -6))}>
            ← 6 meses
          </button>
          <button type="button" className="botao-discreto" onClick={() => setInicio(competenciaSeguinte(inicio, 6))}>
            6 meses →
          </button>
        </div>
      </div>
      <p className="ajuda">
        Lê as cobranças do Asaas direto (inclusive as criadas no painel deles), soma as que só existem aqui e projeta as mensalidades que o Asaas ainda
        não emitiu. Não é caixa: cobrança de outro mês paga agora conta no mês em que vencia.
      </p>

      {erro ? <p className="aviso-erro mt-3">{erro}</p> : null}
      {!dados && !erro ? <p className="mt-3 text-sm text-slate-500">Lendo o Asaas…</p> : null}
      {dados?.erroDoAsaas ? (
        <p className="aviso-erro mt-3 font-semibold">
          O Asaas não respondeu ({dados.erroDoAsaas}). Os números abaixo são só o que está no sistema — estão incompletos.
        </p>
      ) : null}
      {dados?.semAsaas ? <p className="mt-3 text-sm text-slate-600">Sem conta Asaas conectada: a previsão usa só as cobranças do sistema.</p> : null}

      {dados ? (
        <>
          <div className="mt-4 overflow-x-auto">
            <div className="flex min-w-[32rem] items-end gap-3" role="list" aria-label="Previsto e recebido por mês">
              {dados.meses.map((m) => {
                const alto = Math.round((m.previsto / maior) * 120);
                const dentro = m.previsto ? Math.round((m.recebido / m.previsto) * alto) : 0;
                const ativo = m.competencia === mes?.competencia;
                return (
                  <button
                    key={m.competencia}
                    type="button"
                    role="listitem"
                    onClick={() => setEscolhido(m.competencia)}
                    aria-pressed={ativo}
                    title={`${longo(m.competencia)}: previsto ${emReais(m.previsto)}, recebido ${emReais(m.recebido)}`}
                    className={`flex flex-1 flex-col items-center gap-1 rounded-lg p-1 text-xs ${ativo ? "bg-slate-100 font-semibold" : "hover:bg-slate-50"}`}
                  >
                    <span className="tabular-nums text-slate-600">{emReais(m.previsto).replace(/,\d\d$/, "")}</span>
                    <span className="relative w-full max-w-12 rounded-t bg-slate-200" style={{ height: `${Math.max(alto, 2)}px` }}>
                      <span className="absolute bottom-0 left-0 w-full rounded-t bg-emerald-600" style={{ height: `${dentro}px` }} />
                    </span>
                    <span>{curto(m.competencia)}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-slate-500">Barra cinza: previsto. Verde: já recebido.</p>
          </div>

          {mes ? (
            <div className="mt-4 grid gap-4 [&>*]:min-w-0">
              <h3 className="font-semibold">{longo(mes.competencia)}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="indicador">
                  <p className="indicador-numero">{emReais(mes.previsto)}</p>
                  <p className="indicador-rotulo">Previsto{mes.projetado ? ` (${emReais(mes.projetado)} projetado)` : ""}</p>
                </div>
                <div className="indicador">
                  <p className="indicador-numero text-emerald-700">{emReais(mes.recebido)}</p>
                  <p className="indicador-rotulo">Recebido {mes.previsto ? `(${Math.round((mes.recebido / mes.previsto) * 100)}%)` : ""}</p>
                </div>
                <div className="indicador">
                  <p className="indicador-numero">{emReais(mes.aVencer)}</p>
                  <p className="indicador-rotulo">A vencer</p>
                </div>
                <div className="indicador">
                  <p className={`indicador-numero ${mes.vencido ? "text-red-700" : ""}`}>{emReais(mes.vencido)}</p>
                  <p className="indicador-rotulo">Venceu sem pagar</p>
                </div>
              </div>
              {mes.linhas.length ? (
                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <p className="text-sm font-semibold">De onde vem</p>
                    <div className="mt-2">
                      <GraficoDePizza descricao="Arrecadação por origem" porCategoria={mes.porOrigem.map((f) => ({ categoria: f.rotulo, rotulo: f.rotulo, centavos: f.centavos }))} />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Por cliente</p>
                    <div className="mt-2">
                      <GraficoDePizza
                        descricao="Arrecadação por cliente"
                        porCategoria={[
                          ...mes.porCliente.slice(0, 7).map((f) => ({ categoria: f.rotulo, rotulo: f.rotulo, centavos: f.centavos })),
                          ...(mes.porCliente.length > 7
                            ? [{ categoria: "outros", rotulo: `Outros ${mes.porCliente.length - 7}`, centavos: mes.porCliente.slice(7).reduce((t, f) => t + f.centavos, 0) }]
                            : []),
                        ]}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="vazio">Nada vence em {longo(mes.competencia)}.</p>
              )}
              {mes.linhas.length ? (
                <div>
                  <button type="button" className="botao-discreto" onClick={() => setVerLinhas(!verLinhas)} aria-expanded={verLinhas}>
                    {verLinhas ? "Esconder as cobranças" : `Ver as ${mes.linhas.length} cobrança(s) do mês`}
                  </button>
                  {verLinhas ? (
                    <div className="mt-2 overflow-x-auto">
                      <table className="tabela">
                        <thead>
                          <tr>
                            <th>Vence</th>
                            <th>Cliente</th>
                            <th>Descrição</th>
                            <th className="text-right">Valor</th>
                            <th>Situação</th>
                            <th>Fonte</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mes.linhas.map((l) => (
                            <tr key={l.chave}>
                              <td className="tabular-nums">{diaBR(l.vencimento)}</td>
                              <td>{l.cliente}</td>
                              <td className="text-slate-600">{l.descricao}</td>
                              <td className="text-right tabular-nums">{emReais(l.valorCentavos)}</td>
                              <td>{l.pago ? "pago" : l.recebidoCentavos ? `${emReais(l.recebidoCentavos)} recebido` : "em aberto"}</td>
                              <td>
                                <span className={l.fonte === "PROJETADA" ? "etiqueta-atencao" : "etiqueta-neutra"}>{FONTE[l.fonte]}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {dados.pendencias.length ? (
            <div className="mt-5">
              <h3 className="font-semibold">Por que este número pode diferir de Cobranças</h3>
              <ul className="mt-1 grid gap-1 text-sm text-slate-700">
                {dados.pendencias.map((p) => (
                  <li key={p.texto}>
                    {p.texto}
                    {p.centavos ? ` (${emReais(p.centavos)})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
