"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export type PrazoNaTela = {
  id: string;
  titulo: string;
  vencimento: string;
  vencimentoBR: string;
  inicioBR: string;
  explicacao: string;
  contagem: string;
  dias: number;
  urgencia: "VENCIDO" | "HOJE" | "URGENTE" | "EM_CURSO";
  diasUteis: number;
  cumprido: boolean;
  vinculo: string | null;
  observacao: string | null;
};

export type Opcao = { valor: string; rotulo: string };

const FAIXA: Record<PrazoNaTela["urgencia"], string> = {
  VENCIDO: "border-l-red-600 bg-red-50",
  HOJE: "border-l-red-500 bg-red-50",
  URGENTE: "border-l-amber-500 bg-amber-50",
  EM_CURSO: "border-l-slate-300 bg-white",
};

function quanto(p: PrazoNaTela): string {
  if (p.cumprido) return "cumprido";
  if (p.urgencia === "VENCIDO") return `venceu ha ${Math.abs(p.diasUteis)} dia(s) util(eis)`;
  if (p.urgencia === "HOJE") return "VENCE HOJE";
  if (p.diasUteis === 1) return "falta 1 dia util";
  return `faltam ${p.diasUteis} dias uteis`;
}

export function PainelPrazos({
  prazos,
  processos,
  clientes,
}: {
  prazos: PrazoNaTela[];
  processos: Opcao[];
  clientes: Opcao[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function criar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setPrevia(null);
    setSalvando(true);

    const form = evento.currentTarget;
    const dados = new FormData(form);
    const corpo = {
      titulo: String(dados.get("titulo") ?? ""),
      termoInicial: String(dados.get("termoInicial") ?? ""),
      dias: Number(dados.get("dias") ?? 0),
      contagem: String(dados.get("contagem") ?? "UTEIS"),
      processoId: String(dados.get("processoId") ?? "") || null,
      clienteId: String(dados.get("clienteId") ?? "") || null,
      observacao: String(dados.get("observacao") ?? "") || null,
    };

    const resposta = await fetch("/api/prazos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
    setSalvando(false);

    const detalhe = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      setErro(detalhe?.erro ?? "Nao consegui gravar o prazo.");
      return;
    }
    // Mostra a conta antes de sumir com o formulario: quem acabou de cadastrar
    // um prazo quer VER a data e a explicacao, nao procurar na lista.
    setPrevia(detalhe?.explicacao ?? null);
    form.reset();
    router.refresh();
  }

  async function marcar(id: string, cumprido: boolean) {
    await fetch(`/api/prazos/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cumprido }),
    });
    router.refresh();
  }

  const emAberto = prazos.filter((p) => !p.cumprido);
  const cumpridos = prazos.filter((p) => p.cumprido);

  return (
    <div className="grid gap-6">
      <section className="cartao">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Novo prazo</h2>
          <button
            type="button"
            onClick={() => setAberto((e) => !e)}
            className={aberto ? "botao-secundario" : "botao-principal"}
          >
            {aberto ? "Fechar" : "Calcular e registrar"}
          </button>
        </div>

        {previa ? (
          <p className="mt-3 rounded-[var(--raio)] border-l-4 border-l-emerald-500 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {previa}
          </p>
        ) : null}

        {aberto ? (
          <form onSubmit={criar} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="pz-titulo" className="rotulo">
                Do que se trata
              </label>
              <input
                id="pz-titulo"
                name="titulo"
                required
                minLength={3}
                placeholder="Contestacao"
                className="campo"
              />
            </div>

            <div>
              <label htmlFor="pz-termo" className="rotulo">
                Data da intimacao ou ciencia
              </label>
              <input
                id="pz-termo"
                name="termoInicial"
                type="date"
                required
                className="campo"
              />
              <p className="ajuda">
                O dia do comeco nao conta (CPC 224).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pz-dias" className="rotulo">
                  Dias
                </label>
                <input
                  id="pz-dias"
                  name="dias"
                  type="number"
                  min={1}
                  max={1000}
                  defaultValue={15}
                  required
                  className="campo"
                />
              </div>
              <div>
                <label htmlFor="pz-contagem" className="rotulo">
                  Contagem
                </label>
                <select
                  id="pz-contagem"
                  name="contagem"
                  defaultValue="UTEIS"
                  className="campo"
                >
                  <option value="UTEIS">Dias uteis</option>
                  <option value="CORRIDOS">Dias corridos</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="pz-processo" className="rotulo">
                Processo <span className="font-normal text-slate-400">opcional</span>
              </label>
              <select id="pz-processo" name="processoId" className="campo">
                <option value="">—</option>
                {processos.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="pz-cliente" className="rotulo">
                Cliente <span className="font-normal text-slate-400">opcional</span>
              </label>
              <select id="pz-cliente" name="clienteId" className="campo">
                <option value="">—</option>
                {clientes.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="pz-obs" className="rotulo">
                Observacao <span className="font-normal text-slate-400">opcional</span>
              </label>
              <input id="pz-obs" name="observacao" className="campo" />
            </div>

            {erro ? (
              <p className="aviso-erro sm:col-span-2">{erro}</p>
            ) : null}

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={salvando}
                className="botao-principal disabled:opacity-50"
              >
                {salvando ? "Calculando..." : "Calcular e registrar"}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section>
        <h2 className="font-semibold">Em aberto</h2>
        {emAberto.length === 0 ? (
          <p className="vazio mt-3">Nenhum prazo em aberto.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {emAberto.map((p) => (
              <li
                key={p.id}
                className={`rounded-[var(--raio)] border border-slate-200 border-l-4 px-4 py-3 ${FAIXA[p.urgencia]}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {p.titulo}
                      <span className="ml-2 text-sm font-normal text-slate-600">
                        vence {p.vencimentoBR} · {quanto(p)}
                      </span>
                    </p>
                    {p.vinculo ? (
                      <p className="text-xs text-slate-500">{p.vinculo}</p>
                    ) : null}
                    {/*
                      A explicacao fica VISIVEL, nao escondida atras de um
                      clique: e o que permite conferir a conta sem abrir o
                      codigo, e prazo e a unica conta deste sistema cujo erro
                      nao tem conserto depois.
                    */}
                    <p className="mt-1 text-xs text-slate-500">{p.explicacao}</p>
                    {p.observacao ? (
                      <p className="mt-1 text-xs text-slate-600">
                        {p.observacao}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => marcar(p.id, true)}
                    className="botao-secundario shrink-0"
                  >
                    Cumpri
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {cumpridos.length > 0 ? (
        <section>
          <h2 className="font-semibold">Cumpridos</h2>
          <ul className="lista mt-3">
            {cumpridos.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="text-slate-600">
                  {p.titulo} · vencia {p.vencimentoBR}
                </span>
                <button
                  type="button"
                  onClick={() => marcar(p.id, false)}
                  className="text-xs text-slate-500 hover:underline"
                >
                  reabrir
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
