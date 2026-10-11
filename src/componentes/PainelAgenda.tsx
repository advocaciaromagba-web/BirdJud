"use client";

import Link from "next/link";
import { rotuloDaEntrega } from "@/lib/entrega";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FormularioCriar, type Campo } from "./FormularioCriar";
import {
  ParticipantesDoCompromisso,
  type ParticipanteNaLista,
  type RespostaDoParticipante,
} from "./ParticipantesDoCompromisso";
import {
  AVISOS_MANUAIS,
  ROTULO_DO_AVISO_MANUAL,
  type AvisoManual,
} from "@/lib/avisos-manuais";
import {
  ROTULO_DO_ESTADO,
  ROTULO_DO_TIPO_DE_AVISO,
  TEXTO_DO_MOTIVO,
} from "@/lib/agenda-rotulos";
import {
  ROTULO_DO_TIPO,
  combina,
  statusDe,
  type CompromissoNaTela,
} from "@/lib/agenda-tela";

export type { CompromissoNaTela } from "@/lib/agenda-tela";

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

type Opcao = { valor: string; rotulo: string };

const ETIQUETA_DO_TIPO: Record<string, string> = {
  PRAZO: "etiqueta-erro",
  AUDIENCIA: "etiqueta-atencao",
  PERICIA: "etiqueta-atencao",
  TAREFA: "etiqueta-neutra",
  COMPROMISSO: "etiqueta-marca",
};

// Fuso fixo: o servidor roda em UTC e o navegador no fuso de quem olha. Sem
// isto a tabela sai do servidor com uma hora e o React a troca por outra.
const quando = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** O valor que o <input type="datetime-local"> entende. */
function paraCampo(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function resumoDasRespostas(respostas: RespostaDoParticipante[]): string | null {
  const confirmaram = respostas.filter((r) => r.confirmou).length;
  const recusaram = respostas.filter((r) => r.recusou).length;
  const partes = [];
  if (confirmaram) partes.push(`${confirmaram} confirmou`);
  if (recusaram) partes.push(`${recusaram} recusou`);
  return partes.length ? partes.join(" · ") : null;
}

type Excluido = {
  id: string;
  titulo: string;
  tipo: string;
  inicio: string;
  numeroProcesso: string | null;
  nomeDoCliente: string | null;
  nomeDoResponsavel: string | null;
  participantes: string[];
  motivo: string;
  nomeDeQuemExcluiu: string | null;
  excluidoEm: string;
};

type Notificacao = {
  id: string;
  canal: string;
  tipo: string;
  rotulo: string;
  destino: string;
  destinatario: string;
  assunto: string;
  estado: string;
  erro: string | null;
  criadoEm: string;
  enviadoEm: string | null;
  idNaMeta?: string | null;
  entregueEm?: string | null;
  lidoEm?: string | null;
  compromisso: {
    id: string;
    titulo: string;
    tipo: string;
    inicio: string;
    nomeDoResponsavel: string | null;
    nomeDoCliente: string | null;
  } | null;
};

type AvisoDoCompromisso = {
  id: string;
  canal: string;
  tipo: string;
  destino: string;
  estado: string;
  erro: string | null;
  enviadoEm: string | null;
  idNaMeta?: string | null;
  entregueEm?: string | null;
  lidoEm?: string | null;
  criadoEm: string;
};

/**
 * Se o WhatsApp chegou ao celular: "Enviado" so diz que a Meta aceitou.
 * Sem confirmacao leva para a tela onde se reenvia.
 */
function EntregaDoAviso({ a }: { a: { canal: string; estado: string; idNaMeta?: string | null; entregueEm?: string | null; lidoEm?: string | null } }) {
  const r = rotuloDaEntrega(a);
  if (a.estado === "FALHOU") {
    return (
      <Link href="/mensagens" className="mt-1 block whitespace-nowrap text-xs underline">
        o que fazer
      </Link>
    );
  }
  if (!r) return null;
  return r === "Sem confirmacao de entrega" ? (
    <Link href="/mensagens" className="mt-1 block whitespace-nowrap text-xs text-amber-700 underline">
      sem confirmacao
    </Link>
  ) : (
    <span className="mt-1 block whitespace-nowrap text-xs text-emerald-700">{r.toLowerCase()}</span>
  );
}

const COR_DO_ESTADO: Record<string, string> = {
  ENVIADO: "etiqueta-ok",
  PENDENTE: "etiqueta-neutra",
  FALHOU: "etiqueta-erro",
  CANCELADO: "etiqueta-neutra",
};

export function PainelAgenda({
  compromissos,
  equipe,
  clientes,
  processos,
  comWhatsapp,
  comIA,
}: {
  compromissos: CompromissoNaTela[];
  equipe: { id: string; nome: string; papel: string }[];
  clientes: { id: string; nome: string }[];
  processos: { id: string; numero: string }[];
  comWhatsapp: boolean;
  comIA: boolean;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState<"nada" | "novo" | "lendo" | "editando">("nada");
  const [editando, setEditando] = useState<CompromissoNaTela | null>(null);
  const [painel, setPainel] = useState<"nenhum" | "excluidos" | "notificacoes">("nenhum");
  const [verId, setVerId] = useState<string | null>(null);
  const [avisarDe, setAvisarDe] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tipo: "ok" | "erro" } | null>(null);

  const visiveis = useMemo(
    () => compromissos.filter((c) => combina(c, busca)),
    [compromissos, busca],
  );

  function falar(texto: string, tipo: "ok" | "erro" = "ok") {
    setAviso({ texto, tipo });
    setTimeout(() => setAviso(null), 10_000);
  }

  async function chamar(url: string, metodo: string, corpo?: unknown) {
    const r = await fetch(url, {
      method: metodo,
      headers: corpo ? { "content-type": "application/json" } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dados.erro ?? "Nao deu certo. Tente de novo.");
    return dados;
  }

  async function excluir(c: CompromissoNaTela) {
    if (
      !window.confirm(
        `Excluir "${c.titulo}" da agenda?\n\nO compromisso vai para a auditoria de excluidos. Os avisos ja enviados aos participantes nao sao desfeitos — se precisar, avise-os.`,
      )
    )
      return;
    setOcupado(c.id);
    try {
      const r = await chamar(`/api/compromissos/${c.id}`, "DELETE");
      falar(r.mensagem ?? "Compromisso excluido.");
      if (verId === c.id) setVerId(null);
      router.refresh();
    } catch (falha) {
      falar((falha as Error).message, "erro");
    } finally {
      setOcupado(null);
    }
  }

  async function avisar(c: CompromissoNaTela, qual: AvisoManual) {
    setAvisarDe(null);
    if (
      !window.confirm(
        `Enviar agora "${ROTULO_DO_AVISO_MANUAL[qual]}" de "${c.titulo}" para todos os participantes?`,
      )
    )
      return;
    setOcupado(c.id);
    try {
      const r = await chamar(`/api/compromissos/${c.id}/avisar`, "POST", { qual });
      falar(r.mensagem ?? "Enviado.", r.criados > 0 ? "ok" : "erro");
    } catch (falha) {
      falar((falha as Error).message, "erro");
    } finally {
      setOcupado(null);
    }
  }

  const campos: Campo[] = [
    { nome: "titulo", rotulo: "Titulo", obrigatorio: true, largo: true },
    { nome: "inicio", rotulo: "Data e hora", tipo: "datetime-local", obrigatorio: true },
    {
      nome: "tipo",
      rotulo: "Tipo",
      tipo: "select",
      opcoes: Object.entries(ROTULO_DO_TIPO).map(([valor, rotulo]) => ({ valor, rotulo })),
    },
    {
      nome: "responsavelId",
      rotulo: "Advogado(a) responsavel",
      tipo: "select",
      opcoes: [
        { valor: "", rotulo: "Sem responsavel (e do escritorio)" },
        ...equipe.map((p) => ({ valor: p.id, rotulo: `${p.nome} (${p.papel.toLowerCase()})` })),
      ],
      ajuda:
        "Quem fica com isto recebe o aviso na hora, por e-mail e por WhatsApp. Sem responsavel, aparece para todos.",
    },
    {
      nome: "clienteId",
      rotulo: "Cliente",
      tipo: "cliente",
      largo: true,
      opcoes: clientes.map((c) => ({ valor: c.id, rotulo: c.nome })),
      ajuda:
        "Obrigatorio na tarefa. No agendamento e opcional — a primeira reuniao pode ser com quem ainda nao e cliente. Quem mais vai (testemunha, perito, acompanhante) entra em Participantes, depois de gravar.",
    },
    {
      nome: "processoId",
      rotulo: "Numero do processo",
      tipo: "select",
      opcoes: processos.map((p) => ({ valor: p.id, rotulo: p.numero })),
      ajuda: "Opcional. Agendamento nao precisa de processo.",
    },
    { nome: "local", rotulo: "Forum, vara ou local do ato" },
    {
      nome: "link",
      rotulo: "Link da sala virtual (opcional)",
      ajuda:
        "Cole o link enviado pelo tribunal — Teams, Zoom, Webex — ou o Meet da reuniao. Vai no aviso ao participante junto com o endereco.",
    },
    { nome: "observacoes", rotulo: "Observacoes", tipo: "textarea" },
  ];

  const valoresDe = (c: CompromissoNaTela): Record<string, string> => ({
    titulo: c.titulo,
    inicio: paraCampo(c.inicioISO),
    tipo: c.tipo,
    responsavelId: c.responsavelId ?? "",
    clienteId: c.clienteId ?? "",
    processoId: c.processoId ?? "",
    local: c.local ?? "",
    link: c.link ?? "",
    observacoes: c.observacoes ?? "",
  });

  const fecharFormulario = () => {
    setModo("nada");
    setEditando(null);
  };

  return (
    <div className="mt-6 grid gap-4">
      {aviso ? (
        <p className={aviso.tipo === "ok" ? "aviso-ok" : "aviso-erro"}>{aviso.texto}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar compromisso, cliente, processo..."
          className="campo w-full max-w-xs"
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            className="botao-secundario"
            onClick={() => setPainel(painel === "excluidos" ? "nenhum" : "excluidos")}
          >
            {painel === "excluidos" ? "Fechar auditoria" : "Excluidos (auditoria)"}
          </button>
          <button
            type="button"
            className="botao-secundario"
            onClick={() => setPainel(painel === "notificacoes" ? "nenhum" : "notificacoes")}
          >
            {painel === "notificacoes" ? "Fechar notificacoes" : "Notificacoes enviadas"}
          </button>
          {comIA ? (
            <button
              type="button"
              className="botao-secundario"
              onClick={() => {
                setEditando(null);
                setModo(modo === "lendo" ? "nada" : "lendo");
              }}
            >
              {modo === "lendo" ? "Cancelar" : "Agendar lendo documento"}
            </button>
          ) : null}
          <button
            type="button"
            className="botao-principal"
            onClick={() => {
              setEditando(null);
              setModo(modo === "novo" ? "nada" : "novo");
            }}
          >
            {modo === "novo" ? "Cancelar" : "Novo compromisso"}
          </button>
        </div>
      </div>

      {painel === "excluidos" ? <ExcluidosDaAgenda aoFechar={() => setPainel("nenhum")} /> : null}
      {painel === "notificacoes" ? (
        <NotificacoesDaAgenda aoFechar={() => setPainel("nenhum")} />
      ) : null}

      {modo === "novo" || modo === "lendo" ? (
        <FormularioCriar
          key={modo}
          rota="/api/compromissos"
          textoBotao="Agendar"
          leitura={modo === "lendo" ? "AGENDA" : undefined}
          campos={campos}
          aoConcluir={fecharFormulario}
          aoCancelar={fecharFormulario}
        />
      ) : null}

      {modo === "editando" && editando ? (
        <FormularioCriar
          key={editando.id}
          rota={`/api/compromissos/${editando.id}`}
          metodo="PATCH"
          textoBotao="Salvar alteracoes"
          campos={campos}
          valoresIniciais={valoresDe(editando)}
          aoConcluir={() => {
            fecharFormulario();
            falar("Compromisso alterado. Se a data mudou, os lembretes serao refeitos para a data nova.");
          }}
          aoCancelar={fecharFormulario}
        />
      ) : null}

      <div className="cartao overflow-x-auto p-0">
        <table className="tabela">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Tipo</th>
              <th>Titulo</th>
              <th>Advogado(a)</th>
              <th>Cliente</th>
              <th>Sala</th>
              <th>Status</th>
              <th><span className="sr-only">Acoes</span></th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((c) => {
              const respostas = resumoDasRespostas(c.respostas);
              const nomes = c.nomesDosParticipantes.length
                ? c.nomesDosParticipantes.join(", ")
                : (c.nomeDoCliente ?? "—");
              return (
                <Fragment key={c.id}>
                  <tr>
                    <td className="whitespace-nowrap tabular-nums">
                      {quando.format(new Date(c.inicioISO))}
                    </td>
                    <td>
                      <span className={ETIQUETA_DO_TIPO[c.tipo] ?? "etiqueta-neutra"}>
                        {ROTULO_DO_TIPO[c.tipo] ?? c.tipo}
                      </span>
                    </td>
                    <td>
                      <div className="font-medium text-slate-900">{c.titulo}</div>
                      {c.numeroProcesso ? (
                        <div className="text-xs text-slate-500">{c.numeroProcesso}</div>
                      ) : null}
                    </td>
                    <td>{c.nomeDoResponsavel ?? "—"}</td>
                    <td>{nomes}</td>
                    <td>
                      {c.link ? (
                        <a
                          href={c.link}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-[color:var(--marca-primaria)] hover:underline"
                        >
                          Entrar
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                        {statusDe(c)}
                      </div>
                      {respostas ? (
                        <div className="text-xs text-slate-500">{respostas}</div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap text-right text-xs">
                      <button
                        type="button"
                        className="mr-3 font-medium text-[color:var(--marca-primaria)] hover:underline"
                        onClick={() => setVerId(verId === c.id ? null : c.id)}
                      >
                        {verId === c.id ? "Fechar" : "Ver"}
                      </button>
                      <button
                        type="button"
                        className="mr-3 font-medium text-[color:var(--marca-primaria)] hover:underline"
                        onClick={() => {
                          setEditando(c);
                          setModo("editando");
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="mr-3 font-medium text-[color:var(--marca-primaria)] hover:underline disabled:opacity-50"
                        disabled={ocupado === c.id}
                        onClick={() => setAvisarDe(avisarDe === c.id ? null : c.id)}
                      >
                        {ocupado === c.id ? "Enviando..." : "Avisar"}
                      </button>
                      <button
                        type="button"
                        className="font-medium text-red-700 hover:underline disabled:opacity-50"
                        disabled={ocupado === c.id}
                        onClick={() => excluir(c)}
                      >
                        Excluir
                      </button>
                      {avisarDe === c.id ? (
                        <div className="mt-2 flex flex-col items-end gap-1">
                          {AVISOS_MANUAIS.map((qual) => (
                            <button
                              key={qual}
                              type="button"
                              className="text-slate-800 hover:underline"
                              onClick={() => avisar(c, qual)}
                            >
                              {ROTULO_DO_AVISO_MANUAL[qual]}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                  {verId === c.id ? (
                    <tr>
                      <td colSpan={8} className="bg-slate-50/60 p-4">
                        <VerCompromisso
                          compromisso={c}
                          clientes={clientes}
                          comWhatsapp={comWhatsapp}
                          aoFechar={() => setVerId(null)}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {visiveis.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  {busca.trim()
                    ? "Nenhum compromisso encontrado para essa busca."
                    : "Nada agendado de hoje em diante."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A tela "Ver": tudo que foi cadastrado, quem vai, e os avisos que sairam. */
function VerCompromisso({
  compromisso: c,
  clientes,
  comWhatsapp,
  aoFechar,
}: {
  compromisso: CompromissoNaTela;
  clientes: { id: string; nome: string }[];
  comWhatsapp: boolean;
  aoFechar: () => void;
}) {
  const [avisos, setAvisos] = useState<AvisoDoCompromisso[] | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/compromissos/${c.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo) setAvisos(d?.compromisso?.avisos ?? []);
      })
      .catch(() => {
        if (vivo) setAvisos([]);
      });
    return () => {
      vivo = false;
    };
  }, [c.id]);

  return (
    <div className="grid gap-4 text-sm">
      <div className="flex items-start justify-between">
        <h2 className="text-base font-semibold text-slate-900">Ver compromisso</h2>
        <button type="button" className="text-slate-500 hover:underline" onClick={aoFechar}>
          Fechar
        </button>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <Dado rotulo="Quando" valor={quando.format(new Date(c.inicioISO))} />
        <Dado rotulo="Tipo" valor={ROTULO_DO_TIPO[c.tipo] ?? c.tipo} />
        <Dado rotulo="Status" valor={statusDe(c)} />
        <Dado rotulo="Advogado(a) responsavel" valor={c.nomeDoResponsavel ?? "—"} />
        <Dado rotulo="Cliente" valor={c.nomeDoCliente ?? "—"} />
        {c.numeroProcesso ? <Dado rotulo="Numero do processo" valor={c.numeroProcesso} /> : null}
        {c.local ? <Dado rotulo="Local" valor={c.local} /> : null}
        {c.link ? (
          <div>
            <dt className="text-xs text-slate-500">Link da sala</dt>
            <dd>
              <a
                href={c.link}
                target="_blank"
                rel="noreferrer"
                className="break-all text-[color:var(--marca-primaria)] hover:underline"
              >
                {c.link}
              </a>
            </dd>
          </div>
        ) : null}
        {c.observacoes ? (
          <div className="sm:col-span-3">
            <dt className="text-xs text-slate-500">Observacoes</dt>
            <dd className="whitespace-pre-wrap text-slate-800">{c.observacoes}</dd>
          </div>
        ) : null}
      </dl>

      <div>
        <p className="mb-1 text-xs text-slate-500">Quem vai</p>
        <ParticipantesDoCompromisso
          compromissoId={c.id}
          titulo={c.titulo}
          clientes={clientes}
          comWhatsapp={comWhatsapp}
          iniciais={c.participantes}
          respostas={c.respostas}
        />
      </div>

      <div>
        <p className="mb-1 text-xs text-slate-500">Avisos deste compromisso</p>
        {avisos === null ? (
          <p className="text-slate-500">Carregando...</p>
        ) : avisos.length === 0 ? (
          <p className="text-slate-500">Nenhum aviso gerado ainda.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {avisos.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="w-32 shrink-0 tabular-nums text-slate-600">
                  {quando.format(new Date(a.enviadoEm ?? a.criadoEm))}
                </span>
                <span className="w-20 shrink-0">{a.canal === "WHATSAPP" ? "WhatsApp" : "E-mail"}</span>
                <span className="flex-1">
                  {ROTULO_DO_TIPO_DE_AVISO[a.tipo] ?? a.tipo}
                  <span className="text-slate-500"> · {a.destino}</span>
                </span>
                <span className={COR_DO_ESTADO[a.estado] ?? "etiqueta-neutra"} title={a.erro ?? undefined}>
                  {ROTULO_DO_ESTADO[a.estado] ?? a.estado}
                </span>
                <EntregaDoAviso a={a} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{rotulo}</dt>
      <dd className="text-slate-900">{valor}</dd>
    </div>
  );
}

/**
 * Auditoria: o que saiu da agenda. So consulta — nada aqui volta.
 */
function ExcluidosDaAgenda({ aoFechar }: { aoFechar: () => void }) {
  const [itens, setItens] = useState<Excluido[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/compromissos/excluidos")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.erro ?? "Falha ao carregar.");
        return d.excluidos as Excluido[];
      })
      .then(setItens)
      .catch((e) => setErro(e.message));
  }, []);

  return (
    <section className="cartao border-l-4 border-l-slate-400">
      <div className="flex items-start justify-between">
        <h2 className="text-base font-semibold">Compromissos excluidos (auditoria)</h2>
        <button type="button" className="text-sm text-slate-500 hover:underline" onClick={aoFechar}>
          Fechar
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        O que saiu da agenda: apagado por alguem do escritorio, ou arquivado pela rotina depois de
        vencer o horario. Fica aqui so para consulta — nada pode ser reaberto.
      </p>
      {erro ? <p className="aviso-erro mt-3">{erro}</p> : null}
      {itens === null && !erro ? <p className="mt-3 text-sm text-slate-500">Carregando...</p> : null}
      {itens ? (
        <div className="mt-3 overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Titulo</th>
                <th>Tipo</th>
                <th>Cliente / quem ia</th>
                <th>Advogado(a)</th>
                <th>Data original</th>
                <th>Saiu em</th>
                <th>Por que</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((it) => (
                <tr key={it.id}>
                  <td>
                    <div className="font-medium text-slate-900">{it.titulo}</div>
                    {it.numeroProcesso ? (
                      <div className="text-xs text-slate-500">{it.numeroProcesso}</div>
                    ) : null}
                  </td>
                  <td>{ROTULO_DO_TIPO[it.tipo] ?? it.tipo}</td>
                  <td>
                    {it.participantes.length ? it.participantes.join(", ") : (it.nomeDoCliente ?? "—")}
                  </td>
                  <td>{it.nomeDoResponsavel ?? "—"}</td>
                  <td className="whitespace-nowrap tabular-nums">{quando.format(new Date(it.inicio))}</td>
                  <td className="whitespace-nowrap tabular-nums">{quando.format(new Date(it.excluidoEm))}</td>
                  <td className="text-xs text-slate-600">
                    {TEXTO_DO_MOTIVO[it.motivo] ?? it.motivo}
                    {it.nomeDeQuemExcluiu ? ` (${it.nomeDeQuemExcluiu})` : ""}
                  </td>
                </tr>
              ))}
              {itens.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">
                    Nada saiu da agenda ainda.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Auditoria de avisos: prova de envio — data, hora, destinatario, desfecho.
 * Para responder com registro quando alguem diz que nao foi avisado.
 */
function NotificacoesDaAgenda({ aoFechar }: { aoFechar: () => void }) {
  const [itens, setItens] = useState<Notificacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    fetch("/api/compromissos/notificacoes")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.erro ?? "Falha ao carregar.");
        return d.notificacoes as Notificacao[];
      })
      .then(setItens)
      .catch((e) => setErro(e.message));
  }, []);

  const termo = normalizar(busca.trim());
  const filtrados = (itens ?? []).filter((it) =>
    termo
      ? normalizar(
          [
            it.destinatario,
            it.destino,
            it.assunto,
            it.compromisso?.titulo,
            it.compromisso?.nomeDoCliente,
            it.compromisso?.nomeDoResponsavel,
          ]
            .filter(Boolean)
            .join(" "),
        ).includes(termo)
      : true,
  );

  return (
    <section className="cartao border-l-4 border-l-slate-400">
      <div className="flex items-start justify-between">
        <h2 className="text-base font-semibold">Notificacoes enviadas (auditoria)</h2>
        <button type="button" className="text-sm text-slate-500 hover:underline" onClick={aoFechar}>
          Fechar
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Todo aviso de compromisso — confirmacao, lembretes e designacao — por WhatsApp ou e-mail, com
        data, hora, destinatario e o que aconteceu: enviado, na fila, falhou ou cancelado. Serve de
        prova contra a alegacao de que a pessoa nao foi avisada.
      </p>
      <input
        type="search"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por pessoa, telefone, e-mail ou compromisso"
        className="campo mt-3 max-w-sm"
      />
      {erro ? <p className="aviso-erro mt-3">{erro}</p> : null}
      {itens === null && !erro ? <p className="mt-3 text-sm text-slate-500">Carregando...</p> : null}
      {itens ? (
        <div className="mt-3 overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Enviado em</th>
                <th>Canal</th>
                <th>Aviso</th>
                <th>Destinatario</th>
                <th>Compromisso</th>
                <th>Data do compromisso</th>
                <th>Advogado(a)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((it) => (
                <tr key={it.id} className="align-top">
                  <td className="whitespace-nowrap tabular-nums">
                    {quando.format(new Date(it.enviadoEm ?? it.criadoEm))}
                  </td>
                  <td>{it.canal === "WHATSAPP" ? "WhatsApp" : "E-mail"}</td>
                  <td>{it.rotulo}</td>
                  <td>
                    <div>{it.destinatario}</div>
                    <div className="text-xs text-slate-500">{it.destino}</div>
                  </td>
                  <td>
                    {it.compromisso ? (
                      <>
                        {it.compromisso.titulo}
                        <div className="text-xs text-slate-500">
                          {ROTULO_DO_TIPO[it.compromisso.tipo] ?? it.compromisso.tipo}
                        </div>
                      </>
                    ) : (
                      <>
                        {it.assunto}
                        <div className="text-xs text-slate-500">compromisso ja saiu da agenda</div>
                      </>
                    )}
                  </td>
                  <td className="whitespace-nowrap tabular-nums">
                    {it.compromisso ? quando.format(new Date(it.compromisso.inicio)) : "—"}
                  </td>
                  <td>{it.compromisso?.nomeDoResponsavel ?? "—"}</td>
                  <td>
                    <span className={COR_DO_ESTADO[it.estado] ?? "etiqueta-neutra"} title={it.erro ?? undefined}>
                      {ROTULO_DO_ESTADO[it.estado] ?? it.estado}
                    </span>
                    <EntregaDoAviso a={it} />
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500">
                    {itens.length === 0 ? "Nenhuma notificacao enviada ainda." : "Nenhum resultado para essa busca."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
