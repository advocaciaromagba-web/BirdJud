"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SeletorDeCliente, type ClienteParaEscolher } from "./SeletorDeCliente";

export type MensalidadeNaTela = {
  id: string;
  cliente: string;
  descricao: string;
  valor: string;
  ciclo: string;
  proximoVencimento: string;
  status: string;
  importada: boolean;
  motivoEncerramento: string | null;
};

type DeFora = {
  idNoProvedor: string;
  descricao: string;
  valorCentavos: number;
  ciclo: string | null;
  cicloNoAsaas: string;
  proximoVencimento: string | null;
  ativa: boolean;
  pagador: { nome: string | null; documento: string | null };
  clienteSugerido: { id: string; nome: string } | null;
};

const COR: Record<string, string> = {
  ATIVA: "bg-emerald-100 text-emerald-800",
  SUSPENSA: "bg-amber-100 text-amber-900",
  ENCERRADA: "bg-slate-100 text-slate-500",
};
const ROTULO: Record<string, string> = { ATIVA: "Ativa", SUSPENSA: "Suspensa", ENCERRADA: "Encerrada" };

const reais = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const diaBR = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

/**
 * Mensalidades: cobranca que se repete sem data para acabar. Quem gera cada
 * boleto e o Asaas; a tela mostra, cria, muda o valor, suspende, reativa,
 * encerra — e traz o que ja existia no painel do Asaas.
 */
export function PainelMensalidades({
  mensalidades,
  clientes,
  ciclos,
  podeEditarCliente,
}: {
  mensalidades: MensalidadeNaTela[];
  clientes: ClienteParaEscolher[];
  ciclos: { valor: string; rotulo: string }[];
  podeEditarCliente: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [recado, setRecado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [nova, setNova] = useState({ clienteId: "", descricao: "Mensalidade de assessoria jurídica", valor: "", ciclo: "MENSAL", forma: "QUALQUER", primeiroVencimento: "", documento: "" });
  const [deFora, setDeFora] = useState<DeFora[] | null>(null);
  const [escolhaDeFora, setEscolhaDeFora] = useState<Record<string, string>>({});

  const semDocumento = nova.clienteId && !clientes.find((c) => c.id === nova.clienteId)?.documento;

  async function chamar(chave: string, url: string, metodo: string, corpo?: unknown, sucesso = "Feito.") {
    setOcupado(chave);
    setRecado(null);
    try {
      const r = await fetch(url, {
        method: metodo,
        headers: corpo ? { "Content-Type": "application/json" } : undefined,
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        setRecado({ ok: false, texto: json.erro ?? "Não deu certo." });
        return null;
      }
      setRecado({ ok: true, texto: sucesso });
      router.refresh();
      return json;
    } catch {
      setRecado({ ok: false, texto: "Não consegui falar com o servidor." });
      return null;
    } finally {
      setOcupado(null);
    }
  }

  const ativas = mensalidades.filter((m) => m.status !== "ENCERRADA");

  return (
    <section className="cartao mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Mensalidades</h2>
        <p className="text-sm text-slate-500">{ativas.length} de pé · o Asaas gera cada boleto e ele aparece na lista abaixo</p>
      </div>

      {mensalidades.length ? (
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {mensalidades.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${COR[m.status] ?? ""}`}>{ROTULO[m.status] ?? m.status}</span>
              <span className="font-medium">{m.cliente}</span>
              <span className="text-slate-600">{m.descricao}</span>
              <span className="tabular-nums">{m.valor}</span>
              <span className="text-slate-500">{m.ciclo}</span>
              {m.status !== "ENCERRADA" ? <span className="text-slate-500">próximo {m.proximoVencimento}</span> : null}
              {m.importada ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">trazida do Asaas</span> : null}
              {m.motivoEncerramento ? <span className="text-xs text-slate-500">{m.motivoEncerramento}</span> : null}
              {m.status !== "ENCERRADA" ? (
                <span className="ml-auto flex flex-wrap gap-3 text-xs">
                  <button type="button" className="underline" disabled={!!ocupado} onClick={() => chamar(m.id, `/api/mensalidades/${m.id}`, "PATCH", { acao: "SINCRONIZAR" }, "Conferida no Asaas.")}>
                    conferir
                  </button>
                  <button
                    type="button"
                    className="underline"
                    disabled={!!ocupado}
                    onClick={() => {
                      const valor = window.prompt("Novo valor da mensalidade (vale também para o boleto deste mês ainda não pago):", m.valor.replace("R$", "").trim());
                      if (valor) void chamar(m.id, `/api/mensalidades/${m.id}`, "PATCH", { acao: "VALOR", valor }, "Valor alterado no Asaas.");
                    }}
                  >
                    mudar valor
                  </button>
                  {m.status === "ATIVA" ? (
                    <button
                      type="button"
                      className="underline"
                      disabled={!!ocupado}
                      onClick={() =>
                        window.confirm("Suspender: o Asaas para de gerar boletos novos, e o que já está com o cliente continua valendo. Suspender?") &&
                        chamar(m.id, `/api/mensalidades/${m.id}`, "PATCH", { acao: "SUSPENDER" }, "Suspensa.")
                      }
                    >
                      suspender
                    </button>
                  ) : (
                    <button type="button" className="underline" disabled={!!ocupado} onClick={() => chamar(m.id, `/api/mensalidades/${m.id}`, "PATCH", { acao: "REATIVAR" }, "Reativada.")}>
                      reativar
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-red-700 underline"
                    disabled={!!ocupado}
                    onClick={() => {
                      if (!window.confirm("Encerrar de vez: o Asaas APAGA os boletos em aberto e vencidos desta mensalidade (os pagos ficam). Para só parar de gerar, use suspender. Encerrar?")) return;
                      const motivo = window.prompt("Motivo (fica registrado):") ?? null;
                      void chamar(m.id, `/api/mensalidades/${m.id}`, "PATCH", { acao: "ENCERRAR", motivo }, "Encerrada.");
                    }}
                  >
                    encerrar
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">Nenhuma mensalidade ainda.</p>
      )}

      {recado ? (
        <p role="status" className={`mt-2 text-sm ${recado.ok ? "text-emerald-700" : "text-red-700"}`}>
          {recado.texto}
        </p>
      ) : null}

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-marca">Nova mensalidade</summary>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await chamar(
              "nova",
              "/api/mensalidades",
              "POST",
              {
                clienteId: nova.clienteId,
                descricao: nova.descricao,
                valor: nova.valor,
                ciclo: nova.ciclo,
                forma: nova.forma,
                primeiroVencimento: nova.primeiroVencimento,
                ...(semDocumento ? { documentoDoCliente: nova.documento } : {}),
              },
              "Mensalidade criada no Asaas.",
            );
            if (r) setNova({ ...nova, clienteId: "", valor: "", primeiroVencimento: "", documento: "" });
          }}
        >
          <label className="grid gap-1 sm:col-span-2">
            <span className="rotulo">Cliente *</span>
            <SeletorDeCliente clientes={clientes} valor={nova.clienteId} aoMudar={(id) => setNova({ ...nova, clienteId: id ?? "" })} vazio="Escolha o cliente" required />
          </label>
          {semDocumento ? (
            <label className="grid gap-1 sm:col-span-2">
              <span className="rotulo">CPF/CNPJ do cliente *</span>
              <input className="campo" required value={nova.documento} onChange={(e) => setNova({ ...nova, documento: e.target.value })} disabled={!podeEditarCliente} />
              <span className="ajuda">
                {podeEditarCliente ? "O Asaas exige. O número é gravado no cadastro do cliente." : "O cliente está sem CPF/CNPJ e seu acesso a Clientes está fechado."}
              </span>
            </label>
          ) : null}
          <label className="grid gap-1 sm:col-span-2">
            <span className="rotulo">Descrição *</span>
            <input className="campo" required minLength={2} maxLength={200} value={nova.descricao} onChange={(e) => setNova({ ...nova, descricao: e.target.value })} />
          </label>
          <label className="grid gap-1">
            <span className="rotulo">Valor (R$) *</span>
            <input className="campo" required inputMode="decimal" placeholder="1.500,00" value={nova.valor} onChange={(e) => setNova({ ...nova, valor: e.target.value })} />
          </label>
          <label className="grid gap-1">
            <span className="rotulo">Repete *</span>
            <select className="campo" value={nova.ciclo} onChange={(e) => setNova({ ...nova, ciclo: e.target.value })}>
              {ciclos.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="rotulo">Primeiro vencimento *</span>
            <input className="campo" type="date" required value={nova.primeiroVencimento} onChange={(e) => setNova({ ...nova, primeiroVencimento: e.target.value })} />
          </label>
          <label className="grid gap-1">
            <span className="rotulo">Forma *</span>
            <select className="campo" value={nova.forma} onChange={(e) => setNova({ ...nova, forma: e.target.value })}>
              <option value="QUALQUER">Cliente escolhe</option>
              <option value="BOLETO">Boleto</option>
              <option value="PIX">Pix</option>
              <option value="CARTAO">Cartão</option>
            </select>
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="botao-principal" disabled={!!ocupado || !nova.clienteId}>
              {ocupado === "nova" ? "Criando…" : "Criar mensalidade"}
            </button>
          </div>
        </form>
      </details>

      <details
        className="mt-3"
        onToggle={async (e) => {
          if (!(e.currentTarget as HTMLDetailsElement).open || deFora) return;
          setOcupado("deFora");
          const r = await fetch("/api/mensalidades/asaas").then((x) => x.json().then((j) => ({ ok: x.ok, j }))).catch(() => null);
          setOcupado(null);
          if (!r?.ok) {
            setRecado({ ok: false, texto: r?.j?.erro ?? "Não consegui ler o Asaas." });
            return;
          }
          setDeFora(r.j.assinaturas);
          setEscolhaDeFora(Object.fromEntries((r.j.assinaturas as DeFora[]).filter((a) => a.clienteSugerido).map((a) => [a.idNoProvedor, a.clienteSugerido!.id])));
        }}
      >
        <summary className="cursor-pointer text-sm font-semibold text-marca">Trazer do Asaas</summary>
        <p className="ajuda">
          Mensalidade criada direto no painel do Asaas não aparece aqui. Sem trazer, criar outra por aqui faria o cliente receber dois boletos no mês. Trazer não cria
          nada no Asaas, e o que já foi pago entra como recebido sem contar receita de novo no Financeiro.
        </p>
        {ocupado === "deFora" ? <p className="mt-2 text-sm text-slate-500">Lendo o Asaas…</p> : null}
        {deFora && deFora.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nada a trazer: tudo o que está no Asaas já está aqui.</p> : null}
        {deFora && deFora.length > 0 ? (
          <ul className="mt-2 grid gap-2 text-sm">
            {deFora.map((a) => (
              <li key={a.idNoProvedor} className="grid gap-2 rounded border border-slate-200 p-3 sm:grid-cols-[1fr_16rem_auto] sm:items-center">
                <div>
                  <p className="font-medium">
                    {a.pagador.nome ?? "Pagador sem nome"} {a.pagador.documento ? <span className="text-slate-500">· {a.pagador.documento}</span> : null}
                  </p>
                  <p className="text-slate-600">
                    {a.descricao} · {reais(a.valorCentavos)} · {a.ciclo ? ciclos.find((c) => c.valor === a.ciclo)?.rotulo : `ciclo ${a.cicloNoAsaas} desconhecido`} ·{" "}
                    {a.ativa ? `próximo ${diaBR(a.proximoVencimento)}` : "suspensa no Asaas"}
                  </p>
                  {!a.clienteSugerido ? <p className="text-xs text-amber-800">Não reconheci o cliente: escolha de quem é.</p> : null}
                </div>
                <SeletorDeCliente
                  clientes={clientes}
                  valor={escolhaDeFora[a.idNoProvedor] ?? ""}
                  aoMudar={(id) => setEscolhaDeFora({ ...escolhaDeFora, [a.idNoProvedor]: id ?? "" })}
                  vazio="De qual cliente?"
                />
                <button
                  type="button"
                  className="botao-discreto"
                  disabled={!!ocupado || !escolhaDeFora[a.idNoProvedor] || !a.ciclo}
                  onClick={async () => {
                    const r = await chamar(a.idNoProvedor, "/api/mensalidades/asaas", "POST", { idNoProvedor: a.idNoProvedor, clienteId: escolhaDeFora[a.idNoProvedor] }, "Trazida do Asaas.");
                    if (r) setDeFora(deFora.filter((x) => x.idNoProvedor !== a.idNoProvedor));
                  }}
                >
                  {ocupado === a.idNoProvedor ? "Trazendo…" : "Trazer"}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </details>
    </section>
  );
}
