"use client";

import { OPCOES_DE_PAPEL } from "@/lib/papeis";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Pessoa = {
  id: string;
  nome: string;
  email: string;
  papel: string;
  oab: string | null;
  telefone: string | null;
  ativo: boolean;
  recebeWhatsapp?: boolean;
  recebeResumo?: boolean;
  recebeLembretes?: boolean;
};

const PAPEIS = OPCOES_DE_PAPEL;

/**
 * Edita uma pessoa da equipe, ali mesmo na lista. Senha e segundo fator
 * ficam de fora: são da própria pessoa. As regras (ninguém se desativa, o
 * último administrador fica, vaga da faixa) são do servidor; aqui só se
 * mostra o que ele respondeu.
 */
export function EditarUsuario({ pessoa, ehVoce }: { pessoa: Pessoa; ehVoce: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState<{ texto: string; erro: boolean } | null>(null);
  const [dados, setDados] = useState({
    nome: pessoa.nome,
    email: pessoa.email,
    papel: pessoa.papel,
    oab: pessoa.oab ?? "",
    telefone: pessoa.telefone ?? "",
    recebeWhatsapp: pessoa.recebeWhatsapp ?? false,
    recebeResumo: pessoa.recebeResumo ?? true,
    recebeLembretes: pessoa.recebeLembretes ?? true,
  });

  async function enviar(corpo: Record<string, unknown>) {
    setOcupado(true);
    setRecado(null);
    const r = await fetch(`/api/usuarios/${pessoa.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const json = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) {
      setRecado({ texto: json.erro ?? "Não foi possível salvar.", erro: true });
      return false;
    }
    router.refresh();
    return true;
  }

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = await enviar({
      nome: dados.nome,
      email: dados.email,
      papel: dados.papel,
      oab: dados.oab || null,
      telefone: dados.telefone || null,
      recebeWhatsapp: dados.recebeWhatsapp,
      recebeResumo: dados.recebeResumo,
      recebeLembretes: dados.recebeLembretes,
    });
    if (ok) {
      setRecado({ texto: "Dados salvos.", erro: false });
      setAberto(false);
    }
  }

  async function alternarAtivo() {
    const desativar = pessoa.ativo;
    if (desativar && !window.confirm(`Desativar ${pessoa.nome}? A pessoa perde o acesso na hora e libera a vaga da faixa. Dá para reativar depois.`)) return;
    const ok = await enviar({ ativo: !desativar });
    if (ok) setRecado({ texto: desativar ? "Pessoa desativada." : "Pessoa reativada.", erro: false });
  }

  return (
    <div className="mt-2 text-sm">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="botao-discreto" onClick={() => setAberto((v) => !v)}>
          {aberto ? "Fechar" : "Editar"}
        </button>
        {ehVoce ? null : (
          <button type="button" className="botao-discreto" onClick={alternarAtivo} disabled={ocupado}>
            {pessoa.ativo ? "Desativar" : "Reativar"}
          </button>
        )}
      </div>
      {aberto ? (
        <form onSubmit={salvar} className="cartao-aperto mt-2 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            Nome
            <input value={dados.nome} onChange={(e) => setDados({ ...dados, nome: e.target.value })} required minLength={2} className="rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="grid gap-1">
            E-mail
            <input type="email" value={dados.email} onChange={(e) => setDados({ ...dados, email: e.target.value })} required className="rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="grid gap-1">
            Papel
            <select value={dados.papel} onChange={(e) => setDados({ ...dados, papel: e.target.value })} disabled={ehVoce} className="rounded border border-slate-300 px-3 py-2">
              {PAPEIS.map((p) => (
                <option key={p.valor} value={p.valor}>{p.rotulo}</option>
              ))}
            </select>
            {ehVoce ? <span className="text-xs text-slate-500">Seu próprio papel só outro administrador muda.</span> : null}
          </label>
          <label className="grid gap-1">
            OAB (advogados)
            <input value={dados.oab} onChange={(e) => setDados({ ...dados, oab: e.target.value })} placeholder="123456/SP" className="rounded border border-slate-300 px-3 py-2" />
          </label>
          <label className="grid gap-1">
            Telefone (WhatsApp)
            <input value={dados.telefone} onChange={(e) => setDados({ ...dados, telefone: e.target.value })} placeholder="(16) 99999-8888" className="rounded border border-slate-300 px-3 py-2" />
          </label>
          <fieldset className="grid gap-1 sm:col-span-2">
            <legend className="mb-1 font-medium">Avisos que esta pessoa recebe</legend>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={dados.recebeResumo} onChange={(e) => setDados({ ...dados, recebeResumo: e.target.checked })} />
              Resumo do dia por e-mail
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={dados.recebeLembretes} onChange={(e) => setDados({ ...dados, recebeLembretes: e.target.checked })} />
              Lembretes de compromissos e tarefas
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={dados.recebeWhatsapp && Boolean(dados.telefone)}
                disabled={!dados.telefone}
                onChange={(e) => setDados({ ...dados, recebeWhatsapp: e.target.checked })}
              />
              Avisos também pelo WhatsApp{dados.telefone ? "" : " (precisa de telefone)"}
            </label>
          </fieldset>
          <div className="flex items-end gap-2">
            <button type="submit" className="botao-principal" disabled={ocupado}>
              {ocupado ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      ) : null}
      {recado ? <p className={`mt-2 ${recado.erro ? "text-red-700" : "text-green-700"}`}>{recado.texto}</p> : null}
    </div>
  );
}
