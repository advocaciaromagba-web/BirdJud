"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Fase, Passo } from "@/lib/primeiros-passos";

type FaseNaTela = { chave: Fase; titulo: string; resumo: string };

const SELO: Record<Passo["situacao"], { texto: string; classe: string }> = {
  FEITO: { texto: "feito", classe: "etiqueta-ok" },
  PENDENTE: { texto: "a fazer", classe: "etiqueta-atencao" },
  PULADO: { texto: "pulado", classe: "etiqueta-neutra" },
  INDISPONIVEL: { texto: "em breve", classe: "etiqueta-neutra" },
};

/**
 * O roteiro inteiro, por fase. Cada passo diz POR QUE importa antes de dizer
 * o que fazer: quem entende o motivo configura direito; quem so segue a
 * ordem pula o que parece burocracia — e e justamente o que segura o resto.
 */
export function RoteiroDePrimeirosPassos({
  fases,
  passos,
  proximo,
}: {
  fases: FaseNaTela[];
  passos: Passo[];
  proximo: string | null;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(proximo);

  async function decidir(acao: "pular" | "retomar", chave: string) {
    setOcupado(chave);
    setErro(null);
    const r = await fetch("/api/primeiros-passos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ acao, chave }),
    });
    setOcupado(null);
    if (!r.ok) {
      setErro((await r.json().catch(() => ({}))).erro ?? "Nao deu certo.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-6 grid gap-8">
      {erro ? <p className="aviso-erro">{erro}</p> : null}
      {fases.map((fase, i) => {
        const daFase = passos.filter((p) => p.fase === fase.chave);
        if (daFase.length === 0) return null;
        const feitos = daFase.filter((p) => p.situacao === "FEITO").length;
        return (
          <section key={fase.chave}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold">
                <span className="mr-2 text-slate-400">{i + 1}.</span>
                {fase.titulo}
              </h2>
              <span className="text-sm text-slate-500">
                {feitos} de {daFase.length}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{fase.resumo}</p>

            <ol className="mt-3 grid gap-2">
              {daFase.map((p) => {
                const expandido = aberto === p.chave;
                const selo = SELO[p.situacao];
                return (
                  <li
                    key={p.chave}
                    className={`rounded-xl border bg-white ${
                      p.chave === proximo ? "border-[color:var(--marca-secundaria)] shadow-sm" : "border-slate-200"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setAberto(expandido ? null : p.chave)}
                      className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left"
                      aria-expanded={expandido}
                    >
                      <span
                        aria-hidden
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          p.situacao === "FEITO"
                            ? "bg-green-600 text-white"
                            : "border border-slate-300 text-slate-500"
                        }`}
                      >
                        {p.situacao === "FEITO" ? "✓" : ""}
                      </span>
                      <span
                        className={`flex-1 font-semibold ${
                          p.situacao === "FEITO" || p.situacao === "PULADO" ? "text-slate-500" : "text-slate-900"
                        }`}
                      >
                        {p.titulo}
                        {p.essencial ? (
                          <span className="ml-2 align-middle text-xs font-normal text-slate-500">essencial</span>
                        ) : null}
                      </span>
                      {p.situacao === "PENDENTE" ? (
                        <span className="text-xs text-slate-500">~{p.minutos} min</span>
                      ) : null}
                      <span className={selo.classe}>{selo.texto}</span>
                    </button>

                    {expandido ? (
                      <div className="grid gap-3 border-t border-slate-100 px-4 pb-4 pt-3 text-sm">
                        {p.detalhe ? <p className="font-medium text-slate-700">{p.detalhe}</p> : null}
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Por que importa
                          </p>
                          <p className="mt-1 leading-relaxed text-slate-700">{p.porque}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Como fazer
                          </p>
                          <p className="mt-1 leading-relaxed text-slate-700">{p.como}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {p.situacao !== "INDISPONIVEL" ? (
                            <Link
                              href={p.destino}
                              className={p.situacao === "FEITO" ? "botao-secundario" : "botao-principal"}
                            >
                              {p.situacao === "FEITO" ? "Revisar" : p.textoDoBotao}
                            </Link>
                          ) : null}
                          {p.situacao === "PENDENTE" && !p.essencial ? (
                            <button
                              type="button"
                              disabled={ocupado === p.chave}
                              onClick={() => decidir("pular", p.chave)}
                              className="botao-secundario"
                            >
                              Nao vamos usar agora
                            </button>
                          ) : null}
                          {p.situacao === "PULADO" ? (
                            <button
                              type="button"
                              disabled={ocupado === p.chave}
                              onClick={() => decidir("retomar", p.chave)}
                              className="botao-secundario"
                            >
                              Voltar para o roteiro
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

/** Barra de progresso, com o numero escrito: a barra sozinha nao se le. */
export function BarraDeProgresso({ porcento, rotulo }: { porcento: number; rotulo: string }) {
  return (
    <div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuenow={porcento}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={rotulo}
      >
        <div
          className="h-full rounded-full bg-[color:var(--marca-secundaria)] transition-all"
          style={{ width: `${porcento}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-slate-500">{rotulo}</p>
    </div>
  );
}
