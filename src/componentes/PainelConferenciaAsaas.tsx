"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Conferencia = {
  deFora: {
    idNoProvedor: string;
    cliente: string;
    descricao: string;
    valorCentavos: number;
    vencimento: string;
    situacao: string;
    pagoEm: string | null;
    daMensalidade: boolean;
  }[];
  divergentes: { cobrancaId: string; cliente: string; descricao: string; diferencas: string[] }[];
  semCliente: { pagador: string; documento: string | null; quantas: number; valorCentavos: number }[];
  porCliente: { clienteId: string; cliente: string; recebidoNoAsaas: number; previstoNoContrato: number }[];
};

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dia = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const SITUACAO: Record<string, string> = { ABERTA: "em aberto", VENCIDA: "vencida", PAGA: "paga", ESTORNADA: "estornada" };

/**
 * Conferencia das cobrancas do Asaas contra o sistema. O Asaas manda: aqui
 * so se traz o que falta (marcando uma a uma) e se aponta o que nao bate.
 * Nada e alterado no Asaas.
 */
export function PainelConferenciaAsaas({
  foraDoSistema,
  conferidoEm,
  podeTrazer,
}: {
  foraDoSistema: number | null;
  conferidoEm: string | null;
  podeTrazer: boolean;
}) {
  const router = useRouter();
  const [dados, setDados] = useState<Conferencia | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [lancarReceita, setLancarReceita] = useState(true);

  async function conferir() {
    setOcupado(true);
    setRecado(null);
    try {
      const r = await fetch("/api/cobrancas/conferencia");
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setRecado({ ok: false, texto: j.erro ?? "Não consegui ler o Asaas." });
        return;
      }
      setDados(j);
      setMarcadas(new Set());
    } finally {
      setOcupado(false);
    }
  }

  const traziveis = dados?.deFora.filter((d) => !d.daMensalidade) ?? [];
  const deMensalidade = dados?.deFora.filter((d) => d.daMensalidade) ?? [];

  return (
    <section className="cartao mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Conferir com o Asaas</h2>
        <button type="button" className="botao-discreto" disabled={ocupado} onClick={conferir}>
          {ocupado ? "Lendo o Asaas…" : dados ? "Conferir de novo" : "Conferir agora"}
        </button>
      </div>
      <p className="ajuda">
        Cobrança criada direto no painel do Asaas não aparece aqui, e o que o cliente paga nela não entra no levantamento. A conferência lê o Asaas (último ano) e
        não muda nada lá.
      </p>
      {!dados && foraDoSistema ? (
        <p className="mt-2 text-sm font-medium text-amber-800">
          Na última conferência{conferidoEm ? ` (${conferidoEm})` : ""}, {foraDoSistema} cobrança(s) do Asaas não estavam no sistema.
        </p>
      ) : null}
      {recado ? (
        <p role="status" className={`mt-2 text-sm ${recado.ok ? "text-emerald-700" : "text-red-700"}`}>
          {recado.texto}
        </p>
      ) : null}

      {dados ? (
        <div className="mt-4 grid gap-5 text-sm">
          <div>
            <h3 className="font-semibold">No Asaas e não aqui ({traziveis.length})</h3>
            {traziveis.length ? (
              <>
                <ul className="mt-2 divide-y divide-slate-100">
                  {traziveis.map((d) => (
                    <li key={d.idNoProvedor} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                      {podeTrazer ? (
                        <input
                          type="checkbox"
                          aria-label={`Trazer ${d.descricao} de ${d.cliente}`}
                          checked={marcadas.has(d.idNoProvedor)}
                          onChange={(e) => {
                            const n = new Set(marcadas);
                            if (e.target.checked) n.add(d.idNoProvedor);
                            else n.delete(d.idNoProvedor);
                            setMarcadas(n);
                          }}
                        />
                      ) : null}
                      <span className="font-medium">{d.cliente}</span>
                      <span className="text-slate-600">{d.descricao}</span>
                      <span className="tabular-nums">{reais(d.valorCentavos)}</span>
                      <span className="text-slate-500">vence {dia(d.vencimento)}</span>
                      <span className={d.situacao === "PAGA" ? "text-emerald-700" : "text-slate-500"}>
                        {SITUACAO[d.situacao] ?? d.situacao}
                        {d.pagoEm ? ` em ${dia(d.pagoEm)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                {podeTrazer ? (
                  <div className="mt-2 grid gap-2">
                    <label className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" checked={lancarReceita} onChange={(e) => setLancarReceita(e.target.checked)} />
                      <span>
                        O que já foi pago entra quitado e lança a receita no Financeiro, na data real do pagamento. Desmarque se esses recebimentos já foram
                        lançados à mão, para não contar duas vezes.
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="botao-discreto" onClick={() => setMarcadas(new Set(traziveis.map((d) => d.idNoProvedor)))}>
                        Marcar todas
                      </button>
                      <button
                        type="button"
                        className="botao-principal"
                        disabled={ocupado || marcadas.size === 0}
                        onClick={async () => {
                          setOcupado(true);
                          const r = await fetch("/api/cobrancas/conferencia", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ ids: [...marcadas], lancarReceita }),
                          });
                          const j = await r.json().catch(() => ({}));
                          setOcupado(false);
                          if (!r.ok) {
                            setRecado({ ok: false, texto: j.erro ?? "Não deu certo." });
                            return;
                          }
                          setRecado({
                            ok: (j.recusadas ?? []).length === 0,
                            texto: `${j.trazidas} trazida(s).${(j.recusadas ?? []).length ? ` Ficaram de fora: ${j.recusadas.join("; ")}` : ""}`,
                          });
                          router.refresh();
                          await conferir();
                        }}
                      >
                        Trazer {marcadas.size || ""} marcada(s)
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mt-1 text-slate-500">Nada: tudo o que está no Asaas com cliente cadastrado já está aqui.</p>
            )}
            {deMensalidade.length ? (
              <p className="mt-2 text-slate-600">
                Mais {deMensalidade.length} cobrança(s) de mensalidades do Asaas ainda não ligadas: use <strong>Trazer do Asaas</strong> no quadro das
                mensalidades, que traz a mensalidade e todas as cobranças dela.
              </p>
            ) : null}
          </div>

          <div>
            <h3 className="font-semibold">Nos dois, mas não bate ({dados.divergentes.length})</h3>
            <p className="ajuda">Só aponta: mudar cobrança emitida é decisão de quem cobra.</p>
            {dados.divergentes.length ? (
              <ul className="mt-1 grid gap-1">
                {dados.divergentes.map((d) => (
                  <li key={d.cobrancaId}>
                    <span className="font-medium">{d.cliente}</span> · {d.descricao}: <span className="text-amber-800">{d.diferencas.join("; ")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-slate-500">Nenhuma diferença.</p>
            )}
          </div>

          {dados.semCliente.length ? (
            <div>
              <h3 className="font-semibold">Pagador fora do cadastro ({dados.semCliente.length})</h3>
              <p className="ajuda">Não dá para trazer sem o cliente. Cadastre-o (com o mesmo CPF/CNPJ) e confira de novo.</p>
              <ul className="mt-1 grid gap-1">
                {dados.semCliente.map((s) => (
                  <li key={`${s.pagador}-${s.documento}`}>
                    <span className="font-medium">{s.pagador}</span>
                    {s.documento ? ` · ${s.documento}` : ""} · {s.quantas} cobrança(s), {reais(s.valorCentavos)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {dados.porCliente.length ? (
            <div>
              <h3 className="font-semibold">Recebido no Asaas contra o previsto no contrato (último ano)</h3>
              <ul className="mt-1 grid gap-1">
                {dados.porCliente.map((c) => (
                  <li key={c.clienteId}>
                    <span className="font-medium">{c.cliente}</span>: recebido {reais(c.recebidoNoAsaas)} · previsto {reais(c.previstoNoContrato)}
                    <span className={c.recebidoNoAsaas < c.previstoNoContrato ? " text-red-700" : " text-slate-500"}>
                      {" "}
                      ({c.recebidoNoAsaas < c.previstoNoContrato ? "faltam" : "a mais"} {reais(Math.abs(c.previstoNoContrato - c.recebidoNoAsaas))})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
