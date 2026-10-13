"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  MINIMO_DA_TRANSCRICAO,
  type Situacao,
  type Urgencia,
} from "@/lib/entrevista";
import { GravadorDeFala } from "./GravadorDeFala";
import { EnvioDeAudio } from "./EnvioDeAudio";
import { GravadorOpenAI } from "./GravadorOpenAI";
import { DocumentosDaEntrevista, type ModeloEmUso } from "./DocumentosDaEntrevista";

export type EntrevistaNaTela = {
  id: string;
  nome: string;
  assunto: string;
  telefone: string | null;
  situacao: Situacao;
  rotuloDaSituacao: string;
  urgencia: Urgencia | null;
  rotuloDaUrgencia: string | null;
  temCliente: boolean;
  clienteId: string | null;
  tipoAcao: string;
  tipo: "TRIAGEM" | "TESTEMUNHA" | "COLETA";
  rotuloDoTipo: string;
  numeroProcesso: string | null;
  anotacoes: string;
  encerrada: boolean;
  minutaPrompt: string | null;
  roteiro: string[];
  transcricao: string;
  analise: Record<string, unknown> | null;
  criadaEmBR: string;
};

const COR_DA_URGENCIA: Record<Urgencia, string> = {
  BAIXA: "bg-slate-100 text-slate-600",
  MEDIA: "bg-sky-100 text-sky-800",
  ALTA: "bg-amber-100 text-amber-900",
  URGENTE: "bg-red-100 text-red-900",
};

function Lista({ titulo, itens }: { titulo: string; itens: unknown }) {
  const valores = Array.isArray(itens)
    ? itens.filter((i): i is string => typeof i === "string" && i.trim() !== "")
    : [];
  if (valores.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {titulo}
      </p>
      <ul className="mt-1 grid gap-1 text-sm text-slate-700">
        {valores.map((valor, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-slate-500">·</span>
            <span>{valor}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A tela da entrevista.
 *
 * A ordem na tela e a ordem da conversa: primeiro o roteiro, que se usa
 * ANTES; depois a anotacao, durante; depois a organizacao, depois. Mostrar
 * tudo aberto de uma vez faria o advogado procurar o que precisa agora.
 *
 * A anotacao fica SEMPRE visivel junto da analise, nunca escondida atras
 * dela: a organizacao e apoio e pode estar errada, e sem o texto original
 * ninguem consegue conferir.
 */
export function PainelEntrevistas({
  entrevistas,
  temIA,
  clientes = [],
  podeMinuta = false,
  modelos = [],
  temWhatsapp = false,
}: {
  entrevistas: EntrevistaNaTela[];
  temIA: boolean;
  clientes?: { id: string; nome: string }[];
  /** Qual modelo de cada documento esta fixado: o do escritorio ou o do sistema. */
  modelos?: ModeloEmUso[];
  /** Modulo de WhatsApp: libera mandar o PDF das perguntas direto ao entrevistado. */
  temWhatsapp?: boolean;
  /** Advogado ou administrador: libera o texto da peticao inicial. */
  podeMinuta?: boolean;
}) {
  const router = useRouter();
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [assunto, setAssunto] = useState("");
  const [tipoNovo, setTipoNovo] = useState<"TRIAGEM" | "TESTEMUNHA" | "COLETA">("TRIAGEM");
  const [processoNovo, setProcessoNovo] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [tipos, setTipos] = useState<Record<string, string>>({});
  const [origens, setOrigens] = useState<Record<string, "LOCAL" | "NUVEM">>({});
  /** Entrevista gravando pela OpenAI: o texto chega do servidor, o campo fica so de leitura. */
  const [gravandoIA, setGravandoIA] = useState<Record<string, boolean>>({});
  /** O que a leitura da procuracao achou, para mostrar ao lado do roteiro. */
  const [lidoDaProcuracao, setLidoDaProcuracao] = useState<Record<string, string>>({});
  const [enviadoPorZap, setEnviadoPorZap] = useState<Record<string, string>>({});

  async function mandarPerguntas(id: string) {
    setOcupado(`${id}:zap`);
    setErro(null);
    try {
      const r = await fetch(`/api/entrevistas/${id}/perguntas-whatsapp`, { method: "POST" });
      const dados = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(dados.erro ?? "Nao consegui mandar pelo WhatsApp.");
      setEnviadoPorZap((z) => ({ ...z, [id]: `Enviado pelo WhatsApp para ${dados.telefone}.` }));
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function lerProcuracao(id: string, arquivo: File) {
    setOcupado(`${id}:procuracao`);
    setErro(null);
    try {
      const corpo = new FormData();
      corpo.append("procuracao", arquivo);
      const r = await fetch(`/api/entrevistas/${id}/procuracao`, { method: "POST", body: corpo });
      const dados = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(dados.erro ?? "Nao consegui ler a procuracao.");
      setTipos((t) => ({ ...t, [id]: dados.tipoAcao ?? t[id] ?? "" }));
      setLidoDaProcuracao((l) => ({
        ...l,
        [id]: [
          dados.tipoAcao ? `Tipo de acao na procuracao: ${dados.tipoAcao}.` : null,
          dados.outorgante ? `Outorgante: ${dados.outorgante}.` : null,
          dados.observacao ?? null,
        ]
          .filter(Boolean)
          .join(" "),
      }));
      router.refresh();
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setOcupado(null);
    }
  }
  const [minuta, setMinuta] = useState<Record<string, { prompt: string | null; faltando: string[] }>>({});
  const [observacoes, setObservacoes] = useState<Record<string, string>>({});
  const [copiado, setCopiado] = useState<string | null>(null);

  async function pedirMinuta(id: string, ignorarPendencias = false) {
    setOcupado(`${id}:minuta`);
    setErro(null);
    try {
      const r = await chamar(`/api/entrevistas/${id}/minuta`, "POST", {
        observacoes: observacoes[id] ?? "",
        ignorarPendencias,
      });
      setMinuta((m) => ({ ...m, [id]: r }));
      if (r.prompt) router.refresh();
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setOcupado(null);
    }
  }

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

  async function nova(evento: React.FormEvent) {
    evento.preventDefault();
    setOcupado("nova");
    try {
      await chamar("/api/entrevistas", "POST", {
        nome,
        assunto,
        telefone: telefone || null,
        tipo: tipoNovo,
        numeroProcesso: processoNovo.trim() || null,
      });
      setNome("");
      setTelefone("");
      setAssunto("");
      setProcessoNovo("");
      setTipoNovo("TRIAGEM");
      setCriando(false);
      router.refresh();
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function acao(id: string, caminho: string, metodo: string, corpo?: unknown) {
    setOcupado(`${id}:${caminho}`);
    try {
      await chamar(`/api/entrevistas/${id}${caminho ? `/${caminho}` : ""}`, metodo, corpo);
      router.refresh();
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="mt-6 grid gap-4">
      {erro ? (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {erro}
        </p>
      ) : null}

      {criando ? (
        <form
          onSubmit={nova}
          className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-slate-600">Tipo de entrevista</span>
              <select
                value={tipoNovo}
                onChange={(e) => setTipoNovo(e.target.value as typeof tipoNovo)}
                className="rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="TRIAGEM">Triagem (primeiro atendimento)</option>
                <option value="TESTEMUNHA">Oitiva de testemunha</option>
                <option value="COLETA">Coleta de informacoes para documento</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-slate-600">Processo (opcional)</span>
              <input
                value={processoNovo}
                onChange={(e) => setProcessoNovo(e.target.value)}
                placeholder="0000000-00.0000.0.00.0000"
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-slate-600">
                {tipoNovo === "TESTEMUNHA" ? "Nome da testemunha" : "Quem sera ouvido"}
              </span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                minLength={2}
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-slate-600">Telefone (opcional)</span>
              <input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-600">
              {tipoNovo === "TRIAGEM"
                ? "Assunto, nas palavras de quem procurou"
                : tipoNovo === "TESTEMUNHA"
                  ? "Sobre o que a testemunha vai ser ouvida"
                  : "Que documento vai sair e sobre o que"}
            </span>
            <textarea
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              required
              minLength={10}
              rows={2}
              placeholder="Foi mandado embora sem receber as verbas e quer entrar na justica"
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={ocupado === "nova"}
              className="botao-principal"
            >
              {ocupado === "nova" ? "Abrindo..." : "Abrir entrevista"}
            </button>
            <button
              type="button"
              onClick={() => setCriando(false)}
              className="botao-secundario"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="botao-principal"
          >
            Nova entrevista
          </button>
        </div>
      )}

      {entrevistas.length === 0 && !criando ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          Nenhuma entrevista ainda. Abra uma antes da conversa: o sistema
          sugere o roteiro de perguntas, voce anota o que foi dito, e depois
          organiza em fatos, documentos e pontos a verificar.
        </p>
      ) : null}

      {entrevistas.map((e) => {
        const expandida = aberta === e.id;
        const texto = rascunho[e.id] ?? e.transcricao;
        const anotacoes = notas[e.id] ?? e.anotacoes;
        const mudou = texto !== e.transcricao || anotacoes !== e.anotacoes;
        const curta = texto.trim().length < MINIMO_DA_TRANSCRICAO;
        const textoDaMinuta = minuta[e.id]?.prompt ?? e.minutaPrompt;
        return (
          <article
            key={e.id}
            className="rounded-xl border border-slate-200 bg-white"
          >
            <button
              type="button"
              onClick={() => setAberta(expandida ? null : e.id)}
              className="flex w-full items-start gap-3 p-4 text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{e.nome}</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">
                  {e.assunto}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                    {e.rotuloDoTipo}
                  </span>
                  {e.numeroProcesso ? `Processo ${e.numeroProcesso} · ` : ""}
                  {e.criadaEmBR} · {e.rotuloDaSituacao}
                  {e.temCliente ? " · ja e cliente" : ""}
                  {e.encerrada ? " · encerrada" : ""}
                </p>
              </div>
              {e.urgencia ? (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${COR_DA_URGENCIA[e.urgencia]}`}
                >
                  {e.rotuloDaUrgencia}
                </span>
              ) : null}
            </button>

            {expandida ? (
              <div className="grid gap-4 border-t border-slate-100 p-4">
                {/* 1. Antes da conversa */}
                <section className="grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Roteiro de perguntas
                    </p>
                    <input
                      value={tipos[e.id] ?? e.tipoAcao}
                      onChange={(ev) => setTipos((t) => ({ ...t, [e.id]: ev.target.value }))}
                      placeholder="Tipo de acao (ex.: despejo por falta de pagamento)"
                      aria-label="Tipo de acao"
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => acao(e.id, "roteiro", "POST", { tipoAcao: tipos[e.id] ?? e.tipoAcao })}
                      disabled={ocupado === `${e.id}:roteiro`}
                      className="botao-secundario text-xs"
                    >
                      {ocupado === `${e.id}:roteiro`
                        ? "Montando..."
                        : e.roteiro.length > 0
                          ? "Sugerir de novo"
                          : "Sugerir roteiro"}
                    </button>
                  </div>
                  {temIA && e.tipo === "TRIAGEM" ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
                      <label className="botao-secundario cursor-pointer text-xs">
                        {ocupado === `${e.id}:procuracao` ? "Lendo a procuracao..." : "Gerar perguntas lendo a procuracao"}
                        <input
                          type="file"
                          accept="application/pdf,image/jpeg,image/png,image/webp"
                          className="sr-only"
                          disabled={ocupado === `${e.id}:procuracao`}
                          onChange={(ev) => {
                            const f = ev.target.files?.[0];
                            ev.target.value = "";
                            if (f) void lerProcuracao(e.id, f);
                          }}
                        />
                      </label>
                      <span className="text-slate-600">
                        PDF ou foto da procuracao: o sistema le o tipo de acao e sugere as perguntas da triagem.
                      </span>
                    </div>
                  ) : null}
                  {lidoDaProcuracao[e.id] ? (
                    <p className="text-xs text-emerald-800">{lidoDaProcuracao[e.id]}</p>
                  ) : null}
                  {e.roteiro.length > 0 ? (
                    <ol className="grid gap-1 text-sm text-slate-700">
                      {e.roteiro.map((pergunta, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="w-5 shrink-0 text-right text-slate-500">
                            {i + 1}.
                          </span>
                          <span>{pergunta}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-slate-500">
                      {e.tipo === "TESTEMUNHA"
                        ? "Perguntas abertas e neutras para a testemunha: o que viu, quando, onde e como conhece as partes."
                        : e.tipo === "COLETA"
                          ? "Perguntas para reunir o que o documento precisa: fatos, datas, valores e o que comprova cada um."
                          : "Apoio para nao sair da sala sem a data, o documento e a testemunha. Voce pergunta o que quiser, na ordem que a conversa pedir."}
                    </p>
                  )}
                  {e.roteiro.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`/api/entrevistas/${e.id}/perguntas-pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="botao-secundario text-xs"
                      >
                        PDF das perguntas para o cliente
                      </a>
                      {temWhatsapp ? (
                        <button
                          type="button"
                          onClick={() => mandarPerguntas(e.id)}
                          disabled={ocupado === `${e.id}:zap`}
                          className="botao-secundario text-xs disabled:opacity-50"
                        >
                          {ocupado === `${e.id}:zap` ? "Enviando..." : "Enviar pelo WhatsApp"}
                        </button>
                      ) : null}
                      {enviadoPorZap[e.id] ? (
                        <span className="text-xs text-emerald-800">{enviadoPorZap[e.id]}</span>
                      ) : null}
                      <span className="text-xs text-slate-500">
                        Para o cliente responder gravando em casa e mandar o audio: ele entra aqui por
                        &quot;Importar audio gravado&quot; e e transcrito.
                      </span>
                    </div>
                  ) : null}
                  {e.numeroProcesso ? (
                    <p className="text-xs text-slate-500">
                      As perguntas levam em conta o tipo de acao e o processo {e.numeroProcesso}: classe, partes e ultimo andamento.
                    </p>
                  ) : null}
                </section>

                {/* 2. Durante — e depois, para conferir a organizacao */}
                <section className="grid gap-2 border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    O que foi dito
                  </p>
                  {/* Como no sistema da Advocacia Roma: o audio vira texto pela
                      OpenAI — gravado aqui mesmo, na hora, ou importado do
                      celular. O reconhecimento do navegador fica como
                      alternativa, para quem nao quer o audio saindo. */}
                  {temIA ? (
                    <>
                      <GravadorOpenAI
                        entrevistaId={e.id}
                        podeGravar={!mudou || Boolean(gravandoIA[e.id])}
                        motivoBloqueio="Salve a anotacao antes de gravar: a transcricao entra no texto salvo."
                        onTexto={(novo) => setRascunho((r) => ({ ...r, [e.id]: novo }))}
                        onGravando={(sim) => {
                          setGravandoIA((g) => ({ ...g, [e.id]: sim }));
                          if (!sim) {
                            // O texto ja esta salvo no servidor: le de la.
                            setRascunho((r) => {
                              const { [e.id]: _fora, ...resto } = r;
                              return resto;
                            });
                            router.refresh();
                          }
                        }}
                        onErro={setErro}
                      />
                      <EnvioDeAudio
                        entrevistaId={e.id}
                        onTranscrito={() => {
                          setRascunho((r) => {
                            const { [e.id]: _fora, ...resto } = r;
                            return resto;
                          });
                          router.refresh();
                        }}
                        onErro={setErro}
                      />
                      <details className="rounded-lg border border-slate-200 p-3">
                        <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                          Preferir transcrever pelo navegador, sem enviar o audio para a OpenAI
                        </summary>
                        <div className="mt-3">
                          <GravadorDeFala
                            texto={texto}
                            onTexto={(novo) => setRascunho((r) => ({ ...r, [e.id]: novo }))}
                            onOrigem={(origem) => setOrigens((o) => ({ ...o, [e.id]: origem }))}
                          />
                        </div>
                      </details>
                    </>
                  ) : (
                    <GravadorDeFala
                      texto={texto}
                      onTexto={(novo) => setRascunho((r) => ({ ...r, [e.id]: novo }))}
                      onOrigem={(origem) => setOrigens((o) => ({ ...o, [e.id]: origem }))}
                    />
                  )}
                  <textarea
                    value={texto}
                    readOnly={Boolean(gravandoIA[e.id])}
                    onChange={(ev) =>
                      setRascunho((r) => ({ ...r, [e.id]: ev.target.value }))
                    }
                    rows={10}
                    placeholder="Anote durante a conversa, com as palavras da pessoa — ou use a transcricao acima."
                    className="w-full rounded-lg border border-slate-300 p-3 text-sm leading-6"
                  />
                  <label className="grid gap-1 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Anotacoes do advogado (a parte da fala)
                    </span>
                    <textarea
                      value={anotacoes}
                      onChange={(ev) => setNotas((n) => ({ ...n, [e.id]: ev.target.value }))}
                      rows={4}
                      placeholder="Impressoes, estrategia, o que conferir — nao entra como fala do cliente."
                      className="w-full rounded-lg border border-slate-300 p-3 text-sm leading-6"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        acao(e.id, "anotacao", "PUT", {
                          transcricao: texto,
                          anotacoes,
                          origem: origens[e.id] ?? null,
                        })
                      }
                      disabled={ocupado === `${e.id}:anotacao` || !mudou}
                      className="botao-secundario text-xs"
                    >
                      {ocupado === `${e.id}:anotacao` ? "Salvando..." : "Salvar anotacao"}
                    </button>
                    {temIA ? (
                      <button
                        type="button"
                        onClick={() => acao(e.id, "organizar", "POST")}
                        disabled={ocupado === `${e.id}:organizar` || curta || mudou}
                        className="botao-principal text-xs"
                      >
                        {ocupado === `${e.id}:organizar`
                          ? "Organizando..."
                          : "Organizar em topicos"}
                      </button>
                    ) : null}
                    {curta ? (
                      <span className="text-xs text-slate-500">
                        Faltam {MINIMO_DA_TRANSCRICAO - texto.trim().length}{" "}
                        caracteres para dar pra organizar.
                      </span>
                    ) : mudou ? (
                      <span className="text-xs text-slate-500">
                        Salve a anotacao antes de organizar.
                      </span>
                    ) : null}
                  </div>
                </section>

                {/* 3. Depois */}
                {e.analise ? (
                  <section className="grid gap-3 border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Organizado pela IA — confira contra o que foi dito
                    </p>
                    {typeof e.analise.area === "string" ? (
                      <p className="text-sm text-slate-700">
                        <span className="font-medium">Area:</span>{" "}
                        {e.analise.area}
                      </p>
                    ) : null}
                    {typeof e.analise.resumo === "string" ? (
                      <p className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-800">
                        {e.analise.resumo}
                      </p>
                    ) : null}
                    <Lista titulo="Fatos" itens={e.analise.fatos} />
                    <Lista titulo="O que a pessoa quer" itens={e.analise.pretensoes} />
                    <Lista
                      titulo="Documentos que ela tem"
                      itens={e.analise.documentosCitados}
                    />
                    <Lista
                      titulo="Documentos a pedir"
                      itens={e.analise.documentosQueFaltam}
                    />
                    <Lista titulo="Testemunhas" itens={e.analise.testemunhas} />
                    <Lista
                      titulo="A verificar"
                      itens={e.analise.pontosDeAtencao}
                    />
                    <Lista
                      titulo="Perguntar na proxima"
                      itens={e.analise.perguntasEmAberto}
                    />
                    {typeof e.analise.valorEnvolvido === "string" ? (
                      <p className="text-sm text-slate-700">
                        <span className="font-medium">Valor mencionado:</span>{" "}
                        {e.analise.valorEnvolvido}
                      </p>
                    ) : null}
                    <p className="text-xs text-slate-500">
                      Apoio de triagem. Nao e parecer, nao indica artigo de lei
                      e nunca afirma que um prazo prescreveu — o que depende
                      disso aparece em &quot;a verificar&quot;.
                    </p>
                  </section>
                ) : null}

                {/* 4. Fechamento: cliente, encerrar, PDF, documentos do cliente e texto da inicial */}
                <section className="grid gap-3 border-t border-slate-100 pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {!e.temCliente ? (
                      <select
                        defaultValue=""
                        aria-label="Ligar ao cliente"
                        onChange={(ev) => ev.target.value && acao(e.id, "cliente", "PUT", { clienteId: ev.target.value })}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                      >
                        <option value="">Ligar ao cliente...</option>
                        {clientes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => acao(e.id, "encerrar", "POST", e.encerrada ? { reabrir: true } : {})}
                      disabled={ocupado === `${e.id}:encerrar`}
                      className="botao-secundario text-xs"
                    >
                      {e.encerrada ? "Reabrir entrevista" : "Encerrar entrevista"}
                    </button>
                    <a href={`/api/entrevistas/${e.id}/pdf`} target="_blank" rel="noreferrer" className="botao-secundario text-xs">
                      PDF da transcricao
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm(
                            `Excluir a entrevista de ${e.nome}? A transcricao, as anotacoes e a organizacao somem de vez. Se quiser guardar, gere o PDF antes.`,
                          )
                        )
                          void acao(e.id, "", "DELETE");
                      }}
                      disabled={ocupado === `${e.id}:` || Boolean(gravandoIA[e.id])}
                      className="botao-secundario text-xs text-red-700"
                    >
                      Excluir entrevista
                    </button>
                  </div>

                  {e.tipo === "TRIAGEM" && e.clienteId && modelos.length > 0 ? (
                    <DocumentosDaEntrevista clienteId={e.clienteId} modelos={modelos} />
                  ) : null}

                  {e.tipo !== "TRIAGEM" ? null : podeMinuta && e.encerrada && e.analise && e.temCliente ? (
                    <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Texto para a peticao inicial
                      </p>
                      <textarea
                        value={observacoes[e.id] ?? ""}
                        onChange={(ev) => setObservacoes((o) => ({ ...o, [e.id]: ev.target.value }))}
                        rows={2}
                        placeholder="Orientacoes suas para a peca (opcional): tese, pedido, tom."
                        className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => pedirMinuta(e.id)}
                          disabled={ocupado === `${e.id}:minuta`}
                          className="botao-principal text-xs"
                        >
                          {ocupado === `${e.id}:minuta` ? "Montando..." : textoDaMinuta ? "Montar de novo" : "Montar o texto"}
                        </button>
                      </div>
                      {minuta[e.id] && !minuta[e.id].prompt && minuta[e.id].faltando.length > 0 ? (
                        <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                          Cadastro do cliente incompleto: {minuta[e.id].faltando.join(", ")}. Complete na ficha do cliente,
                          ou{" "}
                          <button type="button" className="font-semibold underline" onClick={() => pedirMinuta(e.id, true)}>
                            montar mesmo assim, com [PREENCHER]
                          </button>
                          .
                        </div>
                      ) : null}
                      {textoDaMinuta ? (
                        <>
                          <textarea readOnly value={textoDaMinuta} rows={10} className="w-full rounded-lg border border-slate-300 p-2 font-mono text-xs" />
                          <div>
                            <button
                              type="button"
                              className="botao-secundario text-xs"
                              onClick={() => {
                                void navigator.clipboard?.writeText(textoDaMinuta);
                                setCopiado(e.id);
                              }}
                            >
                              {copiado === e.id ? "Copiado" : "Copiar"}
                            </button>
                            <span className="ml-2 text-xs text-slate-500">
                              Cole no seu assistente de redacao. Lacuna vem marcada com [PREENCHER] — nada e inventado.
                            </span>
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : podeMinuta && e.analise ? (
                    <p className="text-xs text-slate-500">
                      Para montar o texto da peticao inicial: {[!e.temCliente ? "ligue ao cliente" : null, !e.encerrada ? "encerre a entrevista" : null].filter(Boolean).join(" e ")}.
                    </p>
                  ) : null}
                </section>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
