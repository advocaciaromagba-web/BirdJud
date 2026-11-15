"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ROTULO_DO_CAMPO, type CampoCompletavel } from "@/lib/cadastro-pelos-documentos";

type Linha = { id: string; nome: string; falta: CampoCompletavel[]; documentos: number };
type Resultado = { tom: "ok" | "aviso" | "erro"; texto: string; lidos?: string[] };

const rotulos = (campos: CampoCompletavel[]) => campos.map((c) => ROTULO_DO_CAMPO[c]).join(", ");

/**
 * Cadastros com dados faltando, e a IA lendo os documentos de cada um para
 * preencher o que falta. Um cliente por chamada; a tela percorre a fila e
 * pode ser parada. Nada que alguem digitou e trocado: so entra campo vazio.
 */
export function CadastrosIncompletos({ clientes, comIA }: { clientes: Linha[]; comIA: boolean }) {
  const router = useRouter();
  const [resultados, setResultados] = useState<Record<string, Resultado>>({});
  const [lendo, setLendo] = useState<string | null>(null);
  const [fila, setFila] = useState<{ feitos: number; total: number } | null>(null);
  const parar = useRef(false);

  const comDocumento = clientes.filter((c) => c.documentos > 0);

  /** Devolve false quando a fila deve parar (limite de leituras, IA fora). */
  async function completar(c: Linha): Promise<boolean> {
    setLendo(c.id);
    try {
      const r = await fetch(`/api/clientes/${c.id}/completar-pelos-documentos`, { method: "POST" });
      // Conexao derrubada no caminho devolve HTML, nao JSON.
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) {
        setResultados((a) => ({ ...a, [c.id]: { tom: "erro", texto: j?.erro ?? "A conexão caiu no meio da leitura. Tente este de novo." } }));
        return r.status !== 429 && r.status !== 503 && r.status !== 402;
      }
      if (j.situacao === "PREENCHIDO") {
        const entrou = rotulos(j.preenchidos.map((p: { campo: CampoCompletavel }) => p.campo));
        const ficou = j.aindaFalta.length ? ` Ainda falta: ${rotulos(j.aindaFalta)}.` : " Cadastro completo.";
        const fora = j.recusados.length
          ? ` Não entrou: ${j.recusados.map((x: { campo: CampoCompletavel; motivo: string }) => `${ROTULO_DO_CAMPO[x.campo]} (${x.motivo})`).join("; ")}.`
          : "";
        setResultados((a) => ({ ...a, [c.id]: { tom: "ok", texto: `Preenchido: ${entrou}.${ficou}${fora}`, lidos: j.lidos } }));
      } else {
        setResultados((a) => ({ ...a, [c.id]: { tom: "aviso", texto: j.recado, lidos: j.lidos } }));
      }
      return true;
    } finally {
      setLendo(null);
    }
  }

  async function completarTodos() {
    parar.current = false;
    const pendentes = comDocumento.filter((c) => !resultados[c.id]);
    setFila({ feitos: 0, total: pendentes.length });
    for (const c of pendentes) {
      if (parar.current) break;
      const segue = await completar(c);
      setFila((f) => (f ? { ...f, feitos: f.feitos + 1 } : f));
      if (!segue) break;
    }
    setFila(null);
    router.refresh();
  }

  if (clientes.length === 0) return null;
  const rodando = fila !== null;

  return (
    <details className="cartao mt-4">
      <summary className="cursor-pointer text-base font-bold">
        Cadastros com dados faltando ({clientes.length})
      </summary>
      <p className="ajuda mt-2">
        Sem RG, estado civil, profissão ou endereço, a procuração e o contrato saem com lacuna.
        {comIA
          ? " A IA lê os documentos já guardados de cada cliente (RG, CNH, comprovante de endereço, procuração, contrato) e preenche só o que está vazio; o que alguém digitou não é trocado. Documento em nome de outra pessoa ou leitura com dúvida não entram, e a tela diz por quê."
          : " Abra a ficha de cada um para completar."}
      </p>
      {comIA ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="botao-principal" disabled={rodando || lendo !== null || comDocumento.every((c) => resultados[c.id])} onClick={completarTodos}>
            {rodando ? `Lendo ${fila!.feitos + 1} de ${fila!.total}…` : `Completar pelos documentos (${comDocumento.length} com documento guardado)`}
          </button>
          {rodando ? (
            <button
              type="button"
              className="botao-discreto"
              onClick={() => {
                parar.current = true;
              }}
            >
              Parar depois deste
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Falta</th>
              <th>Documentos para ler</th>
              {comIA ? <th><span className="sr-only">Ler</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => {
              const r = resultados[c.id];
              return (
                <tr key={c.id}>
                  <td className="font-medium">
                    <Link href={`/clientes/${c.id}`} className="hover:underline">
                      {c.nome}
                    </Link>
                  </td>
                  <td className="text-sm text-slate-600">
                    {rotulos(c.falta)}
                    {r ? (
                      <p role="status" className={`mt-1 text-xs ${r.tom === "ok" ? "text-emerald-800" : r.tom === "erro" ? "text-red-700" : "text-amber-800"}`}>
                        {r.texto}
                        {r.lidos?.length ? <span className="block text-slate-500">Lido: {r.lidos.join(", ")}.</span> : null}
                      </p>
                    ) : null}
                  </td>
                  <td className="text-sm text-slate-600">{c.documentos > 0 ? c.documentos : "nenhum que sirva"}</td>
                  {comIA ? (
                    <td>
                      {c.documentos > 0 && !r ? (
                        <button type="button" className="text-xs font-semibold text-sky-800 underline" disabled={rodando || lendo !== null} onClick={() => completar(c).then(() => router.refresh())}>
                          {lendo === c.id ? "lendo…" : "ler os documentos"}
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
    </details>
  );
}
