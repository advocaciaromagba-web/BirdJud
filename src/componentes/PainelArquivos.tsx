"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ArquivoNaTela = {
  id: string;
  nome: string;
  descricao: string | null;
  tamanho: string;
  data: string;
  vinculo: string | null;
};

export type Vinculo = { valor: string; rotulo: string };

export function PainelArquivos({
  arquivos,
  clientes,
  processos,
  tamanhoMaximoMb,
}: {
  arquivos: ArquivoNaTela[];
  clientes: Vinculo[];
  processos: Vinculo[];
  tamanhoMaximoMb: number;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    const form = evento.currentTarget;
    const resposta = await fetch("/api/arquivos", {
      method: "POST",
      body: new FormData(form),
    });
    setEnviando(false);

    if (resposta.ok) {
      form.reset();
      router.refresh();
      return;
    }
    const json = await resposta.json().catch(() => ({}));
    setErro(json.erro ?? "Nao foi possivel guardar o arquivo.");
  }

  async function apagar(id: string, nome: string) {
    if (!confirm(`Apagar "${nome}"? Isso nao tem volta.`)) return;
    const resposta = await fetch(`/api/arquivos/${id}`, { method: "DELETE" });
    if (!resposta.ok) {
      const json = await resposta.json().catch(() => ({}));
      setErro(json.erro ?? "Nao foi possivel apagar.");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <form onSubmit={enviar} className="mt-6 grid gap-3 rounded border border-neutral-200 p-4">
        <label className="grid gap-1 text-sm">
          Arquivo (ate {tamanhoMaximoMb} MB)
          <input
            type="file"
            name="arquivo"
            required
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Descricao (opcional)
          <input name="descricao" className="rounded border border-neutral-300 px-3 py-2" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            Processo (opcional)
            <select name="processoId" className="rounded border border-neutral-300 px-3 py-2">
              <option value="">—</option>
              {processos.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {p.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Cliente (opcional)
            <select name="clienteId" className="rounded border border-neutral-300 px-3 py-2">
              <option value="">—</option>
              {clientes.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </label>
        </div>
        {erro ? <p className="text-sm text-red-700">{erro}</p> : null}
        <button
          type="submit"
          disabled={enviando}
          className="justify-self-start rounded bg-marca px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          {enviando ? "Enviando…" : "Guardar arquivo"}
        </button>
      </form>

      {arquivos.length === 0 ? (
        <p className="mt-6 text-neutral-600">Nenhum arquivo guardado ainda.</p>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200">
          {arquivos.map((arquivo) => (
            <li key={arquivo.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
              <a
                href={`/api/arquivos/${arquivo.id}`}
                className="font-semibold text-marca hover:underline"
              >
                {arquivo.nome}
              </a>
              <span className="text-sm text-neutral-500">{arquivo.tamanho}</span>
              {arquivo.vinculo ? (
                <span className="text-sm text-neutral-600">{arquivo.vinculo}</span>
              ) : null}
              {arquivo.descricao ? (
                <span className="w-full text-sm text-neutral-500">{arquivo.descricao}</span>
              ) : null}
              <span className="ml-auto text-sm text-neutral-500">{arquivo.data}</span>
              <button
                type="button"
                onClick={() => apagar(arquivo.id, arquivo.nome)}
                className="text-sm text-neutral-500 hover:text-rose-700"
              >
                Apagar
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
