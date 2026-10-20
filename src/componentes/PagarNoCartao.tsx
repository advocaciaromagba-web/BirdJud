"use client";

import { useState } from "react";

type Opcao = { parcelas: number; totalCentavos: number; parcelaCentavos: number; tarifaCentavos: number };

const reais = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);

const rotulo = (o: Opcao) =>
  o.parcelas === 1
    ? `A vista: ${reais(o.totalCentavos)}`
    : `${o.parcelas}x de ${reais(o.parcelaCentavos)} (total ${reais(o.totalCentavos)})`;

/**
 * "Pagar no cartao": a vista em qualquer fatura, parcelado na anual. Mostra o
 * total com a tarifa do cartao (repassada) e vai direto para a tela de
 * pagamento do Asaas.
 */
export function PagarNoCartao({ faturaId, opcoes }: { faturaId: string; opcoes: Opcao[] }) {
  const [aberto, setAberto] = useState(false);
  const [parcelas, setParcelas] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const escolhida = opcoes.find((o) => o.parcelas === parcelas);

  async function pagar() {
    if (!escolhida) return;
    if (!window.confirm(
      `Pagar no cartão de crédito: ${rotulo(escolhida)}, com a tarifa do cartão? ` +
        "O boleto e o Pix desta fatura deixam de valer.",
    )) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/plano/faturas/${faturaId}/cartao`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parcelas }),
      });
      const corpo = (await r.json().catch(() => ({}))) as { erro?: string; linkPagamento?: string | null };
      if (!r.ok) throw new Error(corpo.erro ?? "Não foi possível passar para o cartão.");
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
        Pagar no cartão
      </button>
    );
  }

  return (
    <div className="grid gap-2">
      {opcoes.length > 1 ? (
        <label className="text-sm">
          <span className="block font-medium">Como pagar no cartão</span>
          <select className="campo mt-1" value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>
            {opcoes.map((o) => (
              <option key={o.parcelas} value={o.parcelas}>{rotulo(o)}</option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm font-medium">{escolhida ? rotulo(escolhida) : null}</p>
      )}
      {escolhida ? (
        <p className="ajuda">
          Inclui {reais(escolhida.tarifaCentavos)} de tarifa do cartão
          {escolhida.parcelas > 1 ? " e da antecipação das parcelas" : ""}. Boleto ou Pix não tem acréscimo.
        </p>
      ) : null}
      <span className="flex gap-2">
        <button type="button" className="botao-principal" onClick={pagar} disabled={enviando}>
          {enviando ? "Preparando..." : "Ir para o pagamento"}
        </button>
        <button type="button" className="botao-discreto" onClick={() => setAberto(false)} disabled={enviando}>
          Cancelar
        </button>
      </span>
      {erro ? <p className="aviso-erro" role="alert">{erro}</p> : null}
    </div>
  );
}
