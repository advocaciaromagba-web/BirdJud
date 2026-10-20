"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Liga ou desliga a nota automatica a cada fatura paga. */
export function EmissaoAutomatica({ ligada, podeLigar }: { ligada: boolean; podeLigar: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);

  async function trocar() {
    setOcupado(true);
    const r = await fetch("/api/plataforma/emissor", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ acao: "AUTOMATICA", ligar: !ligada }),
    });
    const json = (await r.json().catch(() => ({}))) as { erro?: string; detalhe?: string };
    setOcupado(false);
    setRecado(json.detalhe ?? json.erro ?? null);
    router.refresh();
  }

  return (
    <div>
      <p className="text-sm">
        Emissao automatica: <strong>{ligada ? "ligada" : "desligada"}</strong>. Ligada, cada fatura paga (Asaas ou
        baixa manual) gera a nota e a manda ao e-mail do escritório.
      </p>
      <button
        type="button"
        className="botao-secundario mt-2"
        disabled={ocupado || (!ligada && !podeLigar)}
        onClick={trocar}
      >
        {ligada ? "Desligar emissão automática" : "Ligar emissão automática"}
      </button>
      {!ligada && !podeLigar ? (
        <p className="ajuda">Resolva as pendências acima antes de ligar.</p>
      ) : null}
      {recado ? <p role="status" className="ajuda">{recado}</p> : null}
    </div>
  );
}
