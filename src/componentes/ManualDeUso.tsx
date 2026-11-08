"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CHECKLIST_DE_IMPLANTACAO,
  CONTATO,
  PERGUNTAS,
  PONTOS_DA_TELA_INICIAL,
  ROTULO_DO_PAPEL,
  SECOES,
  TAMANHO_DA_TELA,
  type Papel,
  type Secao,
  type Tela,
} from "@/lib/manual";

/** Sem acento e em minusculas: "cobranca" acha "Cobranças". */
const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function textoDaSecao(s: Secao): string {
  return normalizar(
    [s.titulo, s.resumo, s.caminho, s.grupo, s.modulo ?? "", ...s.telas.map((t) => t.legenda), ...s.passos.flatMap((p) => [p.titulo, ...p.etapas]), ...(s.dicas ?? [])].join(" "),
  );
}

const GRUPOS = [...new Set(SECOES.map((s) => s.grupo))];
const CHAVE_DO_CHECKLIST = "birdjud-manual-implantacao";

/**
 * O manual de utilizacao: indice que acompanha a leitura, busca que filtra
 * sem acento, filtro por papel, telas que ampliam, pontos clicaveis na tela
 * inicial, passo a passo em abas, lista de implantacao que se lembra do que
 * foi marcado e perguntas frequentes.
 */
export function ManualDeUso() {
  const [busca, setBusca] = useState("");
  const [papel, setPapel] = useState<Papel | null>(null);
  const [ampliada, setAmpliada] = useState<Tela | null>(null);
  const [visivel, setVisivel] = useState<string>(SECOES[0].id);
  const [feitos, setFeitos] = useState<Set<string>>(new Set());
  const dialogo = useRef<HTMLDialogElement>(null);

  // A lista de implantacao fica no navegador de quem marcou.
  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_DO_CHECKLIST) ?? "[]");
      if (Array.isArray(salvo)) setFeitos(new Set(salvo.filter((x) => typeof x === "string")));
    } catch {
      // Sem armazenamento (janela anonima): a lista so nao se lembra.
    }
  }, []);
  function marcar(id: string, feito: boolean) {
    const novo = new Set(feitos);
    if (feito) novo.add(id);
    else novo.delete(id);
    setFeitos(novo);
    try {
      localStorage.setItem(CHAVE_DO_CHECKLIST, JSON.stringify([...novo]));
    } catch {
      // idem
    }
  }

  const termo = normalizar(busca.trim());
  const secoes = useMemo(
    () => SECOES.filter((s) => (!papel || s.papeis.includes(papel)) && (!termo || textoDaSecao(s).includes(termo))),
    [termo, papel],
  );
  const perguntas = useMemo(() => PERGUNTAS.filter((q) => !termo || normalizar(`${q.p} ${q.r}`).includes(termo)), [termo]);

  // O indice acompanha a leitura.
  useEffect(() => {
    const observador = new IntersectionObserver(
      (entradas) => {
        const primeira = entradas.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (primeira) setVisivel(primeira.target.id);
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    document.querySelectorAll("[data-secao]").forEach((el) => observador.observe(el));
    return () => observador.disconnect();
  }, [secoes]);

  useEffect(() => {
    if (ampliada) dialogo.current?.showModal();
    else dialogo.current?.close();
  }, [ampliada]);

  const feitosNaLista = CHECKLIST_DE_IMPLANTACAO.filter((c) => feitos.has(c.id)).length;

  return (
    <div className="min-h-screen bg-[color:var(--off-white)] text-slate-900">
      <header className="border-b border-slate-200 bg-[#0B1F3B] text-white print:bg-white print:text-slate-900">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <a href="/" className="flex items-center gap-3" aria-label="BirdJud, página inicial">
              <Image src="/marca/simbolo.png" alt="" width={40} height={40} className="h-10 w-10" />
              <span className="text-xl font-bold tracking-tight">BirdJud</span>
            </a>
            <div className="flex flex-wrap gap-2 print:hidden">
              <button type="button" onClick={() => window.print()} className="rounded-lg border border-white/30 px-3 py-1.5 text-sm hover:bg-white/10">
                Imprimir ou salvar em PDF
              </button>
              <a href="/login" className="rounded-lg bg-[#D4AF7C] px-3 py-1.5 text-sm font-semibold text-[#0B1F3B] hover:brightness-105">
                Entrar no sistema
              </a>
            </div>
          </div>
          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-[#D4AF7C]">Manual de utilização</p>
          <h1 className="mt-2 max-w-3xl text-3xl font-bold leading-tight text-white sm:text-4xl print:text-slate-900">Tudo o que o escritório faz no BirdJud, tela por tela</h1>
          <p className="mt-3 max-w-2xl text-white/80 print:text-slate-600">
            Do primeiro acesso ao fechamento do caixa. Procure o que precisa, filtre pelo seu papel no escritório e clique nas telas para ampliar.
          </p>

          <div className="mt-6 grid gap-3 print:hidden sm:grid-cols-[1fr_auto] sm:items-center">
            <label className="relative block">
              <span className="sr-only">Procurar no manual</span>
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Procurar: boleto, prazo, procuração, senha…"
                className="w-full rounded-xl border-0 bg-white px-4 py-3 text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D4AF7C]"
              />
            </label>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Mostrar o que interessa a">
              {([null, "ADMIN", "ADVOGADO", "APOIO"] as (Papel | null)[]).map((p) => (
                <button
                  key={p ?? "todos"}
                  type="button"
                  aria-pressed={papel === p}
                  onClick={() => setPapel(p)}
                  className={`rounded-full px-3 py-1.5 text-sm ${papel === p ? "bg-[#D4AF7C] font-semibold text-[#0B1F3B]" : "border border-white/30 text-white hover:bg-white/10"}`}
                >
                  {p ? ROTULO_DO_PAPEL[p].split(" (")[0] : "Todos"}
                </button>
              ))}
            </div>
          </div>
          {termo || papel ? (
            <p role="status" className="mt-3 text-sm text-white/80 print:hidden">
              {secoes.length} assunto(s){perguntas.length && termo ? ` e ${perguntas.length} pergunta(s)` : ""} encontrado(s).
            </p>
          ) : null}
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[230px_1fr]">
        <nav aria-label="Índice do manual" className="print:hidden">
          <details className="rounded-xl border border-slate-200 bg-white p-3 lg:hidden">
            <summary className="cursor-pointer font-semibold">Índice</summary>
            <Indice secoes={secoes} visivel={visivel} />
          </details>
          <div className="sticky top-4 hidden max-h-[calc(100vh-2rem)] overflow-y-auto lg:block">
            <Indice secoes={secoes} visivel={visivel} />
          </div>
        </nav>

        <main className="min-w-0">
          {secoes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
              Nada encontrado para “{busca}”. Tente outra palavra, ou fale com o suporte.
            </div>
          ) : null}

          {GRUPOS.map((grupo) => {
            const doGrupo = secoes.filter((s) => s.grupo === grupo);
            if (!doGrupo.length) return null;
            return (
              <div key={grupo} className="mb-4">
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#8c6d1f]">{grupo}</h2>
                {doGrupo.map((s) => (
                  <SecaoDoManual key={s.id} secao={s} aoAmpliar={setAmpliada} />
                ))}
              </div>
            );
          })}

          {!termo ? (
            <section id="implantacao" data-secao className="mb-10 scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8c6d1f]">Para o administrador</p>
              <h2 className="mt-1 text-2xl font-bold">Lista de implantação</h2>
              <p className="mt-2 text-slate-600">Marque o que já foi feito. A lista fica guardada neste navegador, para você voltar depois.</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${(feitosNaLista / CHECKLIST_DE_IMPLANTACAO.length) * 100}%` }} />
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {feitosNaLista} de {CHECKLIST_DE_IMPLANTACAO.length} feitos
              </p>
              <ul className="mt-4 grid gap-2">
                {CHECKLIST_DE_IMPLANTACAO.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                      <input type="checkbox" className="mt-1 h-4 w-4" checked={feitos.has(c.id)} onChange={(e) => marcar(c.id, e.target.checked)} />
                      <span className={feitos.has(c.id) ? "text-slate-500 line-through" : ""}>
                        {c.texto}
                        {c.essencial ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 no-underline">essencial</span> : null}
                        <span className="block text-xs text-slate-500">em {c.onde}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {perguntas.length ? (
            <section id="perguntas" data-secao className="mb-10 scroll-mt-4">
              <h2 className="text-2xl font-bold">Perguntas frequentes</h2>
              <div className="mt-4 grid gap-2">
                {perguntas.map((q) => (
                  <details key={q.p} className="group rounded-xl border border-slate-200 bg-white p-4 open:shadow-sm">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                      {q.p}
                      <span aria-hidden="true" className="text-slate-400 transition group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <p className="mt-2 text-slate-700">{q.r}</p>
                  </details>
                ))}
              </div>
            </section>
          ) : null}

          <section id="suporte" data-secao className="scroll-mt-4 rounded-2xl bg-[#0B1F3B] p-6 text-white sm:p-8 print:bg-white print:text-slate-900">
            <h2 className="text-2xl font-bold text-white print:text-slate-900">Ficou alguma dúvida?</h2>
            <p className="mt-2 text-white/80 print:text-slate-600">Fale com o suporte do BirdJud. Diga o nome do escritório e, se puder, mande o print da tela.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a href={CONTATO.whatsappLink} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#D4AF7C] px-4 py-2 font-semibold text-[#0B1F3B] hover:brightness-105">
                WhatsApp {CONTATO.whatsapp}
              </a>
              <a href={`mailto:${CONTATO.email}`} className="rounded-lg border border-white/30 px-4 py-2 hover:bg-white/10">
                {CONTATO.email}
              </a>
            </div>
            <p className="mt-6 text-xs text-white/60 print:text-slate-500">
              BirdJud · {CONTATO.empresa}. As telas deste manual são do escritório de demonstração, com dados inventados.
            </p>
          </section>
        </main>
      </div>

      <dialog
        ref={dialogo}
        onClose={() => setAmpliada(null)}
        onClick={(e) => e.target === dialogo.current && setAmpliada(null)}
        className="max-h-[95vh] w-[min(1400px,96vw)] rounded-xl p-0 backdrop:bg-slate-950/80"
      >
        {ampliada ? (
          <div>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2">
              <p className="text-sm font-medium">{ampliada.legenda}</p>
              <button type="button" onClick={() => setAmpliada(null)} className="rounded-lg px-3 py-1 text-sm hover:bg-slate-100" autoFocus>
                Fechar ✕
              </button>
            </div>
            <Image
              src={`/manual/${ampliada.arquivo}.jpg`}
              alt={ampliada.legenda}
              width={TAMANHO_DA_TELA[ampliada.arquivo]?.[0] ?? 1366}
              height={TAMANHO_DA_TELA[ampliada.arquivo]?.[1] ?? 860}
              className={`mx-auto h-auto ${ampliada.celular ? "max-w-sm" : "w-full"}`}
              sizes="96vw"
            />
          </div>
        ) : null}
      </dialog>
    </div>
  );
}

function Indice({ secoes, visivel }: { secoes: Secao[]; visivel: string }) {
  const item = (id: string, rotulo: string) => (
    <li key={id}>
      <a
        href={`#${id}`}
        aria-current={visivel === id ? "location" : undefined}
        className={`block rounded-md px-2 py-1 text-sm ${visivel === id ? "bg-[#0B1F3B] font-semibold text-white" : "text-slate-700 hover:bg-slate-100"}`}
      >
        {rotulo}
      </a>
    </li>
  );
  return (
    <div className="mt-3 grid gap-4 lg:mt-0">
      {GRUPOS.map((g) => {
        const doGrupo = secoes.filter((s) => s.grupo === g);
        if (!doGrupo.length) return null;
        return (
          <div key={g}>
            <p className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{g}</p>
            <ul className="mt-1 grid gap-0.5">{doGrupo.map((s) => item(s.id, s.titulo))}</ul>
          </div>
        );
      })}
      <div>
        <p className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Mais</p>
        <ul className="mt-1 grid gap-0.5">
          {item("implantacao", "Lista de implantação")}
          {item("perguntas", "Perguntas frequentes")}
          {item("suporte", "Suporte")}
        </ul>
      </div>
    </div>
  );
}

function SecaoDoManual({ secao: s, aoAmpliar }: { secao: Secao; aoAmpliar: (t: Tela) => void }) {
  const [aba, setAba] = useState(0);
  const [tela, setTela] = useState(0);
  const [ponto, setPonto] = useState<number | null>(null);
  const atual = s.telas[tela];
  const comPontos = s.id === "inicio" && atual.arquivo === "inicio";
  const [largura, altura] = TAMANHO_DA_TELA[atual.arquivo] ?? [1366, 860];

  return (
    <section id={s.id} data-secao className="mb-10 scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 print:break-inside-avoid-page print:shadow-none">
      <h3 className="text-2xl font-bold">{s.titulo}</h3>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{s.caminho}</span>
        {s.modulo ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">{s.modulo}</span> : null}
        {s.papeis.length < 3 ? <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-800">Para: {s.papeis.map((p) => ROTULO_DO_PAPEL[p].split(" (")[0]).join(", ")}</span> : null}
      </div>
      <p className="mt-3 leading-relaxed text-slate-700">{s.resumo}</p>

      <figure className="mt-5">
        <div className={`overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow ${atual.celular ? "mx-auto max-w-[280px]" : ""}`}>
          {atual.celular ? null : (
            <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-3 py-2" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
              <span className="ml-2 truncate rounded bg-white px-2 py-0.5 text-[11px] text-slate-500">seu-escritorio.birdjud.com.br</span>
            </div>
          )}
          <div className="relative">
            <button type="button" onClick={() => aoAmpliar(atual)} className="block w-full cursor-zoom-in" aria-label={`Ampliar: ${atual.legenda}`}>
              <Image
                src={`/manual/${atual.arquivo}.jpg`}
                alt={atual.legenda}
                width={largura}
                height={altura}
                sizes="(max-width: 1024px) 100vw, 820px"
                className={`h-auto w-full ${altura > largura * 1.5 && !atual.celular ? "max-h-[520px] object-cover object-top" : ""}`}
              />
            </button>
            {comPontos
              ? PONTOS_DA_TELA_INICIAL.map((p) => (
                  <button
                    key={p.n}
                    type="button"
                    onClick={() => setPonto(ponto === p.n ? null : p.n)}
                    aria-pressed={ponto === p.n}
                    aria-label={`${p.n}. ${p.titulo}`}
                    style={{ left: `${p.x}%`, top: `${p.y}%` }}
                    className={`absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-sm font-bold shadow-lg ring-2 ring-white transition print:hidden ${
                      ponto === p.n ? "scale-110 bg-[#0B1F3B] text-white" : "bg-[#D4AF7C] text-[#0B1F3B] hover:scale-110"
                    }`}
                  >
                    {p.n}
                  </button>
                ))
              : null}
          </div>
        </div>
        <figcaption className="mt-2 text-center text-sm text-slate-500">{atual.legenda} · clique para ampliar</figcaption>
      </figure>

      {comPontos ? (
        <ol className="mt-4 grid gap-2 sm:grid-cols-2">
          {PONTOS_DA_TELA_INICIAL.map((p) => (
            <li key={p.n}>
              <button
                type="button"
                onClick={() => setPonto(ponto === p.n ? null : p.n)}
                className={`flex w-full gap-3 rounded-lg border p-3 text-left text-sm ${ponto === p.n ? "border-[#0B1F3B] bg-slate-50" : "border-slate-200 hover:bg-slate-50"}`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#D4AF7C] text-xs font-bold text-[#0B1F3B]">{p.n}</span>
                <span>
                  <strong>{p.titulo}.</strong> {p.texto}
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      {s.telas.length > 1 ? (
        <div className="mt-3 flex flex-wrap justify-center gap-2 print:hidden" role="group" aria-label="Outras telas desta área">
          {s.telas.map((t, i) => (
            <button
              key={t.arquivo}
              type="button"
              onClick={() => setTela(i)}
              aria-pressed={tela === i}
              className={`rounded-full px-3 py-1 text-xs ${tela === i ? "bg-[#0B1F3B] text-white" : "border border-slate-300 text-slate-700 hover:bg-slate-50"}`}
            >
              {i + 1}. {t.legenda}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-6">
        <h4 className="text-lg font-semibold">Passo a passo</h4>
        {s.passos.length > 1 ? (
          <div role="tablist" aria-label={`Passo a passo: ${s.titulo}`} className="mt-3 flex flex-wrap gap-1 border-b border-slate-200 print:hidden">
            {s.passos.map((p, i) => (
              <button
                key={p.titulo}
                type="button"
                role="tab"
                id={`${s.id}-aba-${i}`}
                aria-selected={aba === i}
                aria-controls={`${s.id}-passos-${i}`}
                onClick={() => setAba(i)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === i ? "border-[#0B1F3B] font-semibold text-slate-900" : "border-transparent text-slate-600 hover:text-slate-900"}`}
              >
                {p.titulo}
              </button>
            ))}
          </div>
        ) : null}
        {s.passos.map((p, i) => (
          <div
            key={p.titulo}
            role={s.passos.length > 1 ? "tabpanel" : undefined}
            id={`${s.id}-passos-${i}`}
            aria-labelledby={s.passos.length > 1 ? `${s.id}-aba-${i}` : undefined}
            className={`${aba === i ? "" : "hidden print:block"} mt-4`}
          >
            {s.passos.length === 1 ? <p className="font-medium">{p.titulo}</p> : <p className="hidden font-medium print:block">{p.titulo}</p>}
            <ol className="mt-2 grid gap-2">
              {p.etapas.map((e, j) => (
                <li key={e} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0B1F3B] text-xs font-semibold text-white">{j + 1}</span>
                  <span className="leading-relaxed text-slate-700">{e}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      {s.dicas?.length ? (
        <div className="mt-6 rounded-xl border-l-4 border-[#D4AF7C] bg-amber-50/60 p-4">
          <p className="text-sm font-semibold text-[#8c6d1f]">Bom saber</p>
          <ul className="mt-2 grid gap-1.5 text-sm text-slate-700">
            {s.dicas.map((d) => (
              <li key={d} className="flex gap-2">
                <span aria-hidden="true" className="text-[#D4AF7C]">
                  ●
                </span>
                {d}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
