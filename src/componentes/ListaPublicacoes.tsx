"use client";

import { useEffect, useRef, useState } from "react";
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
  /** Aceita como tarefa (peca, recurso) e nao como compromisso da agenda. */
  aceitaComoTarefa: boolean;
  recusada: boolean;
};

export type PublicacaoNaTela = {
  temIA: boolean;
  id: string;
  numeroProcesso: string | null;
  numeroFormatado: string | null;
  temProcesso: boolean;
  /** Parece segredo de justica: o processo nao foi cadastrado sozinho. */
  segredo: boolean;
  /** Partes intimadas, como o DJEN informa. */
  partes: string[];
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
  clientes = [],
}: {
  publicacoes: PublicacaoNaTela[];
  equipe?: PessoaDaEquipe[];
  clientes?: { id: string; nome: string }[];
}) {
  if (publicacoes.length === 0) {
    return (
      <p className="mt-6 text-slate-600">
        Nenhuma publicação em aberto. As capturas rodam de madrugada, por OAB
        monitorada.
      </p>
    );
  }

  return (
    <ul className="mt-6 grid gap-4">
      {publicacoes.map((publicacao, i) => (
        <Cartao
          key={publicacao.id}
          publicacao={publicacao}
          equipe={equipe}
          clientes={clientes}
          posicao={i}
        />
      ))}
    </ul>
  );
}

const ROTULO_DA_ESPECIE: Record<string, string> = {
  AGENDAMENTO: "Agenda",
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
  clientes,
  posicao,
}: {
  publicacao: PublicacaoNaTela;
  equipe: PessoaDaEquipe[];
  clientes: { id: string; nome: string }[];
  /** Posicao na lista, para escalonar a leitura automatica. */
  posicao: number;
}) {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const t = publicacao.triagem;
  // Peca, manifestacao, recurso: vira TAREFA. Audiencia, pericia: AGENDA.
  const ehTarefa = t ? t.especie === "TAREFA" || t.tipo === "TAREFA" : false;
  const [quando, setQuando] = useState(
    paraCampo(t?.dataDoAto ?? t?.prazoSugerido ?? null),
  );
  const [titulo, setTitulo] = useState(t?.titulo ?? "");
  const [responsavelId, setResponsavelId] = useState("");

  /**
   * Publicacao sem leitura le a si mesma, uma vez.
   *
   * Nao e para substituir a rotina da captura — e para a publicacao que
   * entrou ANTES de a triagem existir, e para o caso raro de a rotina ter
   * falhado naquela linha. Sem isto, a unica saida era esperar as 3h da
   * manha, e quem abre a tela hoje nao tem o que fazer com a publicacao.
   *
   * `pedido` guarda que ja pediu: o React monta o componente duas vezes em
   * desenvolvimento, e sem a trava a mesma publicacao seria lida em dobro —
   * duas chamadas pagas para o mesmo resultado.
   */
  const pedido = useRef(false);
  useEffect(() => {
    if (publicacao.triagem || pedido.current || !publicacao.temIA) return;
    pedido.current = true;
    setLendo(true);
    // Escalonado pela posicao na lista: vinte publicacoes sem leitura nao
    // podem virar vinte chamadas no mesmo segundo.
    const relogio = setTimeout(
      () => {
        void (async () => {
          try {
            const r = await fetch(`/api/publicacoes/${publicacao.id}/triagem`, {
              method: "POST",
            });
            if (r.ok) router.refresh();
          } finally {
            setLendo(false);
          }
        })();
      },
      400 + posicao * 1200,
    );
    return () => clearTimeout(relogio);
    // Roda uma vez por publicacao, e o `pedido` e quem garante isso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function triarDeNovo() {
    setOcupado(true);
    setErro(null);
    const resposta = await fetch(`/api/publicacoes/${publicacao.id}/triagem`, {
      method: "POST",
    });
    const json = await resposta.json().catch(() => ({}));
    setOcupado(false);
    if (!resposta.ok) {
      setErro(json.erro ?? "Não consegui triar.");
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
      setErro(json.erro ?? "Não consegui gravar.");
      return;
    }
    if (acao === "ACEITAR") {
      setAviso(
        json.aceite?.tarefaId
          ? "Tarefa criada, com a entrega e o prazo fatal. Está em Tarefas."
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
            repetição de outra já na lista
          </span>
        ) : null}
        {publicacao.repeticao === "PARECE_REPETIDA" ? (
          <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
            parece repetição — confira antes de descartar
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
        {publicacao.numeroFormatado ?? "Sem número de processo"}
        {publicacao.numeroFormatado && !publicacao.temProcesso ? (
          <span className="ml-2 text-xs font-normal text-amber-700">
            {publicacao.segredo ? "segredo de justiça — cadastre o processo a mão" : "processo não cadastrado"}
          </span>
        ) : null}
      </p>
      {publicacao.numeroFormatado && !publicacao.temProcesso ? (
        <CadastrarProcesso publicacaoId={publicacao.id} clientes={clientes} partes={publicacao.partes} />
      ) : null}
      <p className="text-sm text-slate-500">
        {[publicacao.tribunal, publicacao.orgao, publicacao.tipoComunicacao]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {/*
        O TEXTO E O QUE IMPORTA NESTA TELA, e por isso ele tem tratamento de
        texto para ler, e não de rodapé: fundo próprio, linha solta e largura
        inteira do cartão. Fechado mostra seis linhas — o bastante para saber
        do que se trata sem abrir —, e o cartão inteiro abre no clique, porque
        um botão escondido entre outros cinco e um botão que ninguém acha.
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
          {aberta ? "clique para recolher" : "clique para ler a publicação inteira"}
        </span>
      </button>

      {t && !t.recusada ? (
        /*
          A SUGESTAO DA IA TEM COR PROPRIA (violeta), diferente do texto da
          publicação e dos botões do escritório. Quem olha precisa saber, sem
          ler, que aquilo foi a máquina que sugeriu — e que prazo e assunto
          se conferem nos autos antes de lançar.
        */
        <div
          className={`mt-3 rounded-md border-2 p-3 ${
            t.aceita ? "border-emerald-300 bg-emerald-50" : "border-violet-300 bg-violet-50"
          }`}
        >
          {!t.aceita ? (
            <p className="mb-2 flex flex-wrap items-center gap-2 border-b border-violet-200 pb-2 text-sm text-violet-900">
              <span className="rounded bg-violet-700 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                Sugestao da IA
              </span>
              <span className="font-semibold">
                Precisa de conferência: confira o prazo e o assunto nos autos antes de lançar.
              </span>
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold text-white ${
                ehTarefa ? "bg-indigo-700" : "bg-marca"
              }`}
            >
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
                — último dia, calculado pelo sistema a partir da publicação.
                A entrega sugerida vem três dias úteis antes, e o responsável
                é avisado 4 dias úteis antes, na véspera e no dia.
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
              {t.aceitaComoTarefa ? "Já está em Tarefas." : "Já está na agenda."}
            </p>
          ) : (
            <>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div>
                  <label className="rotulo" htmlFor={`quando-${t.id}`}>
                    {ehTarefa ? "Entrega (sugerida)" : "Data e hora"}
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
                    Título
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
                    Responsável
                  </label>
                  <select
                    id={`resp-${t.id}`}
                    className="campo"
                    value={responsavelId}
                    onChange={(e) => setResponsavelId(e.target.value)}
                  >
                    <option value="">
                      {ehTarefa ? "Fica comigo" : "Sem responsável"}
                    </option>
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
                  {ocupado ? "..." : ehTarefa ? "Conferi — criar tarefa" : "Conferi — lançar na agenda"}
                </button>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => decidir("RECUSAR")}
                  className="botao-discreto disabled:opacity-50"
                >
                  não é nada disso
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
          {lendo
            ? "Lendo a publicação..."
            : "Ainda sem leitura. A publicação é lida na captura; esta é de antes disso."}
        </p>
      ) : null}

      {erro ? <p className="mt-2 text-sm text-red-700">{erro}</p> : null}
      {aviso ? <p className="mt-2 text-sm text-emerald-700">{aviso}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
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
            Abrir no diário
          </a>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Cadastro do processo a partir da publicacao — o caminho do segredo de
 * justica, que o sistema nao cadastra sozinho, e de qualquer processo que
 * tenha ficado de fora.
 */
function CadastrarProcesso({
  publicacaoId,
  clientes,
  partes,
}: {
  publicacaoId: string;
  clientes: { id: string; nome: string }[];
  partes: string[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function cadastrar() {
    setOcupado(true);
    setErro(null);
    const r = await fetch(`/api/publicacoes/${publicacaoId}/processo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clienteId: clienteId || null }),
    });
    const json = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) return setErro(json.erro ?? "Não consegui cadastrar o processo.");
    router.refresh();
  }

  if (!aberto) {
    return (
      <button type="button" className="mt-1 text-xs font-semibold text-marca underline" onClick={() => setAberto(true)}>
        Cadastrar processo
      </button>
    );
  }
  return (
    <div className="mt-2 grid gap-2 rounded border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-[1fr_auto]">
      {partes.length > 0 ? (
        <p className="text-xs text-slate-600 sm:col-span-2">Partes intimadas: {partes.join("; ")}</p>
      ) : null}
      <select className="campo" value={clienteId} onChange={(e) => setClienteId(e.target.value)} aria-label="Cliente do processo">
        <option value="">Sem cliente por enquanto</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
      <button type="button" className="botao-principal" disabled={ocupado} onClick={cadastrar}>
        {ocupado ? "..." : "Cadastrar"}
      </button>
      {erro ? <p className="text-xs text-red-700 sm:col-span-2">{erro}</p> : null}
    </div>
  );
}
