"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type TriagemNaTela = {
  id: string;
  /** AGENDAMENTO | TAREFA */
  especie: string;
  /** AUDIENCIA | PERICIA | COMPROMISSO | TAREFA */
  tipo: string;
  titulo: string;
  resumo: string;
  /** Ja formatado para leitura. */
  prazoFatal: string | null;
  /** ISO, para preencher o campo de data. */
  prazoSugerido: string | null;
  dataDoAto: string | null;
  confianca: string;
  atencao: string | null;
  explicacao: string | null;
  aceita: boolean;
  recusada: boolean;
};

export type PublicacaoNaTela = {
  temIA: boolean;
  analise: string | null;
  id: string;
  numeroProcesso: string | null;
  numeroFormatado: string | null;
  temProcesso: boolean;
  tribunal: string | null;
  orgao: string | null;
  tipoComunicacao: string | null;
  texto: string;
  link: string | null;
  oab: string | null;
  data: string;
  urgente: boolean;
  prazoDias: number | null;
  lida: boolean;
  /** REPETIDA | PARECE_REPETIDA | null. Ver src/lib/duplicados.ts. */
  repeticao: string | null;
  triagem: TriagemNaTela | null;
};

export type PessoaDaEquipe = { id: string; nome: string };

export function ListaPublicacoes({
  publicacoes,
  equipe = [],
}: {
  publicacoes: PublicacaoNaTela[];
  equipe?: PessoaDaEquipe[];
}) {
  if (publicacoes.length === 0) {
    return (
      <p className="mt-6 text-slate-600">
        Nenhuma publicacao em aberto. As capturas rodam de madrugada, por OAB
        monitorada.
      </p>
    );
  }

  return (
    <ul className="mt-6 grid gap-4">
      {publicacoes.map((publicacao) => (
        <Cartao key={publicacao.id} publicacao={publicacao} equipe={equipe} />
      ))}
    </ul>
  );
}

const ROTULO_DA_ESPECIE: Record<string, string> = {
  AGENDAMENTO: "Agendar",
  TAREFA: "Tarefa",
};

const ROTULO_DO_TIPO: Record<string, string> = {
  AUDIENCIA: "audiencia",
  PERICIA: "pericia",
  COMPROMISSO: "compromisso",
  TAREFA: "tarefa",
};

/** ISO -> valor de <input type="datetime-local">, no fuso de quem olha. */
function paraCampo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const ajustada = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return ajustada.toISOString().slice(0, 16);
}

function Cartao({
  publicacao,
  equipe,
}: {
  publicacao: PublicacaoNaTela;
  equipe: PessoaDaEquipe[];
}) {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [analise, setAnalise] = useState<string | null>(publicacao.analise);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const t = publicacao.triagem;
  const [quando, setQuando] = useState(
    paraCampo(t?.dataDoAto ?? t?.prazoSugerido ?? null),
  );
  const [titulo, setTitulo] = useState(t?.titulo ?? "");
  const [responsavelId, setResponsavelId] = useState("");

  async function analisar() {
    setOcupado(true);
    setErro(null);
    const resposta = await fetch("/api/ia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: "ANALISE_PUBLICACAO",
        publicacaoId: publicacao.id,
      }),
    });
    const json = await resposta.json().catch(() => ({}));
    setOcupado(false);
    if (resposta.ok) {
      setAnalise(json.analise.texto);
      router.refresh();
      return;
    }
    setErro(json.erro ?? "Nao foi possivel analisar.");
  }

  async function triarDeNovo() {
    setOcupado(true);
    setErro(null);
    const resposta = await fetch(`/api/publicacoes/${publicacao.id}/triagem`, {
      method: "POST",
    });
    const json = await resposta.json().catch(() => ({}));
    setOcupado(false);
    if (!resposta.ok) {
      setErro(json.erro ?? "Nao consegui triar.");
      return;
    }
    router.refresh();
  }

  async function decidir(acao: "ACEITAR" | "RECUSAR") {
    if (!t) return;
    setOcupado(true);
    setErro(null);
    const resposta = await fetch(`/api/triagens/${t.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        acao,
        quando: quando || null,
        titulo: titulo || null,
        responsavelId: responsavelId || null,
      }),
    });
    const json = await resposta.json().catch(() => ({}));
    setOcupado(false);
    if (!resposta.ok) {
      setErro(json.erro ?? "Nao consegui gravar.");
      return;
    }
    if (acao === "ACEITAR") {
      setAviso(
        json.aceite?.prazoId
          ? "Na agenda, e o prazo fatal na tela de Prazos."
          : "Na agenda.",
      );
    }
    router.refresh();
  }

  async function marcar(campos: { lida?: boolean; arquivada?: boolean }) {
    setOcupado(true);
    await fetch("/api/publicacoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: publicacao.id, ...campos }),
    });
    setOcupado(false);
    router.refresh();
  }

  return (
    <li
      className={`rounded border p-4 ${
        publicacao.urgente ? "border-red-300 bg-red-50/40" : "border-slate-200"
      } ${publicacao.lida ? "opacity-70" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {publicacao.urgente ? (
          <span className="rounded bg-red-100 px-2 py-0.5 font-semibold text-red-800">
            urgente
          </span>
        ) : null}
        {publicacao.repeticao === "REPETIDA" ? (
          <span className="rounded bg-slate-200 px-2 py-0.5 font-semibold text-slate-700">
            repeticao de outra ja na lista
          </span>
        ) : null}
        {publicacao.repeticao === "PARECE_REPETIDA" ? (
          <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
            parece repeticao — confira antes de descartar
          </span>
        ) : null}
        {publicacao.lida ? (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">
            lida
          </span>
        ) : null}
        <span className="text-slate-500">{publicacao.data}</span>
        {publicacao.oab ? (
          <span className="text-slate-500">· OAB {publicacao.oab}</span>
        ) : null}
      </div>

      <p className="mt-2 font-semibold">
        {publicacao.numeroFormatado ?? "Sem numero de processo"}
        {publicacao.numeroFormatado && !publicacao.temProcesso ? (
          <span className="ml-2 text-xs font-normal text-amber-700">
            processo nao cadastrado
          </span>
        ) : null}
      </p>
      <p className="text-sm text-slate-500">
        {[publicacao.tribunal, publicacao.orgao, publicacao.tipoComunicacao]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {/*
        O TEXTO E O QUE IMPORTA NESTA TELA, e por isso ele tem tratamento de
        texto para ler, e nao de rodape: fundo proprio, linha solta e largura
        inteira do cartao. Fechado mostra seis linhas — o bastante para saber
        do que se trata sem abrir —, e o cartao inteiro abre no clique, porque
        um botao escondido entre outros cinco e um botao que ninguem acha.
      */}
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
        className="mt-3 block w-full text-left"
      >
        <span
          className={`block whitespace-pre-wrap rounded bg-slate-50 p-4 text-[15px] leading-7 text-slate-800 ${
            aberta ? "" : "line-clamp-6"
          }`}
        >
          {publicacao.texto}
        </span>
        <span className="mt-1 block text-xs font-semibold text-marca">
          {aberta ? "clique para recolher" : "clique para ler a publicacao inteira"}
        </span>
      </button>

      {t && !t.recusada ? (
        <div
          className={`mt-3 rounded border p-3 ${
            t.aceita ? "border-emerald-300 bg-emerald-50" : "border-marca/40 bg-white"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-marca px-2 py-0.5 text-xs font-semibold text-white">
              {ROTULO_DA_ESPECIE[t.especie] ?? t.especie}
            </span>
            <span className="text-sm font-semibold">{t.titulo}</span>
            <span className="text-xs text-slate-500">
              como {ROTULO_DO_TIPO[t.tipo] ?? t.tipo.toLowerCase()}
            </span>
            <span
              className={`text-xs ${
                t.confianca === "BAIXA" ? "text-amber-700" : "text-slate-500"
              }`}
            >
              confianca {t.confianca.toLowerCase()}
            </span>
          </div>

          {t.resumo ? <p className="mt-2 text-sm">{t.resumo}</p> : null}

          {t.prazoFatal ? (
            <p className="mt-2 text-sm">
              <span className="font-semibold text-red-700">
                Prazo fatal: {t.prazoFatal}
              </span>
              <span className="text-slate-600">
                {" "}
                — a sugestao abaixo vem tres dias uteis antes.
              </span>
            </p>
          ) : null}
          {t.explicacao ? (
            <p className="mt-1 text-xs text-slate-500">{t.explicacao}</p>
          ) : null}
          {t.atencao ? (
            <p className="mt-1 text-xs font-semibold text-amber-800">{t.atencao}</p>
          ) : null}

          {t.aceita ? (
            <p className="mt-2 text-sm font-semibold text-emerald-800">
              Ja esta na agenda.
            </p>
          ) : (
            <>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div>
                  <label className="rotulo" htmlFor={`quando-${t.id}`}>
                    Quando
                  </label>
                  <input
                    id={`quando-${t.id}`}
                    type="datetime-local"
                    className="campo"
                    value={quando}
                    onChange={(e) => setQuando(e.target.value)}
                  />
                </div>
                <div>
                  <label className="rotulo" htmlFor={`titulo-${t.id}`}>
                    Titulo
                  </label>
                  <input
                    id={`titulo-${t.id}`}
                    className="campo"
                    maxLength={200}
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                  />
                </div>
                <div>
                  <label className="rotulo" htmlFor={`resp-${t.id}`}>
                    Responsavel
                  </label>
                  <select
                    id={`resp-${t.id}`}
                    className="campo"
                    value={responsavelId}
                    onChange={(e) => setResponsavelId(e.target.value)}
                  >
                    <option value="">Sem responsavel</option>
                    {equipe.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => decidir("ACEITAR")}
                  className="botao-principal disabled:opacity-50"
                >
                  {ocupado ? "..." : `Lancar na agenda`}
                </button>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => decidir("RECUSAR")}
                  className="botao-discreto disabled:opacity-50"
                >
                  nao e nada disso
                </button>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={triarDeNovo}
                  className="botao-discreto disabled:opacity-50"
                >
                  ler de novo
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {t?.recusada ? (
        <p className="mt-3 text-xs text-slate-500">
          Sugestao recusada.{" "}
          <button type="button" className="botao-discreto" onClick={triarDeNovo}>
            ler de novo
          </button>
        </p>
      ) : null}

      {!t ? (
        <p className="mt-3 text-xs text-slate-500">
          Sem sugestao ainda — a triagem roda de madrugada, com a captura.{" "}
          <button type="button" className="botao-discreto" onClick={triarDeNovo}>
            triar agora
          </button>
        </p>
      ) : null}

      {analise ? (
        <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Leitura da IA · rascunho, confira nos autos
          </p>
          <p className="mt-2 whitespace-pre-line">{analise}</p>
        </div>
      ) : null}
      {erro ? <p className="mt-2 text-sm text-red-700">{erro}</p> : null}
      {aviso ? <p className="mt-2 text-sm text-emerald-700">{aviso}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        {publicacao.temIA && !analise ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={analisar}
            className="rounded border border-marca px-3 py-2 font-semibold text-marca disabled:opacity-60"
          >
            {ocupado ? "Lendo..." : "Leitura completa com IA"}
          </button>
        ) : null}
        {!publicacao.lida ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => marcar({ lida: true })}
            className="rounded border border-slate-300 px-3 py-2 font-semibold disabled:opacity-60"
          >
            Marcar como lida
          </button>
        ) : null}
        <button
          type="button"
          disabled={ocupado}
          onClick={() => marcar({ arquivada: true })}
          className="rounded border border-slate-300 px-3 py-2 text-slate-700 disabled:opacity-60"
        >
          Arquivar
        </button>
        {publicacao.link ? (
          <a
            href={publicacao.link}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-slate-300 px-3 py-2 text-marca"
          >
            Abrir no diario
          </a>
        ) : null}
      </div>
    </li>
  );
}
