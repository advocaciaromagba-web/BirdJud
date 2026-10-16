"use client";

import { useState } from "react";

type Opcao = { parcelas: number; totalCentavos: number; parcelaCentavos: number; tarifaCentavos: number };

const reais = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);

/**
 * "Parcelar no cartao" da fatura anual. O escritorio escolhe em quantas
 * vezes, ve o total com a tarifa do cartao (repassada) e vai direto para a
 * tela de pagamento do Asaas.
 */
export function ParcelarFatura({ faturaId, opcoes }: { faturaId: string; opcoes: Opcao[] }) {
  const [aberto, setAberto] = useState(false);
  const [parcelas, setParcelas] = useState(opcoes[opcoes.length - 1]?.parcelas ?? 12);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const escolhida = opcoes.find((o) => o.parcelas === parcelas);

  async function parcelar() {
    if (!escolhida) return;
    if (!window.confirm(
      `Pagar em ${escolhida.parcelas}x de ${reais(escolhida.parcelaCentavos)} no cartao de credito ` +
        `(total ${reais(escolhida.totalCentavos)}, com a tarifa do cartao)? O boleto e o Pix desta fatura deixam de valer.`,
    )) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/plano/faturas/${faturaId}/parcelar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parcelas }),
      });
      const corpo = (await r.json().catch(() => ({}))) as { erro?: string; linkPagamento?: string | null };
      if (!r.ok) throw new Error(corpo.erro ?? "Nao foi possivel parcelar.");
      if (corpo.linkPagamento) window.location.href = corpo.linkPagamento;
      else window.location.reload();
    } catch (e) {
      setErro((e as Error).message);
      setEnviando(false);
    }
  }

  if (!aberto) {
    return (
      <button type="button" className="botao-secundario" onClick={() => setAberto(true)}>
        Parcelar no cartao
      </button>
    );
  }

  return (
    <div className="grid gap-2">
      <label className="text-sm">
        <span className="block font-medium">Em quantas vezes</span>
        <select className="campo mt-1" value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>
          {opcoes.map((o) => (
            <option key={o.parcelas} value={o.parcelas}>
              {o.parcelas}x de {reais(o.parcelaCentavos)} (total {reais(o.totalCentavos)})
            </option>
          ))}
        </select>
      </label>
      {escolhida ? (
        <p className="ajuda">
          Inclui {reais(escolhida.tarifaCentavos)} de tarifa do cartao parcelado. A vista (boleto ou Pix) nao tem acrescimo.
        </p>
      ) : null}
      <span className="flex gap-2">
        <button type="button" className="botao-principal" onClick={parcelar} disabled={enviando}>
          {enviando ? "Preparando..." : "Parcelar e pagar"}
        </button>
        <button type="button" className="botao-discreto" onClick={() => setAberto(false)} disabled={enviando}>
          Cancelar
        </button>
      </span>
      {erro ? <p className="aviso-erro" role="alert">{erro}</p> : null}
    </div>
  );
}
