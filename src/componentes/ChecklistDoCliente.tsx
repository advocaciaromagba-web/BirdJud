"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export type ItemNaTela = {
  id: string;
  grupo: string;
  rotuloDoGrupo: string;
  documento: string;
  paraQue: string;
  essencial: boolean;
  entregue: boolean;
  arquivoNome: string | null;
};

export function ChecklistDoCliente({
  clienteId,
  tipoAcao,
  itens,
  temIA,
  textoParaCliente,
}: {
  clienteId: string;
  tipoAcao: string | null;
  itens: ItemNaTela[];
  temIA: boolean;
  textoParaCliente: string | null;
}) {
  const router = useRouter();
  const [abrindo, setAbrindo] = useState(false);
  const [montando, setMontando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  /**
   * Marcacoes ainda nao confirmadas pelo servidor.
   *
   * Sem isto a caixa ficava presa no valor que veio do servidor: clicar nao
   * mudava nada na tela ate a resposta voltar, e numa rede lenta a caixa
   * "voltava sozinha". Quem esta conferindo documento com o cliente ao
   * telefone clica de novo, e marca duas vezes.
   */
  const [otimista, setOtimista] = useState<Record<string, boolean>>({});

  async function montar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setAviso(null);
    setMontando(true);
    const dados = new FormData(evento.currentTarget);

    const resposta = await fetch("/api/checklist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clienteId,
        tipoAcao: String(dados.get("tipoAcao") ?? ""),
        area: String(dados.get("area") ?? "") || null,
        descricao: String(dados.get("descricao") ?? "") || null,
        pedeGratuidade: dados.get("gratuidade") === "on",
      }),
    });
    setMontando(false);

    const detalhe = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      setErro(detalhe?.erro ?? "Nao consegui montar a lista.");
      return;
    }
    if (detalhe?.avisoDaIA) setAviso(detalhe.avisoDaIA);
    setAbrindo(false);
    router.refresh();
  }

  async function marcar(id: string, entregue: boolean) {
    setOtimista((antes) => ({ ...antes, [id]: entregue }));
    const resposta = await fetch(`/api/checklist/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entregue }),
    });
    if (!resposta.ok) {
      // Desfaz: mostrar como recebido um documento que o servidor recusou
      // gravar e pior que nao marcar nada.
      setOtimista((antes) => {
        const copia = { ...antes };
        delete copia[id];
        return copia;
      });
      setErro("Nao consegui marcar este item.");
      return;
    }
    router.refresh();
  }

  const estaEntregue = (item: ItemNaTela) => otimista[item.id] ?? item.entregue;

  const faltamEssenciais = itens.filter(
    (i) => !estaEntregue(i) && i.essencial,
  ).length;
  const entregues = itens.filter((i) => estaEntregue(i)).length;

  const porGrupo = itens.reduce<Record<string, ItemNaTela[]>>((mapa, item) => {
    (mapa[item.rotuloDoGrupo] ??= []).push(item);
    return mapa;
  }, {});

  return (
    <section className="cartao">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Documentos a pedir</h2>
          {itens.length > 0 ? (
            <p className="mt-1 text-sm text-slate-600">
              {tipoAcao ? `${tipoAcao} · ` : ""}
              {entregues} de {itens.length} recebidos
              {faltamEssenciais > 0 ? (
                <span className="text-amber-700">
                  {" "}
                  · faltam {faltamEssenciais} essencial(is)
                </span>
              ) : null}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-600">
              Monte a lista do que pedir a este cliente.
              {!temIA
                ? " Sem o modulo de IA ela sai com a base fixa, sem a parte especifica da acao."
                : ""}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setAbrindo((e) => !e)}
          className={abrindo ? "botao-secundario" : "botao-principal"}
        >
          {abrindo ? "Fechar" : itens.length > 0 ? "Refazer a lista" : "Montar a lista"}
        </button>
      </div>

      {aviso ? (
        <p className="mt-3 rounded-[var(--raio)] border-l-4 border-l-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {aviso}
        </p>
      ) : null}

      {abrindo ? (
        <form onSubmit={montar} className="mt-4 grid gap-4">
          {itens.length > 0 ? (
            <p className="text-sm text-amber-700">
              Refazer substitui a lista atual, e o que ja foi marcado como
              recebido volta a ficar pendente.
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ck-tipo" className="rotulo">
                Tipo de acao
              </label>
              <input
                id="ck-tipo"
                name="tipoAcao"
                required
                minLength={3}
                placeholder="Acao de cobranca"
                className="campo"
              />
            </div>
            <div>
              <label htmlFor="ck-area" className="rotulo">
                Area <span className="font-normal text-slate-400">opcional</span>
              </label>
              <input
                id="ck-area"
                name="area"
                placeholder="Civel"
                className="campo"
              />
            </div>
          </div>
          <div>
            <label htmlFor="ck-desc" className="rotulo">
              Sobre o caso{" "}
              <span className="font-normal text-slate-400">opcional</span>
            </label>
            <input
              id="ck-desc"
              name="descricao"
              placeholder="Em poucas palavras, o que aconteceu"
              className="campo"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="gratuidade" className="h-4 w-4" />
            Vai pedir justica gratuita
          </label>
          {erro ? <p className="aviso-erro">{erro}</p> : null}
          <div>
            <button
              type="submit"
              disabled={montando}
              className="botao-principal disabled:opacity-50"
            >
              {montando ? "Montando..." : "Montar a lista"}
            </button>
          </div>
        </form>
      ) : null}

      {itens.length > 0 ? (
        <>
          <div className="mt-5 grid gap-5">
            {Object.entries(porGrupo).map(([rotulo, doGrupo]) => (
              <div key={rotulo}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {rotulo}
                </p>
                <ul className="mt-2 grid gap-1">
                  {doGrupo.map((item) => (
                    <li key={item.id} className="flex items-start gap-3 py-1">
                      <input
                        type="checkbox"
                        checked={estaEntregue(item)}
                        onChange={(e) => marcar(item.id, e.target.checked)}
                        aria-label={`Marcar ${item.documento} como recebido`}
                        className="mt-1 h-4 w-4 shrink-0"
                      />
                      <span className="text-sm">
                        <span
                          className={
                            estaEntregue(item) ? "text-slate-400 line-through" : ""
                          }
                        >
                          {item.documento}
                        </span>
                        {item.essencial && !estaEntregue(item) ? (
                          <span className="ml-2 text-xs text-amber-700">
                            essencial
                          </span>
                        ) : null}
                        {item.paraQue ? (
                          <span className="block text-xs text-slate-500">
                            {item.paraQue}
                          </span>
                        ) : null}
                        {item.arquivoNome ? (
                          <span className="block text-xs text-slate-500">
                            arquivo: {item.arquivoNome}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {textoParaCliente ? (
            <div className="mt-5 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(textoParaCliente);
                    setCopiado(true);
                    setTimeout(() => setCopiado(false), 2500);
                  } catch {
                    // Sem permissao de area de transferencia: o texto fica
                    // visivel abaixo para copiar a mao.
                    setCopiado(false);
                  }
                }}
                className="botao-secundario"
              >
                {copiado ? "Copiado" : "Copiar a lista para mandar ao cliente"}
              </button>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-slate-500">
                  ver o texto
                </summary>
                <pre className="mt-2 whitespace-pre-wrap rounded-[var(--raio)] bg-slate-50 p-3 text-xs text-slate-700">
                  {textoParaCliente}
                </pre>
              </details>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
