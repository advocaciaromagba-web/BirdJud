"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROTULO_DO_CAMPO, type CampoCompletavel } from "@/lib/cadastro-pelos-documentos";

/**
 * Aviso na ficha: estes campos foram preenchidos pela IA lendo os documentos
 * do cliente. Dado lido por IA e sugestao ate alguem conferir — e este dado
 * vai para a procuracao.
 */
export function LidosPorIA({ clienteId, campos }: { clienteId: string; campos: string[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (campos.length === 0) return null;

  async function conferi() {
    setOcupado(true);
    setErro(null);
    const r = await fetch(`/api/clientes/${clienteId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conferirLidosPorIA: true }),
    }).catch(() => null);
    setOcupado(false);
    if (!r?.ok) {
      setErro("Não foi possível registrar. Tente de novo.");
      return;
    }
    router.refresh();
  }

  return (
    <section className="cartao border-amber-300 bg-amber-50/50">
      <h2 className="font-semibold">Preenchido por IA, a conferir</h2>
      <p className="mt-2 text-sm text-slate-700">
        A IA leu os documentos guardados deste cliente e preencheu: <strong>{campos.map((c) => ROTULO_DO_CAMPO[c as CampoCompletavel] ?? c).join(", ")}</strong>.
        Compare com o documento antes de gerar procuração ou contrato. Corrigir um campo já o tira desta lista.
      </p>
      <button type="button" className="botao-secundario mt-3" disabled={ocupado} onClick={conferi}>
        {ocupado ? "Registrando…" : "Conferi, está certo"}
      </button>
      {erro ? <p className="aviso-erro mt-2">{erro}</p> : null}
    </section>
  );
}
