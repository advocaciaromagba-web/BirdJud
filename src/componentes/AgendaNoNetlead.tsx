"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type LigacaoNaTela = { final: string; ativo: boolean; pessoa: string | null; erro: string | null; enviadoEm: string | null } | null;

/**
 * Bloquear os horarios da agenda no NetLead. So sai horario e um rotulo
 * generico; nome de cliente, processo e local ficam aqui.
 */
export function AgendaNoNetlead({ ligacao }: { ligacao: LigacaoNaTela }) {
  const router = useRouter();
  const [chave, setChave] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState<{ ok: boolean; texto: string } | null>(null);

  async function pedir(corpo: Record<string, unknown>) {
    setOcupado(true);
    setRecado(null);
    try {
      const r = await fetch("/api/conta/netlead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
      const j = await r.json().catch(() => ({}));
      setRecado(r.ok ? { ok: Boolean(j.ok), texto: j.texto ?? "Feito." } : { ok: false, texto: j.erro ?? "Não deu certo." });
      if (r.ok) {
        setChave("");
        router.refresh();
      }
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="cartao mt-6">
      <h2 className="text-lg font-semibold">Agenda no NetLead</h2>
      <p className="ajuda">
        Para quem usa também o NetLead: os horários ocupados aqui (audiência, perícia, atendimento sob sua responsabilidade) ficam bloqueados lá, até 180
        dias à frente. Sai só o horário e o tipo — nome de cliente, processo, local e observações não saem do escritório.
      </p>

      {ligacao ? (
        <div className="mt-3 grid gap-2 text-sm">
          <p>
            Chave terminada em <strong>…{ligacao.final}</strong>
            {ligacao.pessoa ? ` · agenda de ${ligacao.pessoa}` : ""}
            {ligacao.enviadoEm ? ` · último envio ${ligacao.enviadoEm}` : ""}
          </p>
          {ligacao.erro ? <p className="aviso-erro">{ligacao.erro}</p> : null}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={ligacao.ativo} disabled={ocupado} onChange={(e) => pedir({ acao: "ligar", ativo: e.target.checked })} />
            Bloquear meus horários no NetLead
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="botao-discreto" disabled={ocupado} onClick={() => pedir({ acao: "testar" })}>
              Testar
            </button>
            <button
              type="button"
              className="botao-discreto"
              disabled={ocupado}
              onClick={() => window.confirm("Remover a ligação com o NetLead? Os horários são liberados lá.") && pedir({ acao: "remover" })}
            >
              Remover
            </button>
          </div>
        </div>
      ) : null}

      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (chave.trim()) pedir({ acao: "chave", chave });
        }}
      >
        <label className="grid min-w-0 flex-1 gap-1 text-sm">
          {ligacao ? "Trocar a chave" : "Chave da sua agenda no NetLead"}
          <input
            className="campo"
            type="password"
            autoComplete="off"
            placeholder="nlag_…"
            value={chave}
            onChange={(e) => setChave(e.target.value)}
          />
        </label>
        <button type="submit" className="botao-principal" disabled={ocupado || !chave.trim()}>
          Guardar e testar
        </button>
      </form>
      <p className="ajuda">A chave é gerada no NetLead. Fica guardada cifrada e não volta a aparecer inteira.</p>

      {recado ? (
        <p role="status" className={`mt-2 text-sm ${recado.ok ? "text-emerald-700" : "text-red-700"}`}>
          {recado.texto}
        </p>
      ) : null}
    </section>
  );
}
