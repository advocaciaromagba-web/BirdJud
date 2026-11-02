"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export type BaixaNaTela = {
  id: string;
  valor: string;
  data: string;
  observacao: string | null;
  registradoPor: string | null;
  forma: string | null;
  recebidoPor: string | null;
};

const FORMAS = [
  ["DINHEIRO", "Dinheiro"],
  ["PIX", "Pix"],
  ["TRANSFERENCIA", "Transferência"],
  ["CARTAO", "Cartão"],
  ["BOLETO", "Boleto"],
  ["CHEQUE", "Cheque"],
  ["OUTRO", "Outro"],
] as const;

export type CobrancaNaTela = {
  id: string;
  clienteId: string;
  cliente: string;
  descricao: string;
  valorCentavos: number;
  /** O que ja entrou (baixas manuais ou o pagamento inteiro). */
  recebidoCentavos: number;
  vencimentoISO: string;
  forma: string;
  status: string;
  provedor: string;
  linkPagamento: string | null;
  pagoEm: string | null;
  parcela: string | null;
  deMensalidade: boolean;
  baixas: BaixaNaTela[];
};

const CORES: Record<string, string> = {
  ABERTA: "bg-slate-100 text-slate-700",
  PARCIAL: "bg-sky-100 text-sky-800",
  PAGA: "bg-emerald-100 text-emerald-800",
  VENCIDA: "bg-amber-100 text-amber-900",
  CANCELADA: "bg-slate-100 text-slate-500",
  ESTORNADA: "bg-rose-100 text-rose-800",
  PENDENTE: "bg-amber-100 text-amber-900",
};
const ROTULOS: Record<string, string> = {
  ABERTA: "Em aberto",
  PARCIAL: "Paga em parte",
  PAGA: "Paga",
  VENCIDA: "Vencida",
  CANCELADA: "Cancelada",
  ESTORNADA: "Estornada",
  PENDENTE: "Emissão pendente",
};
const FILTROS = [
  { chave: "ABERTAS", rotulo: "A receber" },
  { chave: "VENCIDA", rotulo: "Vencidas" },
  { chave: "PARCIAL", rotulo: "Pagas em parte" },
  { chave: "PAGA", rotulo: "Pagas" },
  { chave: "TODAS", rotulo: "Todas" },
];

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dia = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const hojeISO = () => new Date().toISOString().slice(0, 10);
const abertas = (s: string) => s === "ABERTA" || s === "VENCIDA" || s === "PARCIAL";

/**
 * Cobrancas do escritorio: o que ha para receber e o que ha para pagar.
 *
 * Agrupado por cliente, com quem esta atrasado em cima — e o que se olha
 * primeiro. Cada parcela continua sendo uma cobranca propria, agora dita
 * "parcela 2 de 3" em vez de perdida numa tabela larga.
 */
export function PainelCobrancas({
  cobrancas,
  resumo,
  aPagar,
  equipe,
}: {
  cobrancas: CobrancaNaTela[];
  /** Quem pode ter recebido o dinheiro. */
  equipe: string[];
  resumo: { emAberto: number; vencido: number; recebido30: number };
  /** Aba "A pagar": o conteudo pronto (ou o aviso de que esta trancado). */
  aPagar: ReactNode;
}) {
  const router = useRouter();
  const [aba, setAba] = useState<"RECEBER" | "PAGAR">("RECEBER");
  const [filtro, setFiltro] = useState("ABERTAS");
  const [busca, setBusca] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aberta, setAberta] = useState<{ id: string; acao: "BAIXA" | "REEMITIR" } | null>(null);
  const [form, setForm] = useState({ valor: "", data: hojeISO(), observacao: "", vencimento: "", forma: "", recebidoPor: "" });
  const [recadoDe, setRecadoDe] = useState<Record<string, { ok: boolean; texto: string; link?: string | null; linha?: string | null }>>({});

  const grupos = useMemo(() => {
    const termo = semAcento(busca.trim());
    const hoje = hojeISO();
    const lista = cobrancas.filter((c) => {
      if (termo && !semAcento(`${c.cliente} ${c.descricao}`).includes(termo)) return false;
      if (filtro === "ABERTAS") return abertas(c.status) || c.status === "PENDENTE";
      if (filtro === "VENCIDA") return abertas(c.status) && c.vencimentoISO.slice(0, 10) < hoje;
      if (filtro === "TODAS") return true;
      return c.status === filtro;
    });
    const porCliente = new Map<string, CobrancaNaTela[]>();
    for (const c of lista) porCliente.set(c.clienteId, [...(porCliente.get(c.clienteId) ?? []), c]);
    return [...porCliente.values()]
      .map((itens) => {
        itens.sort((a, b) => a.vencimentoISO.localeCompare(b.vencimentoISO));
        const atrasado = itens.filter((c) => abertas(c.status) && c.vencimentoISO.slice(0, 10) < hoje).reduce((t, c) => t + c.valorCentavos - c.recebidoCentavos, 0);
        const devendo = itens.filter((c) => abertas(c.status)).reduce((t, c) => t + c.valorCentavos - c.recebidoCentavos, 0);
        return { cliente: itens[0].cliente, itens, atrasado, devendo };
      })
      .sort((a, b) => b.atrasado - a.atrasado || b.devendo - a.devendo || a.cliente.localeCompare(b.cliente));
  }, [cobrancas, filtro, busca]);

  async function chamar(chave: string, url: string, metodo: string, corpo?: unknown) {
    setOcupado(chave);
    setAviso(null);
    try {
      const r = await fetch(url, { method: metodo, headers: corpo ? { "Content-Type": "application/json" } : undefined, body: corpo ? JSON.stringify(corpo) : undefined });
      const json = await r.json().catch(() => ({}));
      return { ok: r.ok, json };
    } catch {
      return { ok: false, json: { erro: "Não consegui falar com o servidor." } };
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section className="mt-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="cartao-aperto">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Em aberto</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{reais(resumo.emAberto)}</p>
        </div>
        <div className="cartao-aperto">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vencido</p>
          <p className={`mt-1 text-xl font-bold tabular-nums ${resumo.vencido ? "text-red-700" : ""}`}>{reais(resumo.vencido)}</p>
        </div>
        <div className="cartao-aperto">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recebido em 30 dias</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{reais(resumo.recebido30)}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-b border-slate-200" role="tablist">
        {(
          [
            ["RECEBER", "A receber"],
            ["PAGAR", "A pagar"],
          ] as const
        ).map(([chave, rotulo]) => (
          <button
            key={chave}
            type="button"
            role="tab"
            aria-selected={aba === chave}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${aba === chave ? "border-marca text-marca" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            onClick={() => setAba(chave)}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === "PAGAR" ? (
        <div className="mt-4">{aPagar}</div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input className="campo max-w-xs" placeholder="Buscar cliente ou descrição…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar cobrança" />
            <nav className="flex flex-wrap gap-1 text-sm" aria-label="Filtrar por situação">
              {FILTROS.map((f) => (
                <button
                  key={f.chave}
                  type="button"
                  aria-pressed={filtro === f.chave}
                  className={`rounded-full border px-3 py-1 ${filtro === f.chave ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
                  onClick={() => setFiltro(f.chave)}
                >
                  {f.rotulo}
                </button>
              ))}
            </nav>
            <button
              type="button"
              disabled={!!ocupado}
              className="ml-auto rounded border border-slate-300 px-3 py-1.5 text-sm hover:border-marca disabled:opacity-50"
              onClick={async () => {
                const r = await chamar("sinc", "/api/cobrancas", "PATCH", { acao: "SINCRONIZAR" });
                const res = (r.json.resultado ?? {}) as { conferidas?: number; pagas?: number };
                setAviso(r.ok ? `${res.conferidas ?? 0} conferida(s), ${res.pagas ?? 0} baixada(s).` : (r.json.erro ?? "Não foi possível falar com o Asaas."));
                if (r.ok) router.refresh();
              }}
            >
              {ocupado === "sinc" ? "Conferindo…" : "Conferir no Asaas"}
            </button>
          </div>
          {aviso ? <p className="mt-2 text-sm text-slate-600">{aviso}</p> : null}

          {grupos.length === 0 ? (
            <p className="mt-6 text-slate-600">{cobrancas.length ? "Nada com este filtro." : "Nenhuma cobrança emitida ainda."}</p>
          ) : (
            <div className="mt-4 grid gap-4">
              {grupos.map((g) => (
                <div key={g.cliente} className="cartao-aperto">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-semibold">{g.cliente}</h3>
                    <p className="text-sm">
                      {g.devendo ? <span className="tabular-nums">{reais(g.devendo)} a receber</span> : null}
                      {g.atrasado ? <span className="ml-2 font-semibold text-red-700 tabular-nums">{reais(g.atrasado)} atrasado</span> : null}
                    </p>
                  </div>
                  <ul className="mt-2 divide-y divide-slate-100">
                    {g.itens.map((c) => {
                      const falta = c.valorCentavos - c.recebidoCentavos;
                      const atrasada = abertas(c.status) && c.vencimentoISO.slice(0, 10) < hojeISO();
                      const recado = recadoDe[c.id];
                      return (
                        <li key={c.id} className="py-2 text-sm">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${CORES[atrasada && c.status === "ABERTA" ? "VENCIDA" : c.status] ?? ""}`}>
                              {atrasada && c.status === "ABERTA" ? "Vencida" : (ROTULOS[c.status] ?? c.status)}
                            </span>
                            <span className="font-semibold tabular-nums">{reais(c.valorCentavos)}</span>
                            <span className="text-slate-700">{c.descricao}</span>
                            {c.parcela ? <span className="text-xs text-slate-500">{c.parcela}</span> : null}
                            {c.deMensalidade ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">mensalidade</span> : null}
                            <span className="ml-auto text-slate-500">
                              {c.status === "PAGA" && c.pagoEm ? `pago em ${c.pagoEm}` : `vence em ${dia(c.vencimentoISO)}`}
                            </span>
                          </div>
                          {c.status === "PARCIAL" ? (
                            <p className="mt-0.5 text-xs text-sky-800">
                              Recebido {reais(c.recebidoCentavos)} · falta {reais(falta)}
                            </p>
                          ) : null}
                          {c.baixas.length ? (
                            <ul className="mt-1 grid gap-0.5 text-xs text-slate-600">
                              {c.baixas.map((b) => (
                                <li key={b.id}>
                                  Baixa de {b.valor} em {b.data}
                                  {b.forma ? ` · ${FORMAS.find(([f]) => f === b.forma)?.[1] ?? b.forma}` : ""}
                                  {b.recebidoPor ? ` · recebido por ${b.recebidoPor}` : ""}
                                  {b.registradoPor ? ` · lançado por ${b.registradoPor}` : ""}
                                  {b.observacao ? ` — ${b.observacao}` : ""}{" "}
                                  <button
                                    type="button"
                                    className="underline"
                                    disabled={!!ocupado}
                                    onClick={async () => {
                                      if (!window.confirm("Desfazer esta baixa? A receita que ela lançou no Financeiro sai junto.")) return;
                                      const r = await chamar(`d:${b.id}`, `/api/cobrancas/${c.id}/baixa?baixa=${b.id}`, "DELETE");
                                      setRecadoDe({ ...recadoDe, [c.id]: { ok: r.ok, texto: r.ok ? "Baixa desfeita." : (r.json.erro ?? "Não deu certo.") } });
                                      if (r.ok) router.refresh();
                                    }}
                                  >
                                    desfazer
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          <div className="mt-1 flex flex-wrap gap-3 text-xs">
                            {c.linkPagamento ? (
                              <a href={c.linkPagamento} target="_blank" rel="noreferrer" className="text-marca underline">
                                link de pagamento
                              </a>
                            ) : null}
                            {abertas(c.status) ? (
                              <button
                                type="button"
                                className="underline"
                                onClick={() => {
                                  setForm({ ...form, valor: (falta / 100).toFixed(2).replace(".", ","), data: hojeISO(), observacao: "", forma: "", recebidoPor: "" });
                                  setAberta(aberta?.id === c.id && aberta.acao === "BAIXA" ? null : { id: c.id, acao: "BAIXA" });
                                }}
                              >
                                dar baixa
                              </button>
                            ) : null}
                            {(c.status === "ABERTA" || c.status === "VENCIDA") && c.provedor === "ASAAS" ? (
                              <button
                                type="button"
                                className="underline"
                                onClick={() => {
                                  setForm({ ...form, vencimento: "", valor: "" });
                                  setAberta(aberta?.id === c.id && aberta.acao === "REEMITIR" ? null : { id: c.id, acao: "REEMITIR" });
                                }}
                              >
                                reemitir boleto
                              </button>
                            ) : null}
                            {c.status === "ABERTA" || c.status === "VENCIDA" ? (
                              <button
                                type="button"
                                className="text-red-700 underline"
                                disabled={!!ocupado}
                                onClick={async () => {
                                  if (!window.confirm(`Cancelar a cobrança de ${reais(c.valorCentavos)} de ${c.cliente}? Ela é apagada no Asaas.`)) return;
                                  const r = await chamar(`c:${c.id}`, "/api/cobrancas", "PATCH", { acao: "CANCELAR", id: c.id });
                                  setRecadoDe({ ...recadoDe, [c.id]: { ok: r.ok, texto: r.ok ? "Cancelada." : (r.json.erro ?? "Não deu certo.") } });
                                  if (r.ok) router.refresh();
                                }}
                              >
                                cancelar
                              </button>
                            ) : null}
                            {c.status === "PENDENTE" ? (
                              <button
                                type="button"
                                className="underline"
                                disabled={!!ocupado}
                                onClick={async () => {
                                  const r = await chamar(`k:${c.id}`, "/api/cobrancas", "PATCH", { acao: "CONCILIAR", id: c.id });
                                  setRecadoDe({ ...recadoDe, [c.id]: { ok: r.ok, texto: r.ok ? "Conciliada com o Asaas." : (r.json.erro ?? "Não deu certo.") } });
                                  if (r.ok) router.refresh();
                                }}
                              >
                                conciliar com o Asaas
                              </button>
                            ) : null}
                          </div>

                          {aberta?.id === c.id && aberta.acao === "BAIXA" ? (
                            <form
                              className="mt-2 grid gap-2 rounded border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[8rem_10rem_9rem_12rem] lg:grid-cols-[8rem_10rem_9rem_12rem_1fr_auto] sm:items-end"
                              onSubmit={async (e) => {
                                e.preventDefault();
                                const r = await chamar(`b:${c.id}`, `/api/cobrancas/${c.id}/baixa`, "POST", {
                                  valor: form.valor,
                                  data: form.data,
                                  observacao: form.observacao || null,
                                  forma: form.forma,
                                  recebidoPor: form.recebidoPor || null,
                                });
                                setRecadoDe({
                                  ...recadoDe,
                                  [c.id]: r.ok
                                    ? r.json.avisoDoAsaas
                                      ? { ok: false, texto: r.json.avisoDoAsaas }
                                      : { ok: true, texto: r.json.quitou ? "Baixa registrada: cobrança quitada." : "Baixa parcial registrada." }
                                    : { ok: false, texto: r.json.erro ?? "Não deu certo." },
                                });
                                if (r.ok) {
                                  setAberta(null);
                                  router.refresh();
                                }
                              }}
                            >
                              <label className="grid gap-1">
                                <span className="rotulo">Valor recebido</span>
                                <input className="campo" inputMode="decimal" required value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
                              </label>
                              <label className="grid gap-1">
                                <span className="rotulo">Pago em</span>
                                <input className="campo" type="date" required max={hojeISO()} value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
                              </label>
                              <label className="grid gap-1">
                                <span className="rotulo">Forma</span>
                                <select className="campo" required value={form.forma} onChange={(e) => setForm({ ...form, forma: e.target.value })}>
                                  <option value="">Escolha</option>
                                  {FORMAS.map(([f, rotulo]) => (
                                    <option key={f} value={f}>
                                      {rotulo}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="grid gap-1">
                                <span className="rotulo">Quem recebeu</span>
                                <select className="campo" value={form.recebidoPor} onChange={(e) => setForm({ ...form, recebidoPor: e.target.value })}>
                                  <option value="">Não informado</option>
                                  {equipe.map((nome) => (
                                    <option key={nome} value={nome}>
                                      {nome}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="grid gap-1">
                                <span className="rotulo">Observação</span>
                                <input className="campo" maxLength={300} placeholder="Ex.: pago em dinheiro no escritório" value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
                              </label>
                              <button type="submit" className="botao-principal" disabled={!!ocupado}>
                                {ocupado === `b:${c.id}` ? "…" : "Registrar"}
                              </button>
                              <p className="ajuda sm:col-span-4 lg:col-span-6">
                                Menos que o total deixa a cobrança paga em parte. Quitada por aqui, o boleto no Asaas é dado como recebido em dinheiro e deixa de valer.
                              </p>
                            </form>
                          ) : null}

                          {aberta?.id === c.id && aberta.acao === "REEMITIR" ? (
                            <form
                              className="mt-2 grid gap-2 rounded border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[10rem_8rem_auto] sm:items-end"
                              onSubmit={async (e) => {
                                e.preventDefault();
                                const r = await chamar(`r:${c.id}`, `/api/cobrancas/${c.id}/reemitir`, "POST", { vencimento: form.vencimento, valor: form.valor || null });
                                setRecadoDe({
                                  ...recadoDe,
                                  [c.id]: r.ok
                                    ? { ok: true, texto: "Boleto reemitido. O cliente não foi avisado: repasse o link.", link: r.json.linkBoleto ?? r.json.linkPagamento, linha: r.json.linhaDigitavel }
                                    : { ok: false, texto: r.json.erro ?? "Não deu certo." },
                                });
                                if (r.ok) {
                                  setAberta(null);
                                  router.refresh();
                                }
                              }}
                            >
                              <label className="grid gap-1">
                                <span className="rotulo">Novo vencimento</span>
                                <input className="campo" type="date" required min={hojeISO()} value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} />
                              </label>
                              <label className="grid gap-1">
                                <span className="rotulo">Novo valor</span>
                                <input className="campo" inputMode="decimal" placeholder="o mesmo" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
                              </label>
                              <button type="submit" className="botao-principal" disabled={!!ocupado}>
                                {ocupado === `r:${c.id}` ? "…" : "Reemitir"}
                              </button>
                            </form>
                          ) : null}

                          {recado ? (
                            <div role="status" className={`mt-1 text-xs ${recado.ok ? "text-emerald-700" : "text-red-700"}`}>
                              {recado.texto}
                              {recado.link ? (
                                <a href={recado.link} target="_blank" rel="noreferrer" className="ml-2 underline">
                                  abrir boleto
                                </a>
                              ) : null}
                              {recado.linha ? (
                                <span className="mt-1 block break-all font-mono text-slate-700">
                                  {recado.linha}{" "}
                                  <button type="button" className="font-sans underline" onClick={() => navigator.clipboard?.writeText(recado.linha!)}>
                                    copiar
                                  </button>
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
