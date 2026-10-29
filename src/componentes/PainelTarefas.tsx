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
import { LeitorDeDocumentos } from "./LeitorDeDocumentos";

export type TarefaNaTela = {
  id: string;
  titulo: string;
  descricao: string | null;
  vencimentoISO: string;
  /** Prazo fatal do processo (aaaa-mm-dd, Brasilia), quando houver. */
  prazoFatalDia: string | null;
  prioridade: Prioridade;
  situacao: string;
  meta: boolean;
  numeroProcesso: string | null;
  clienteId: string | null;
  nomeDoCliente: string | null;
  responsavelId: string;
  nomeDoResponsavel: string;
  atrasada: boolean;
  anexos: { id: string; nome: string; tamanhoBytes: number }[];
  /** O que foi feito para resolver, com quem escreveu e quando. */
  solucao: string | null;
  solucaoEmISO: string | null;
  solucaoPor: string | null;
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

const dia = (iso: string) => iso.split("-").reverse().join("/");

/** O que a leitura do documento pos no formulario, antes de gravar. */
type Preenchido = Partial<
  Record<"titulo" | "descricao" | "numeroProcesso" | "vencimento" | "prazoFatal", string>
>;

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
  temIA = false,
  temNuvem = false,
}: {
  tarefas: TarefaNaTela[];
  equipe: Pessoa[];
  clientes: Pessoa[];
  ativas: number;
  concluidas: number;
  mostrandoConcluidas: boolean;
  temIA?: boolean;
  /** Anexo de tarefa e arquivo do escritorio: so com o modulo de arquivos. */
  temNuvem?: boolean;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<TarefaNaTela | null>(null);
  const [criando, setCriando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // A leitura troca os valores iniciais e remonta o formulario (a `chave`):
  // o formulario e nao controlado, e assim continua editavel depois.
  const [preenchido, setPreenchido] = useState<Preenchido>({});
  const [chave, setChave] = useState(0);
  // O documento lido pela IA vira anexo da tarefa criada; as outras
  // providencias do mesmo documento ficam na fila para criar em seguida.
  const [anexosPendentes, setAnexosPendentes] = useState<File[]>([]);
  const [outras, setOutras] = useState<Record<string, string>[]>([]);
  // Providencia sem prazo no documento: a data e de quem le, nao da IA.
  const [semPrazo, setSemPrazo] = useState(false);
  // "Concluir" abre o campo da solucao: o momento de registrar o que foi
  // feito e na hora de concluir, nao depois. Em branco continua valendo.
  const [solucionando, setSolucionando] = useState<{ tarefa: TarefaNaTela; concluir: boolean } | null>(null);

  function camposDe(leitura: { campos: Record<string, { valor: string }> }): Record<string, string> {
    return Object.fromEntries(Object.entries(leitura.campos).map(([k, c]) => [k, c.valor]));
  }

  async function anexar(tarefaId: string, arquivos: File[]) {
    for (const arquivo of arquivos) {
      const dados = new FormData();
      dados.set("arquivo", arquivo);
      dados.set("tarefaId", tarefaId);
      const r = await fetch("/api/arquivos", { method: "POST", body: dados });
      if (!r.ok) {
        const json = await r.json().catch(() => ({}));
        throw new Error(`A tarefa foi criada, mas o anexo "${arquivo.name}" não subiu: ${json.erro ?? "tente de novo pela lista"}.`);
      }
    }
  }

  function aplicarLeitura(campos: Record<string, string>) {
    const descricao = [
      campos.descricao,
      campos.prazoDias && campos.dataDoAto
        ? `Prazo de ${campos.prazoDias} dias ${campos.contagem === "CORRIDOS" ? "corridos" : "uteis"} a partir de ${dia(campos.dataDoAto)} (lido pela IA — confira nos autos).`
        : null,
    ]
      .filter(Boolean)
      .join("\n");
    setSemPrazo(!campos.entrega);
    setPreenchido({
      titulo: campos.titulo,
      descricao: descricao || undefined,
      numeroProcesso: campos.numeroProcesso,
      // Entrega no fim do expediente do dia sugerido.
      vencimento: campos.entrega ? `${campos.entrega}T18:00` : undefined,
      prazoFatal: campos.prazoFatal,
    });
    setChave((n) => n + 1);
  }

  function fecharFormulario() {
    setCriando(false);
    setEditando(null);
    setPreenchido({});
    setAnexosPendentes([]);
    setOutras([]);
  }

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
      throw new Error(dados.erro ?? "Não deu certo. Tente de novo.");
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
      key={`${tarefa?.id ?? "nova"}:${chave}`}
      onSubmit={async (evento) => {
        evento.preventDefault();
        const dados = new FormData(evento.currentTarget);
        const corpo = {
          titulo: String(dados.get("titulo") ?? ""),
          descricao: String(dados.get("descricao") ?? "") || null,
          vencimento: String(dados.get("vencimento") ?? ""),
          prazoFatal: String(dados.get("prazoFatal") ?? "") || null,
          prioridade: String(dados.get("prioridade") ?? "MEDIA"),
          responsavelId: String(dados.get("responsavelId") ?? ""),
          clienteId: String(dados.get("clienteId") ?? "") || null,
          numeroProcesso: String(dados.get("numeroProcesso") ?? "") || null,
          meta: dados.get("meta") === "on",
        };
        const escolhidos = Array.from(dados.getAll("anexos")).filter(
          (a): a is File => a instanceof File && a.size > 0,
        );
        await agir("formulario", async () => {
          if (tarefa) {
            await chamar(`/api/tarefas/${tarefa.id}`, "PATCH", corpo);
            if (escolhidos.length) await anexar(tarefa.id, escolhidos);
            fecharFormulario();
            return;
          }
          const { tarefa: criada } = (await chamar("/api/tarefas", "POST", corpo)) as { tarefa: { id: string } };
          await anexar(criada.id, [...anexosPendentes, ...escolhidos]);
          // Sobrou providencia do mesmo documento? Carrega a proxima no
          // formulario, com o documento ainda pendente de anexo.
          const [proxima, ...resto] = outras;
          if (proxima) {
            aplicarLeitura(proxima);
            setOutras(resto);
          } else {
            fecharFormulario();
          }
        });
      }}
      className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4"
    >
      <label className="grid gap-1 text-sm">
        <span className="text-slate-600">Título</span>
        <input
          name="titulo"
          required
          minLength={3}
          defaultValue={preenchido.titulo ?? tarefa?.titulo ?? ""}
          placeholder="O serviço a executar. Ex: contestação, manifestação sobre o laudo, recurso"
          className="rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="text-slate-600">Descrição (opcional)</span>
        <textarea
          name="descricao"
          rows={3}
          defaultValue={preenchido.descricao ?? tarefa?.descricao ?? ""}
          className="rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600">Entrega (no escritório)</span>
          <input
            type="datetime-local"
            name="vencimento"
            required
            defaultValue={
              preenchido.vencimento ??
              (tarefa ? paraCampo(tarefa.vencimentoISO) : undefined)
            }
            className="rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600">Prazo fatal (processo)</span>
          <input
            type="date"
            name="prazoFatal"
            defaultValue={preenchido.prazoFatal ?? tarefa?.prazoFatalDia ?? ""}
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
          <span className="text-slate-600">Responsável</span>
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
            Número do processo (opcional)
          </span>
          <input
            name="numeroProcesso"
            defaultValue={preenchido.numeroProcesso ?? tarefa?.numeroProcesso ?? ""}
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
        <span>É uma meta (não uma tarefa do dia a dia)</span>
      </label>

      {temNuvem ? (
        <label className="grid gap-1 text-sm">
          <span className="text-slate-600">Anexos (a intimação, o despacho, o comprovante)</span>
          <input type="file" name="anexos" multiple className="campo file:mr-3 file:rounded file:border-0 file:bg-slate-200 file:px-3 file:py-1 file:text-sm" />
          {!tarefa && anexosPendentes.length ? (
            <span className="ajuda">
              Vai junto: {anexosPendentes.map((a) => a.name).join(", ")} (o documento lido pela IA).
            </span>
          ) : null}
        </label>
      ) : null}

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
          onClick={fecharFormulario}
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

      {criando && temIA ? (
        <LeitorDeDocumentos
          perfil="TAREFA"
          aoAplicar={aplicarLeitura}
          aoLer={(arquivos, leitura) => {
            setAnexosPendentes(temNuvem ? arquivos : []);
            setOutras((leitura.outras ?? []).map(camposDe));
          }}
        />
      ) : null}
      {criando && outras.length ? (
        <p className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
          O documento determina mais {outras.length} providência{outras.length > 1 ? "s" : ""}:{" "}
          {outras.map((o) => o.titulo).join("; ")}. Ao salvar esta tarefa, a próxima entra no formulário, com o mesmo documento anexado.
        </p>
      ) : null}
      {criando && semPrazo && Object.keys(preenchido).length > 0 ? (
        <p className="aviso-atencao text-sm">
          O documento não diz o prazo desta providência. Informe a data de entrega (e o prazo fatal, se houver) antes de salvar: sem data a tarefa não é criada.
        </p>
      ) : null}
      {criando && Object.keys(preenchido).length > 0 ? (
        <p className="rounded-lg border-2 border-violet-300 bg-violet-50 p-3 text-sm font-semibold text-violet-900">
          Sugestao da IA no formulário abaixo: confira o prazo e o assunto nos
          autos antes de salvar.
        </p>
      ) : null}
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
          Concluídas ({concluidas})
        </Link>
      </div>

      {visiveis.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          {busca
            ? "Nenhuma tarefa com esse termo."
            : mostrandoConcluidas
              ? "Nada concluído ainda."
              : "Nenhuma tarefa ativa. O que a equipe precisa fazer entra aqui."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Tarefa</th>
                <th className="px-4 py-3 font-semibold">Responsável</th>
                <th className="px-4 py-3 font-semibold">Entrega / prazo fatal</th>
                <th className="px-4 py-3 font-semibold">Prioridade</th>
                <th className="px-4 py-3 font-semibold">Situação</th>
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
                    {t.solucao ? (
                      <div className="mt-1.5 rounded border-l-2 border-emerald-500 bg-emerald-50 px-2 py-1 text-xs text-slate-700">
                        <span className="font-semibold text-emerald-900">Solução: </span>
                        <span className="whitespace-pre-line">{t.solucao}</span>
                        <span className="mt-0.5 block text-slate-500">
                          {[t.solucaoPor, t.solucaoEmISO ? quando.format(new Date(t.solucaoEmISO)) : null]
                            .filter(Boolean)
                            .join(" · ")}
                          {" · "}
                          <button
                            type="button"
                            className="underline-offset-2 hover:underline"
                            onClick={() => setSolucionando({ tarefa: t, concluir: false })}
                          >
                            editar
                          </button>
                        </span>
                      </div>
                    ) : t.situacao === "CONCLUIDA" ? (
                      <button
                        type="button"
                        className="mt-1 text-xs text-emerald-800 underline-offset-2 hover:underline"
                        onClick={() => setSolucionando({ tarefa: t, concluir: false })}
                      >
                        Registrar solução
                      </button>
                    ) : null}
                    {t.numeroProcesso || t.nomeDoCliente ? (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {[t.nomeDoCliente, t.numeroProcesso]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                    {t.anexos.length ? (
                      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                        {t.anexos.map((a) => (
                          <a key={a.id} href={`/api/arquivos/${a.id}`} className="text-marca underline" title={`${Math.max(1, Math.round(a.tamanhoBytes / 1024))} KB`}>
                            📎 {a.nome}
                          </a>
                        ))}
                      </p>
                    ) : null}
                    {temNuvem ? (
                      <label className="mt-1 inline-block cursor-pointer text-xs text-slate-600 underline-offset-2 hover:underline">
                        {ocupado === `${t.id}:anexo` ? "Anexando..." : "Anexar arquivo"}
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const arquivos = Array.from(e.target.files ?? []);
                            e.target.value = "";
                            if (arquivos.length) void agir(`${t.id}:anexo`, () => anexar(t.id, arquivos));
                          }}
                        />
                      </label>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {t.nomeDoResponsavel}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {quando.format(new Date(t.vencimentoISO))}
                    {t.prazoFatalDia ? (
                      <span className="block text-xs font-semibold text-red-700">
                        fatal {dia(t.prazoFatalDia)}
                      </span>
                    ) : null}
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
                          t.situacao === "CONCLUIDA"
                            ? agir(`${t.id}:situacao`, () =>
                                chamar(`/api/tarefas/${t.id}`, "PATCH", { situacao: "PENDENTE" }),
                              )
                            : setSolucionando({ tarefa: t, concluir: true })
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
                          setPreenchido({});
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
                              `Apagar "${t.titulo}"? Isso não tem volta.`,
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

      {solucionando ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSolucionando(null);
          }}
        >
          <form
            className="grid w-full max-w-lg gap-3 rounded-xl bg-white p-5 shadow-xl"
            onSubmit={async (evento) => {
              evento.preventDefault();
              const texto = String(new FormData(evento.currentTarget).get("solucao") ?? "");
              const { tarefa, concluir } = solucionando;
              await agir(`${tarefa.id}:solucao`, () =>
                chamar(`/api/tarefas/${tarefa.id}`, "PATCH", {
                  ...(concluir ? { situacao: "CONCLUIDA" } : {}),
                  // Concluindo sem escrever nada, nao mexe no que ja havia.
                  ...(concluir && !texto.trim() ? {} : { solucao: texto }),
                }),
              );
              setSolucionando(null);
            }}
          >
            <h2 className="text-lg font-semibold">
              {solucionando.concluir ? "Concluir tarefa" : "Solução da tarefa"}
            </h2>
            <p className="-mt-2 text-sm text-slate-600">{solucionando.tarefa.titulo}</p>
            <label className="grid gap-1">
              <span className="rotulo">O que foi feito para resolver</span>
              <textarea
                name="solucao"
                className="campo min-h-28"
                maxLength={4000}
                autoFocus
                defaultValue={solucionando.tarefa.solucao ?? ""}
                placeholder="Ex.: Protocolada a manifestação em 29/10; cliente avisado por WhatsApp."
              />
            </label>
            <p className="ajuda -mt-1">
              {solucionando.concluir
                ? "Opcional: há tarefa que se explica pelo título. Fica registrado quem escreveu e quando."
                : "Fica registrado quem escreveu e quando. Apagar o texto apaga o registro."}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="botao-discreto" onClick={() => setSolucionando(null)}>
                Cancelar
              </button>
              <button type="submit" className="botao-principal" disabled={ocupado === `${solucionando.tarefa.id}:solucao`}>
                {ocupado === `${solucionando.tarefa.id}:solucao`
                  ? "Salvando…"
                  : solucionando.concluir
                    ? "Concluir"
                    : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
