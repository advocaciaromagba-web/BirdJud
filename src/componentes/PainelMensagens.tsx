"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MensagemNaTela, MensagensDoEscritorio } from "@/lib/entrega-do-escritorio";

const ETIQUETA_DA_CATEGORIA: Record<string, { texto: string; classe: string }> = {
  TEMPORARIO: { texto: "Instabilidade", classe: "etiqueta-atencao" },
  NUMERO: { texto: "Numero", classe: "etiqueta-erro" },
  RECUSOU: { texto: "Bloqueou empresas", classe: "etiqueta-erro" },
  PLATAFORMA: { texto: "Plataforma", classe: "etiqueta-atencao" },
  EMAIL: { texto: "E-mail", classe: "etiqueta-erro" },
  OUTRO: { texto: "Falha", classe: "etiqueta-erro" },
};

function Mensagem({ m, resolvida }: { m: MensagemNaTela; resolvida?: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [recado, setRecado] = useState<{ texto: string; ok: boolean } | null>(null);
  const [resolvendo, setResolvendo] = useState(false);
  const [observacao, setObservacao] = useState("");

  async function agir(corpo: Record<string, unknown>, rotulo: string) {
    setOcupado(rotulo);
    setRecado(null);
    const r = await fetch(`/api/mensagens/${m.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const json = await r.json().catch(() => ({}));
    setOcupado(null);
    setRecado({ texto: json.mensagem ?? json.erro ?? (r.ok ? "Feito." : "Nao deu certo."), ok: r.ok });
    if (r.ok) {
      setResolvendo(false);
      router.refresh();
    }
  }

  const etiqueta = m.categoria ? ETIQUETA_DA_CATEGORIA[m.categoria] : null;

  return (
    <li className="cartao">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">
            {m.destinatario}
            <span className="ml-2 text-sm font-normal text-slate-500">
              {m.canal === "WHATSAPP" ? "WhatsApp" : "E-mail"} · {m.destino}
            </span>
          </p>
          <p className="text-sm text-slate-600">
            {m.rotulo} — {m.assunto}
          </p>
          {m.compromisso ? (
            <p className="text-sm text-slate-600">
              Compromisso:{" "}
              <Link href="/agenda" className="underline">
                {m.compromisso.titulo}
              </Link>
              , {m.compromisso.inicio}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {etiqueta ? <span className={`etiqueta ${etiqueta.classe}`}>{etiqueta.texto}</span> : null}
          {!m.categoria && !resolvida ? <span className="etiqueta etiqueta-atencao">Sem confirmacao</span> : null}
          {resolvida && m.tratamento ? <span className="etiqueta etiqueta-ok">{m.tratamento}</span> : null}
          <span className="whitespace-nowrap text-xs text-slate-500">{m.quando}</span>
        </div>
      </div>

      {m.motivo ? (
        <p className="mt-3 text-sm">
          <span className="font-medium text-slate-800">Motivo: </span>
          {m.motivo}
        </p>
      ) : null}
      {m.outroCanal ? (
        <p className="mt-1 text-sm text-slate-600">
          Pelo {m.outroCanal.canal.toLowerCase()}: {m.outroCanal.situacao}.
        </p>
      ) : null}
      {m.reenvioAutomaticoEm ? (
        <p className="mt-1 text-sm text-slate-600">O sistema reenvia sozinho em {m.reenvioAutomaticoEm}.</p>
      ) : null}
      {m.oQueFazer && !resolvida ? <p className="mt-2 text-sm text-slate-700">{m.oQueFazer}</p> : null}

      {resolvida ? (
        <p className="mt-2 text-sm text-slate-600">
          {m.tratadoPor ? `${m.tratadoPor}, ` : ""}
          {m.tratadoEm}
          {m.observacao ? ` — ${m.observacao}` : ""}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {m.podeReenviar ? (
            <button
              type="button"
              className="botao-principal"
              disabled={ocupado !== null}
              onClick={() => agir({ acao: "reenviar" }, "reenviar")}
            >
              {ocupado === "reenviar" ? "Reenviando..." : "Reenviar"}
            </button>
          ) : m.clienteId ? (
            <Link href={`/clientes/${m.clienteId}`} className="botao-principal">
              Mandar de novo pela ficha
            </Link>
          ) : null}
          <button type="button" className="botao-secundario" onClick={() => setResolvendo((v) => !v)}>
            Marcar como resolvida
          </button>
          <details className="text-sm text-slate-500">
            <summary className="cursor-pointer">Ver a mensagem</summary>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-slate-700">{m.corpo}</pre>
          </details>
        </div>
      )}

      {resolvendo ? (
        <div className="mt-3 grid gap-2 rounded border border-slate-200 p-3">
          <label className="rotulo" htmlFor={`obs-${m.id}`}>
            Como foi resolvido (opcional)
          </label>
          <input
            id={`obs-${m.id}`}
            className="campo"
            placeholder="Ex.: liguei e confirmei a audiencia"
            value={observacao}
            maxLength={500}
            onChange={(e) => setObservacao(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="botao-secundario"
              disabled={ocupado !== null}
              onClick={() => agir({ acao: "resolver", tratamento: "CONTATO_DIRETO", observacao }, "contato")}
            >
              Avisei por outro meio
            </button>
            <button
              type="button"
              className="botao-discreto"
              disabled={ocupado !== null}
              onClick={() => agir({ acao: "resolver", tratamento: "DESCARTADO", observacao }, "descartar")}
            >
              Nao precisa mais
            </button>
          </div>
        </div>
      ) : null}

      {recado ? <p className={`mt-3 ${recado.ok ? "aviso-ok" : "aviso-erro"}`}>{recado.texto}</p> : null}
    </li>
  );
}

function Secao({
  titulo,
  explicacao,
  vazio,
  itens,
  resolvidas,
}: {
  titulo: string;
  explicacao: string;
  vazio: string;
  itens: MensagemNaTela[];
  resolvidas?: boolean;
}) {
  return (
    <section className="mt-8">
      <h2>
        {titulo} <span className="text-slate-500">({itens.length})</span>
      </h2>
      <p className="mt-1 text-sm text-slate-600">{explicacao}</p>
      {itens.length === 0 ? (
        <p className="vazio mt-3">{vazio}</p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {itens.map((m) => (
            <Mensagem key={m.id} m={m} resolvida={resolvidas} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function PainelMensagens({ naoEntregues, semConfirmacao, resolvidas }: MensagensDoEscritorio) {
  return (
    <div>
      {naoEntregues.length + semConfirmacao.length === 0 ? (
        <p className="aviso-ok mt-4">Tudo entregue: nenhuma mensagem pendente de atencao.</p>
      ) : (
        <p className="aviso-atencao mt-4">
          {naoEntregues.length + semConfirmacao.length} mensagem(ns) podem nao ter chegado. Reenvie ou avise a pessoa
          por outro meio e marque como resolvida.
        </p>
      )}

      <Secao
        titulo="Nao entregues"
        explicacao="O envio falhou ou a Meta devolveu que nao entregou. Quem e responsavel pelo compromisso (ou o administrador) recebe um e-mail a cada uma."
        vazio="Nenhuma mensagem falhou."
        itens={naoEntregues}
      />
      <Secao
        titulo="Sem confirmacao de entrega"
        explicacao="WhatsApp aceito pela Meta ha mais de 6 horas, sem a confirmacao de que chegou ao celular. A Meta continua tentando; se for importante, reenvie ou ligue."
        vazio="Todas as mensagens de WhatsApp tiveram a entrega confirmada."
        itens={semConfirmacao}
      />
      <Secao
        titulo="Resolvidas nos ultimos 30 dias"
        explicacao="O que foi reenviado ou resolvido por outro meio, com quem fez."
        vazio="Nada resolvido no periodo."
        itens={resolvidas}
        resolvidas
      />
    </div>
  );
}
