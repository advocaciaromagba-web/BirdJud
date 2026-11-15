"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { emReais } from "@/lib/dinheiro";
import { rotuloDaCategoria } from "@/lib/financeiro";
import { formatarLinha } from "@/lib/boleto-da-conta";

type Lancamento = {
  id: string;
  descricao: string;
  valorCentavos: number;
  tipo: string;
  categoria: string | null;
  fornecedor: string | null;
  vencimento: string | null;
  pagoEm: string | null;
  /** So digitos; aparece formatada, com o botao de copiar. */
  linhaDigitavel?: string | null;
  /** O boleto guardado junto da conta. */
  arquivoId?: string | null;
  comprovanteId?: string | null;
  /** Pode sair por aqui (nao veio de cobranca, contrato nem extrato). */
  excluivel?: boolean;
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
export function ListaFinanceira({
  lancamentos,
  vazio = "Nenhum lançamento nesta competência.",
  anexos = false,
}: {
  lancamentos: Lancamento[];
  vazio?: string;
  /** Mostra boleto, linha digitavel e comprovante nas contas a pagar. */
  anexos?: boolean;
}) {
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
        setErro(corpo.erro ?? "Não foi possível atualizar.");
        return;
      }
      router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  async function excluir(l: Lancamento) {
    if (!window.confirm(`Excluir "${l.descricao}" (${emReais(l.valorCentavos)})? Não tem volta.`)) return;
    setOcupado(l.id);
    setErro(null);
    try {
      const resposta = await fetch(`/api/lancamentos/${l.id}`, { method: "DELETE" });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        setErro(corpo.erro ?? "Não foi possível excluir.");
        return;
      }
      router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  const [copiada, setCopiada] = useState<string | null>(null);

  async function copiar(l: Lancamento) {
    try {
      await navigator.clipboard.writeText(l.linhaDigitavel ?? "");
      setCopiada(l.id);
      setTimeout(() => setCopiada((c) => (c === l.id ? null : c)), 2500);
    } catch {
      // Navegador sem permissao de area de transferencia: mostra para copiar a mao.
      window.prompt("Copie a linha digitável:", l.linhaDigitavel ?? "");
    }
  }

  async function informarLinha(l: Lancamento) {
    const digitada = window.prompt("Cole a linha digitável do boleto (47 ou 48 dígitos). Deixe vazio para apagar.", l.linhaDigitavel ?? "");
    if (digitada === null) return;
    setOcupado(l.id);
    setErro(null);
    try {
      const resposta = await fetch(`/api/lancamentos/${l.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ linhaDigitavel: digitada.trim() || null }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        setErro(corpo.erro ?? "Não foi possível guardar a linha digitável.");
        return;
      }
      router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  async function anexar(l: Lancamento, tipo: "BOLETO" | "COMPROVANTE", arquivo: File | undefined) {
    if (!arquivo) return;
    setOcupado(l.id);
    setErro(null);
    try {
      const dados = new FormData();
      dados.set("tipo", tipo);
      dados.set("arquivo", arquivo);
      const resposta = await fetch(`/api/lancamentos/${l.id}/anexo`, { method: "POST", body: dados });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        setErro(corpo.erro ?? "Não foi possível guardar o arquivo.");
        return;
      }
      router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  const comExcluir = lancamentos.some((l) => l.excluivel);

  if (lancamentos.length === 0) {
    return <p className="vazio">{vazio}</p>;
  }

  // Dia de hoje em Brasilia, como aaaa-mm-dd. O vencimento e gravado ao
  // meio-dia UTC, entao o dia dele e o pedaco da data: comparar instantes
  // marcava como "atrasada", depois das 9h, a conta que vence HOJE.
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  return (
    <>
      {erro && <p className="aviso-erro">{erro}</p>}
      <div className="overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th>Vencimento</th>
              <th>Descrição</th>
              <th>Categoria</th>
              <th className="text-right">Valor</th>
              <th>Situação</th>
              {comExcluir ? <th><span className="sr-only">Excluir</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {lancamentos.map((l) => {
              const pago = Boolean(l.pagoEm);
              const vence = l.vencimento ? new Date(l.vencimento) : null;
              // Atrasado so faz sentido para o que ainda nao foi pago.
              const diaDoVencimento = l.vencimento?.slice(0, 10) ?? null;
              const atrasado = !pago && diaDoVencimento !== null && diaDoVencimento < hoje;
              const venceHoje = !pago && diaDoVencimento === hoje;
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
                    {anexos && l.tipo === "DESPESA" ? (
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs esquerda">
                        {l.linhaDigitavel ? (
                          <>
                            <span className="font-mono text-slate-600 break-all">{formatarLinha(l.linhaDigitavel)}</span>
                            <button type="button" className="font-semibold text-sky-800 underline" onClick={() => copiar(l)}>
                              {copiada === l.id ? "copiada ✓" : "copiar linha digitável"}
                            </button>
                          </>
                        ) : null}
                        {l.arquivoId ? (
                          <a className="font-semibold text-sky-800 underline" href={`/api/lancamentos/${l.id}/anexo?tipo=BOLETO`}>
                            ver boleto
                          </a>
                        ) : null}
                        {l.comprovanteId ? (
                          <a className="font-semibold text-sky-800 underline" href={`/api/lancamentos/${l.id}/anexo?tipo=COMPROVANTE`}>
                            ver comprovante
                          </a>
                        ) : null}
                        {!pago ? (
                          <label className="cursor-pointer text-slate-600 underline">
                            {l.arquivoId ? "trocar boleto" : "anexar boleto"}
                            <input type="file" className="sr-only" accept="application/pdf,image/*" disabled={ocupado === l.id} onChange={(e) => anexar(l, "BOLETO", e.target.files?.[0])} />
                          </label>
                        ) : (
                          <label className="cursor-pointer text-slate-600 underline">
                            {l.comprovanteId ? "trocar comprovante" : "anexar comprovante"}
                            <input type="file" className="sr-only" accept="application/pdf,image/*" disabled={ocupado === l.id} onChange={(e) => anexar(l, "COMPROVANTE", e.target.files?.[0])} />
                          </label>
                        )}
                        {!pago ? (
                          <button type="button" className="text-slate-600 underline" disabled={ocupado === l.id} onClick={() => informarLinha(l)}>
                            {l.linhaDigitavel ? "corrigir linha" : "informar linha digitável"}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                  <td className="text-slate-600">
                    {l.categoria ? rotuloDaCategoria(l.categoria) : "—"}
                  </td>
                  <td
                    className={`text-right tabular-nums font-medium ${
                      l.tipo === "RECEITA"
                        ? "text-emerald-700"
                        : "text-slate-900"
                    }`}
                  >
                    {l.tipo === "RECEITA" ? "+" : "−"}{" "}
                    {emReais(l.valorCentavos)}
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
                            : venceHoje
                              ? "vence hoje"
                              : "em aberto"}
                    </button>
                  </td>
                  {comExcluir ? (
                    <td>
                      {l.excluivel ? (
                        <button type="button" className="text-xs text-red-700 underline" disabled={ocupado === l.id} onClick={() => excluir(l)}>
                          excluir
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
