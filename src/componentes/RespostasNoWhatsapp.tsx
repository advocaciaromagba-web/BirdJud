"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type RespostaNaCaixa = {
  id: string;
  telefone: string;
  texto: string;
  criadoEm: string;
};

/**
 * O que chegou no WhatsApp e o sistema NAO entendeu.
 *
 * Existe porque a alternativa e pior do que parece: sem esta caixa, a pessoa
 * que respondeu ao lembrete com um audio, ou com "doutor, eu nao vou conseguir
 * chegar as 14h, da para atrasar?", teria escrito para o vazio.
 *
 * O sistema JA RESPONDEU a ela que este numero nao atende e que ligue para o
 * escritorio — nao prometeu leitura, porque promessa de atendimento num numero
 * que nao atende e pior do que silencio. Mas o que a pessoa escreveu importa, e
 * e aqui que alguem ve.
 *
 * So aparece quando ha algo. Caixa vazia todo dia e caixa que ninguem olha.
 */
export function RespostasNoWhatsapp({ respostas }: { respostas: RespostaNaCaixa[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);

  if (respostas.length === 0) return null;

  async function lida(id: string) {
    setOcupado(id);
    await fetch(`/api/whatsapp/respostas/${id}/lida`, { method: "POST" });
    setOcupado(null);
    router.refresh();
  }

  return (
    <section className="cartao mb-6 border-l-4 border-l-amber-500">
      <h2 className="font-semibold">
        Respostas no WhatsApp que ninguem leu ({respostas.length})
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        O sistema nao entendeu estas respostas. Quem escreveu ja recebeu de
        volta o telefone do escritorio — este numero so avisa, nao atende.
        &quot;1&quot; e &quot;2&quot; ele entende sozinho e ja anota na agenda.
      </p>
      <ul className="mt-3 space-y-2">
        {respostas.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-white p-2 text-sm"
          >
            <span className="font-medium">{r.telefone}</span>
            <span className="text-xs text-slate-500">
              {new Date(r.criadoEm).toLocaleString("pt-BR")}
            </span>
            <span className="w-full text-slate-700">{r.texto}</span>
            <button
              type="button"
              disabled={ocupado === r.id}
              className="botao-discreto disabled:opacity-50"
              onClick={() => lida(r.id)}
            >
              {ocupado === r.id ? "..." : "ja li"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
