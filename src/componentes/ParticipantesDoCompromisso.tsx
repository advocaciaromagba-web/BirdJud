"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PAPEIS_SUGERIDOS } from "@/lib/papeis-de-participante";

export type ParticipanteNaLista = {
  clienteId: string | null;
  nome: string;
  telefone: string;
  email: string;
  papel: string;
  avisar: boolean;
};

export type ClienteEscolhivel = { id: string; nome: string };

/** O que a pessoa respondeu ao lembrete, pelo WhatsApp. */
export type RespostaDoParticipante = {
  nome: string;
  confirmou: boolean;
  recusou: boolean;
};

const VAZIO: ParticipanteNaLista = {
  clienteId: null,
  nome: "",
  telefone: "",
  email: "",
  papel: "",
  avisar: true,
};

/**
 * Quem mais vai a este compromisso.
 *
 * A pessoa pode ser cliente do escritorio ou alguem de fora. Testemunha e
 * acompanhante NAO viram cadastro de cliente so para receber um aviso: ficariam
 * para sempre na lista do escritorio, apareceriam na busca, na cobranca e na
 * escolha de quem assina uma procuracao.
 */
export function ParticipantesDoCompromisso({
  compromissoId,
  titulo,
  iniciais,
  respostas = [],
  clientes,
  comWhatsapp,
}: {
  compromissoId: string;
  titulo: string;
  iniciais: ParticipanteNaLista[];
  /** Quem ja respondeu ao lembrete. Vazio quando ninguem respondeu. */
  respostas?: RespostaDoParticipante[];
  clientes: ClienteEscolhivel[];
  comWhatsapp: boolean;
}) {
  const router = useRouter();
  // So quem respondeu alguma coisa: "aguardando" e o estado de todo mundo o
  // tempo todo, e uma lista cheia de "aguardando" esconde as duas que
  // importam.
  const respondeu = respostas.filter((r) => r.confirmou || r.recusou);
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState<ParticipanteNaLista[]>(iniciais);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function mudar(i: number, campo: keyof ParticipanteNaLista, valor: unknown) {
    setLista((atual) =>
      atual.map((p, j) => (i === j ? { ...p, [campo]: valor } : p)),
    );
  }

  async function gravar() {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    const resposta = await fetch(`/api/compromissos/${compromissoId}/participantes`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        participantes: lista.map((p) => ({
          clienteId: p.clienteId || null,
          nome: p.clienteId ? null : p.nome || null,
          telefone: p.telefone || null,
          email: p.email || null,
          papel: p.papel || null,
          avisar: p.avisar,
        })),
      }),
    });
    setOcupado(false);
    const d = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      setErro(d?.erro ?? "Nao consegui gravar.");
      return;
    }
    setAviso(
      lista.length === 0
        ? "Lista limpa."
        : `${lista.length} participante(s). Cada um recebe o lembrete no contato dele.`,
    );
    router.refresh();
  }

  const semContato = lista.filter((p) => p.avisar && !p.telefone && !p.email && !p.clienteId);
  // Sem WhatsApp conectado, quem so tem telefone nao recebe nada. Dizer isso
  // aqui e o que impede o escritorio gravar a lista e achar que avisou.
  const soTelefone = comWhatsapp
    ? []
    : lista.filter((p) => p.avisar && p.telefone && !p.email && !p.clienteId);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="botao-discreto"
      >
        {aberto
          ? "fechar"
          : lista.length > 0
            ? `${lista.length} participante(s)`
            : "quem mais vai"}
      </button>

      {aberto ? (
        <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-600">
            Quem mais precisa saber da hora e do lugar de <strong>{titulo}</strong>.
            Pode ser um cliente do escritorio ou alguem de fora — testemunha,
            conjuge, preposto. Quem e de fora NAO entra na lista de clientes.
          </p>

          {respondeu.length > 0 ? (
            <p className="mt-2 text-xs">
              <span className="text-slate-500">Respostas ao lembrete: </span>
              {respondeu.map((r, i) => (
                <span key={r.nome + i}>
                  {i > 0 ? " · " : ""}
                  <span className={r.confirmou ? "text-emerald-700" : "text-red-700"}>
                    {r.nome} {r.confirmou ? "confirmou" : "NAO podera ir"}
                  </span>
                </span>
              ))}
            </p>
          ) : null}

          <ul className="mt-3 grid gap-3">
            {lista.map((p, i) => (
              <li key={i} className="grid gap-2 rounded border border-slate-200 bg-white p-2 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="rotulo">Quem</label>
                  <select
                    className="campo"
                    value={p.clienteId ?? ""}
                    onChange={(e) => mudar(i, "clienteId", e.target.value || null)}
                  >
                    <option value="">Alguem de fora (digite o nome)</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>

                {!p.clienteId ? (
                  <div>
                    <label className="rotulo">Nome</label>
                    <input
                      className="campo"
                      value={p.nome}
                      onChange={(e) => mudar(i, "nome", e.target.value)}
                    />
                  </div>
                ) : null}

                <div>
                  <label className="rotulo">Papel</label>
                  <input
                    className="campo"
                    list="papeis-sugeridos"
                    placeholder="testemunha"
                    value={p.papel}
                    onChange={(e) => mudar(i, "papel", e.target.value)}
                  />
                </div>

                <div>
                  <label className="rotulo">
                    Telefone{" "}
                    {p.clienteId ? (
                      <span className="text-slate-400">so se for outro</span>
                    ) : null}
                  </label>
                  <input
                    className="campo"
                    value={p.telefone}
                    onChange={(e) => mudar(i, "telefone", e.target.value)}
                  />
                </div>
                <div>
                  <label className="rotulo">
                    E-mail{" "}
                    {p.clienteId ? (
                      <span className="text-slate-400">so se for outro</span>
                    ) : null}
                  </label>
                  <input
                    className="campo"
                    value={p.email}
                    onChange={(e) => mudar(i, "email", e.target.value)}
                  />
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={p.avisar}
                    onChange={(e) => mudar(i, "avisar", e.target.checked)}
                  />
                  Avisar esta pessoa
                </label>
                <div className="flex items-end justify-end">
                  <button
                    type="button"
                    className="botao-discreto"
                    onClick={() => setLista((a) => a.filter((_, j) => j !== i))}
                  >
                    tirar da lista
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <datalist id="papeis-sugeridos">
            {PAPEIS_SUGERIDOS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>

          {semContato.length > 0 ? (
            <p className="mt-2 text-xs text-amber-700">
              Sem telefone nem e-mail, nao da para avisar{" "}
              {semContato.map((p) => p.nome || "(sem nome)").join(", ")}.
            </p>
          ) : null}
          {soTelefone.length > 0 ? (
            <p className="mt-2 text-xs text-amber-700">
              O WhatsApp do escritorio nao esta conectado, entao quem so tem
              telefone NAO sera avisado:{" "}
              {soTelefone.map((p) => p.nome || "(sem nome)").join(", ")}. Ponha um
              e-mail, ou conecte o WhatsApp em Integracoes.
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="botao-secundario"
              onClick={() => setLista((a) => [...a, { ...VAZIO }])}
            >
              Acrescentar
            </button>
            <button
              type="button"
              className="botao-principal disabled:opacity-50"
              disabled={ocupado}
              onClick={gravar}
            >
              {ocupado ? "Gravando..." : "Gravar a lista"}
            </button>
          </div>

          {aviso ? <p className="mt-2 text-xs text-emerald-700">{aviso}</p> : null}
          {erro ? <p className="aviso-erro mt-2">{erro}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
