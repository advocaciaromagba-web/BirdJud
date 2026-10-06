"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export type EntradaNaTela = {
  id: string;
  rotulo: string;
  tipo: string;
  valor: string;
  dataBR: string;
  descricao: string;
  destino: string;
  automatico: boolean;
  sugestao: string | null;
  ambigua: boolean;
};

const COR: Record<string, string> = {
  RECEITA: "border-l-emerald-500",
  DESPESA: "border-l-amber-500",
  IGNORAR: "border-l-slate-300",
};

/**
 * Conferencia do extrato.
 *
 * O QUE ESTA TELA NAO FAZ: dar baixa sozinha. Ela SUGERE e uma pessoa decide.
 * Errar aqui e dinheiro de cliente indo para o lugar errado.
 */
export function PainelConciliacao({
  entradas,
  temConta,
}: {
  entradas: EntradaNaTela[];
  temConta: boolean;
}) {
  const router = useRouter();
  const [importando, setImportando] = useState(false);
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<string | null>(null);

  async function importar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setResumo(null);
    setImportando(true);
    const dados = new FormData(evento.currentTarget);

    const resposta = await fetch("/api/extrato", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        de: String(dados.get("de") ?? ""),
        ate: String(dados.get("ate") ?? ""),
      }),
    });
    setImportando(false);

    const detalhe = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      setErro(detalhe?.erro ?? "Nao consegui ler o extrato.");
      return;
    }
    setResumo(
      `${detalhe.lidos} lancamento(s) lidos, ${detalhe.novos} novo(s). ` +
        "Reimportar o mesmo periodo nao duplica nada.",
    );
    router.refresh();
  }

  async function decidir(id: string, acao: "lancar" | "ignorar") {
    setDecidindo(id);
    setErro(null);
    const resposta = await fetch(`/api/extrato/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ acao }),
    });
    setDecidindo(null);
    if (!resposta.ok) {
      const d = await resposta.json().catch(() => null);
      setErro(d?.erro ?? "Nao consegui gravar a decisao.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <section className="cartao">
        <h2 className="font-semibold">Ler o extrato</h2>
        <p className="mt-1 text-sm text-slate-600">
          O aviso automatico so conta das cobrancas que passam por ele. O
          extrato traz tambem tarifa, Pix avulso, estorno e o saque para o
          banco — e e o que faz o financeiro bater com a conta de verdade.
        </p>
        {!temConta ? (
          <p className="mt-3 text-sm text-amber-700">
            Conecte a conta de cobranca em Integracoes para poder ler o extrato.
          </p>
        ) : (
          <form onSubmit={importar} className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="ex-de" className="rotulo">
                De
              </label>
              <input id="ex-de" name="de" type="date" required className="campo" />
            </div>
            <div>
              <label htmlFor="ex-ate" className="rotulo">
                Ate
              </label>
              <input id="ex-ate" name="ate" type="date" required className="campo" />
            </div>
            <button
              type="submit"
              disabled={importando}
              className="botao-principal disabled:opacity-50"
            >
              {importando ? "Lendo..." : "Ler o extrato"}
            </button>
          </form>
        )}
        {resumo ? (
          <p className="mt-3 text-sm text-emerald-700">{resumo}</p>
        ) : null}
        {erro ? <p className="aviso-erro mt-3">{erro}</p> : null}
      </section>

      <section>
        <h2 className="font-semibold">A conferir</h2>
        {entradas.length === 0 ? (
          <p className="vazio mt-3">
            Nada pendente. Leia um periodo acima para conferir.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {entradas.map((e) => (
              <li
                key={e.id}
                className={`rounded-[var(--raio)] border border-slate-200 border-l-4 bg-white px-4 py-3 ${COR[e.destino] ?? ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {e.rotulo}
                      <span className="ml-2 tabular-nums text-slate-600">
                        {e.valor}
                      </span>
                      <span className="ml-2 text-sm text-slate-500">
                        {e.dataBR}
                      </span>
                    </p>
                    {e.descricao ? (
                      <p className="text-xs text-slate-500">{e.descricao}</p>
                    ) : null}
                    {e.sugestao ? (
                      <p
                        className={`mt-1 text-xs ${e.ambigua ? "text-amber-700" : "text-emerald-700"}`}
                      >
                        {e.sugestao}
                      </p>
                    ) : null}
                    {!e.automatico ? (
                      <p className="mt-1 text-xs text-amber-700">
                        Depende de contexto que o extrato nao tem — confira
                        antes de lancar.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {e.destino !== "IGNORAR" ? (
                      <button
                        type="button"
                        disabled={decidindo === e.id}
                        onClick={() => decidir(e.id, "lancar")}
                        className="botao-principal disabled:opacity-50"
                      >
                        Lancar
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={decidindo === e.id}
                      onClick={() => decidir(e.id, "ignorar")}
                      className="botao-secundario disabled:opacity-50"
                    >
                      {e.destino === "IGNORAR" ? "Conferi" : "Ignorar"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
