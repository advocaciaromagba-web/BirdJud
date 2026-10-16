"use client";

import { useState } from "react";

/**
 * "Parcelar no cartao" da fatura anual. Troca a cobranca a vista pela
 * parcelada e leva direto para a tela de pagamento do Asaas.
 */
export function ParcelarFatura({ faturaId, parcelas }: { faturaId: string; parcelas: number }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function parcelar() {
    if (!window.confirm(
      `Trocar o pagamento a vista por ate ${parcelas}x sem juros no cartao de credito? ` +
        "O boleto e o Pix desta fatura deixam de valer.",
    )) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/plano/faturas/${faturaId}/parcelar`, { method: "POST" });
      const corpo = (await r.json().catch(() => ({}))) as { erro?: string; linkPagamento?: string | null };
      if (!r.ok) throw new Error(corpo.erro ?? "Nao foi possivel parcelar.");
      if (corpo.linkPagamento) window.location.href = corpo.linkPagamento;
      else window.location.reload();
    } catch (e) {
      setErro((e as Error).message);
      setEnviando(false);
    }
  }

  return (
    <div>
      <button type="button" className="botao-secundario" onClick={parcelar} disabled={enviando}>
        {enviando ? "Preparando..." : `Parcelar em ate ${parcelas}x no cartao`}
      </button>
      {erro ? <p className="aviso-erro mt-2" role="alert">{erro}</p> : null}
    </div>
  );
}
