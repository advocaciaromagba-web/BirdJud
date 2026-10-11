"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  PRIORIDADES,
  ROTULO_DA_PRIORIDADE,
  ROTULO_DA_SITUACAO,
  combina,
  type Prioridade,
  type SituacaoDaTarefa,
} from "@/lib/tarefas";

export type TarefaNaTela = {
  id: string;
  titulo: string;
  descricao: string | null;
  vencimentoISO: string;
  prioridade: Prioridade;
  situacao: string;
  meta: boolean;
  numeroProcesso: string | null;
  clienteId: string | null;
  nomeDoCliente: string | null;
  responsavelId: string;
  nomeDoResponsavel: string;
  atrasada: boolean;
};

type Pessoa = { id: string; nome: string };

const COR_DA_PRIORIDADE: Record<Prioridade, string> = {
  BAIXA: "bg-slate-100 text-slate-600",
  MEDIA: "bg-sky-100 text-sky-800",
  ALTA: "bg-amber-100 text-amber-900",
  URGENTE: "bg-red-100 text-red-900",
};

const quando = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** O valor que o <input type="datetime-local"> entende. */
function paraCampo(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function PainelTarefas({
  tarefas,
  equipe,
  clientes,
  ativas,
  concluidas,
  mostrandoConcluidas,
}: {
  tarefas: TarefaNaTela[];
  equipe: Pessoa[];
  clientes: Pessoa[];
  ativas: number;
  concluidas: number;
  mostrandoConcluidas: boolean;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<TarefaNaTela | null>(null);
  const [criando, setCriando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const visiveis = useMemo(
    () => tarefas.filter((t) => combina(t, busca)),
    [tarefas, busca],
  );

  async function chamar(url: string, metodo: string, corpo?: unknown) {
    setErro(null);
    const r = await fetch(url, {
      method: metodo,
      headers: corpo ? { "content-type": "application/json" } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    if (!r.ok) {
      const dados = await r.json().catch(() => ({}));
      throw new Error(dados.erro ?? "Nao deu certo. Tente de novo.");
    }
    return r.json();
  }

  async function agir(chave: string, acao: () => Promise<unknown>) {
    setOcupado(chave);
    try {
      await acao();
      router.refresh();
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  const formulario = (tarefa: TarefaNaTela | null) => (
    <form
      onSubmit={async (evento) => {
        evento.preventDefault();
        const dados = new FormData(evento.currentTarget);
        const corpo = {
          titulo: String(dados.get("titulo") ?? ""),
          descricao: String(dados.get("descricao") ?? "") || null,
          vencimento: String(dados.get("vencimento") ?? ""),
          prioridade: String(dados.get("prioridade") ?? "MEDIA"),
          responsavelId: String(dados.get("responsavelId") ?? ""),
          clienteId: String(dados.get("clienteId") ?? "") || null,
          numeroProcesso: String(dados.get("numeroProcesso") ?? "") || null,
          meta: dados.get("meta") === "on",
        };
        await agir("formulario", async () => {
          if (tarefa) {
            await chamar(`/api/tarefas/${tarefa.id}`, "PATCH", corpo);
            setEditando(null);
          } else {
            await chamar("/api/tarefas", "POST", corpo);
            setCriando(false);
          }
        });
      }}
      className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <label className="grid gap-1 text-sm">
        <span className="text-slate-600">Titulo</span>
        <input
          name="titulo"
          required
          minLength={3}
          defaultValue={tarefa?.titulo ?? ""}
          placeholder="O servico a executar. Ex: emendar a inicial, distribuir a peticao"
          className="rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="text-slate-600">Descricao (opcional)</span>
        <textarea
          name="descricao"
          rows={3}
          defaultValue={tarefa?.descricao ?? ""}
          className="rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600">Prazo</span>
          <input
            type="datetime-local"
            name="vencimento"
            required
            defaultValue={
              tarefa ? paraCampo(tarefa.vencimentoISO) : undefined
            }
            className="rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600">Prioridade</span>
          <select
            name="prioridade"
            defaultValue={tarefa?.prioridade ?? "MEDIA"}
            className="rounded-lg border border-slate-300 px-3 py-2"
          >
            {PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {ROTULO_DA_PRIORIDADE[p]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600">Responsavel</span>
          <select
            name="responsavelId"
            required
            defaultValue={tarefa?.responsavelId ?? ""}
            className="rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="">Selecione</option>
            {equipe.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600">
            Numero do processo (opcional)
          </span>
          <input
            name="numeroProcesso"
            defaultValue={tarefa?.numeroProcesso ?? ""}
            placeholder="0000000-00.0000.0.00.0000"
            className="rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="text-slate-600">Cliente (opcional)</span>
        <select
          name="clienteId"
          defaultValue={tarefa?.clienteId ?? ""}
          className="rounded-lg border border-slate-300 px-3 py-2"
        >
          <option value="">Nenhum</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="meta" defaultChecked={tarefa?.meta} />
        <span>E uma meta (nao uma tarefa do dia a dia)</span>
      </label>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={ocupado === "formulario"}
          className="botao-principal"
        >
          {ocupado === "formulario" ? "Salvando..." : "Salvar tarefa"}
        </button>
        <button
          type="button"
          onClick={() => {
            setCriando(false);
            setEditando(null);
          }}
          className="botao-secundario"
        >
          Cancelar
        </button>
      </div>
    </form>
  );

  return (
    <div className="mt-6 grid gap-4">
      {erro ? (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {erro}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar tarefa, cliente, processo..."
          className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="ml-auto">
          {criando || editando ? null : (
            <button
              type="button"
              onClick={() => setCriando(true)}
              className="botao-principal"
            >
              Nova tarefa
            </button>
          )}
        </div>
      </div>

      {criando ? formulario(null) : null}
      {editando ? formulario(editando) : null}

      <div className="flex gap-2">
        <Link
          href="/tarefas"
          className={`rounded-lg px-3 py-1.5 text-sm ${
            mostrandoConcluidas
              ? "text-slate-600 hover:bg-slate-100"
              : "bg-slate-900 font-semibold text-white"
          }`}
        >
          Ativas ({ativas})
        </Link>
        <Link
          href="/tarefas?aba=concluidas"
          className={`rounded-lg px-3 py-1.5 text-sm ${
            mostrandoConcluidas
              ? "bg-slate-900 font-semibold text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Concluidas ({concluidas})
        </Link>
      </div>

      {visiveis.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          {busca
            ? "Nenhuma tarefa com esse termo."
            : mostrandoConcluidas
              ? "Nada concluido ainda."
              : "Nenhuma tarefa ativa. O que a equipe precisa fazer entra aqui."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Tarefa</th>
                <th className="px-4 py-3 font-semibold">Responsavel</th>
                <th className="px-4 py-3 font-semibold">Prazo</th>
                <th className="px-4 py-3 font-semibold">Prioridade</th>
                <th className="px-4 py-3 font-semibold">Situacao</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visiveis.map((t) => (
                <tr
                  key={t.id}
                  className={`border-b border-slate-100 last:border-0 ${
                    t.atrasada ? "bg-red-50/60" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {t.atrasada ? (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-900">
                          Atrasada
                        </span>
                      ) : null}
                      {t.meta ? (
                        <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-900">
                          Meta
                        </span>
                      ) : null}
                      <span className="font-medium text-slate-900">
                        {t.titulo}
                      </span>
                    </div>
                    {t.descricao ? (
                      <p className="mt-0.5 text-xs text-slate-600">
                        {t.descricao}
                      </p>
                    ) : null}
                    {t.numeroProcesso || t.nomeDoCliente ? (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {[t.nomeDoCliente, t.numeroProcesso]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {t.nomeDoResponsavel}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {quando.format(new Date(t.vencimentoISO))}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${COR_DA_PRIORIDADE[t.prioridade]}`}
                    >
                      {ROTULO_DA_PRIORIDADE[t.prioridade]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                    {ROTULO_DA_SITUACAO[t.situacao as SituacaoDaTarefa] ??
                      t.situacao}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex justify-end gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          agir(`${t.id}:situacao`, () =>
                            chamar(`/api/tarefas/${t.id}`, "PATCH", {
                              situacao:
                                t.situacao === "CONCLUIDA"
                                  ? "PENDENTE"
                                  : "CONCLUIDA",
                            }),
                          )
                        }
                        disabled={ocupado === `${t.id}:situacao`}
                        className="text-slate-700 underline-offset-2 hover:underline"
                      >
                        {t.situacao === "CONCLUIDA" ? "Reabrir" : "Concluir"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCriando(false);
                          setEditando(t);
                        }}
                        className="text-slate-700 underline-offset-2 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            !confirm(
                              `Apagar "${t.titulo}"? Isso nao tem volta.`,
                            )
                          )
                            return;
                          void agir(`${t.id}:apagar`, () =>
                            chamar(`/api/tarefas/${t.id}`, "DELETE"),
                          );
                        }}
                        disabled={ocupado === `${t.id}:apagar`}
                        className="text-red-700 underline-offset-2 hover:underline"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
