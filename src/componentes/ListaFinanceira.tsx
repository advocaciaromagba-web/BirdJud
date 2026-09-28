"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { emReais } from "@/lib/dinheiro";
import { rotuloDaCategoria } from "@/lib/financeiro";

type Lancamento = {
  id: string;
  descricao: string;
  valorCentavos: number;
  tipo: string;
  categoria: string | null;
  fornecedor: string | null;
  vencimento: string | null;
  pagoEm: string | null;
};

const dia = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/**
 * Lista do mes, com a baixa em um clique.
 *
 * Dar baixa e a acao mais repetida do financeiro. Fazer isso abrir uma tela e
 * o jeito de ninguem dar baixa, e ai o "a pagar" deixa de significar algo.
 */
export function ListaFinanceira({ lancamentos }: { lancamentos: Lancamento[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function alternar(id: string, pago: boolean) {
    setOcupado(id);
    setErro(null);
    try {
      const resposta = await fetch(`/api/lancamentos/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pago }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        setErro(corpo.erro ?? "Nao foi possivel atualizar.");
        return;
      }
      router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  if (lancamentos.length === 0) {
    return <p className="vazio">Nenhum lancamento nesta competencia.</p>;
  }

  const hoje = new Date();

  return (
    <>
      {erro && <p className="aviso-erro">{erro}</p>}
      <table className="tabela">
        <thead>
          <tr>
            <th>Vencimento</th>
            <th>Descricao</th>
            <th>Categoria</th>
            <th className="text-right">Valor</th>
            <th>Situacao</th>
          </tr>
        </thead>
        <tbody>
          {lancamentos.map((l) => {
            const pago = Boolean(l.pagoEm);
            const vence = l.vencimento ? new Date(l.vencimento) : null;
            // Atrasado so faz sentido para o que ainda nao foi pago.
            const atrasado = !pago && vence !== null && vence < hoje;
            return (
              <tr key={l.id}>
                <td className="tabular-nums">
                  {vence ? dia.format(vence) : "—"}
                </td>
                <td>
                  <span className="font-medium">{l.descricao}</span>
                  {l.fornecedor && (
                    <span className="block text-xs text-slate-500 esquerda">
                      {l.fornecedor}
                    </span>
                  )}
                </td>
                <td className="text-slate-600">
                  {l.categoria ? rotuloDaCategoria(l.categoria) : "—"}
                </td>
                <td
                  className={`text-right tabular-nums font-medium ${
                    l.tipo === "RECEITA" ? "text-emerald-700" : "text-slate-900"
                  }`}
                >
                  {l.tipo === "RECEITA" ? "+" : "−"} {emReais(l.valorCentavos)}
                </td>
                <td>
                  <button
                    type="button"
                    className={
                      pago
                        ? "etiqueta-ok"
                        : atrasado
                          ? "etiqueta-erro"
                          : "etiqueta-neutra"
                    }
                    onClick={() => alternar(l.id, !pago)}
                    disabled={ocupado === l.id}
                    title={
                      pago
                        ? "Clique para desfazer a baixa"
                        : "Clique para dar baixa"
                    }
                  >
                    {ocupado === l.id
                      ? "..."
                      : pago
                        ? l.tipo === "RECEITA"
                          ? "recebido"
                          : "pago"
                        : atrasado
                          ? "atrasado"
                          : "em aberto"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
