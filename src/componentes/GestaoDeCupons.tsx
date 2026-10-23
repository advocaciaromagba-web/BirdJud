"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type CupomNaTela = {
  id: string;
  codigo: string;
  descricao: string | null;
  desconto: string;
  duracao: string;
  validade: string;
  usos: string;
  ativo: boolean;
};

async function chamar(corpo: unknown) {
  const r = await fetch("/api/plataforma/financeiro", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const json = (await r.json().catch(() => ({}))) as { erro?: string; detalhe?: string };
  return { ok: r.ok, texto: json.detalhe ?? json.erro ?? (r.ok ? "Feito." : "Falhou.") };
}

const inteiro = (t: string) => (t.trim() ? Math.round(Number(t.trim().replace(",", "."))) : null);

/** Criar, listar e desativar cupons de desconto. */
export function GestaoDeCupons({ cupons }: { cupons: CupomNaTela[] }) {
  const router = useRouter();
  const [f, setF] = useState({ codigo: "", descricao: "", tipo: "percentual", valor: "", meses: "", validoAte: "", maxUsos: "" });
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState<{ ok: boolean; texto: string } | null>(null);

  async function agir(corpo: unknown) {
    setOcupado(true);
    setRecado(null);
    const r = await chamar(corpo);
    setOcupado(false);
    setRecado(r);
    if (r.ok) router.refresh();
    return r.ok;
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const numero = f.valor.trim().replace(",", ".");
    const ok = await agir({
      acao: "criarCupom",
      codigo: f.codigo,
      descricao: f.descricao || null,
      percentual: f.tipo === "percentual" ? inteiro(f.valor) : null,
      valorCentavos: f.tipo === "valor" ? Math.round(Number(numero) * 100) : null,
      meses: inteiro(f.meses),
      validoAte: f.validoAte || null,
      maxUsos: inteiro(f.maxUsos),
    });
    if (ok) setF({ codigo: "", descricao: "", tipo: "percentual", valor: "", meses: "", validoAte: "", maxUsos: "" });
  }

  const campo = "rounded border border-slate-300 px-2 py-1";
  return (
    <div className="text-sm">
      <form onSubmit={criar} className="grid gap-3 sm:grid-cols-4">
        <label className="grid gap-1">
          Código
          <input className={`${campo} uppercase`} required minLength={3} maxLength={30} value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} placeholder="BOASVINDAS" />
        </label>
        <label className="grid gap-1">
          Desconto
          <span className="flex gap-1">
            <select className={campo} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              <option value="percentual">%</option>
              <option value="valor">R$/mês</option>
            </select>
            <input className={`${campo} w-24`} required inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder={f.tipo === "percentual" ? "20" : "50,00"} />
          </span>
        </label>
        <label className="grid gap-1">
          Por quantos meses
          <input className={campo} inputMode="numeric" value={f.meses} onChange={(e) => setF({ ...f, meses: e.target.value })} placeholder="em branco = sempre" />
        </label>
        <label className="grid gap-1">
          Limite de usos
          <input className={campo} inputMode="numeric" value={f.maxUsos} onChange={(e) => setF({ ...f, maxUsos: e.target.value })} placeholder="em branco = sem limite" />
        </label>
        <label className="grid gap-1">
          Válido para aplicar até
          <input type="date" className={campo} value={f.validoAte} onChange={(e) => setF({ ...f, validoAte: e.target.value })} />
        </label>
        <label className="grid gap-1 sm:col-span-2">
          Descrição (interna)
          <input className={campo} maxLength={200} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="ex.: lançamento, parceria OAB" />
        </label>
        <div className="flex items-end">
          <button type="submit" className="botao-principal" disabled={ocupado}>
            Criar cupom
          </button>
        </div>
      </form>
      <p className="ajuda mt-2">
        O desconto vale sobre a mensalidade (ou a fatura do período), nunca sobre o excedente de consumo. A duração conta do
        fim do teste. O cupom entra no cadastro (campo "cupom") ou pela ficha do escritório.
      </p>

      {cupons.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Código</th>
                <th>Desconto</th>
                <th>Duração</th>
                <th>Validade</th>
                <th>Usos</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cupons.map((c) => (
                <tr key={c.id} className={c.ativo ? "" : "opacity-60"}>
                  <td>
                    <strong>{c.codigo}</strong>
                    {c.descricao ? <span className="block text-xs text-slate-500">{c.descricao}</span> : null}
                  </td>
                  <td>{c.desconto}</td>
                  <td>{c.duracao}</td>
                  <td>{c.validade}</td>
                  <td>{c.usos}</td>
                  <td>
                    <button type="button" className="botao-discreto" disabled={ocupado} onClick={() => agir({ acao: "ativarCupom", id: c.id, ativo: !c.ativo })}>
                      {c.ativo ? "Desativar" : "Reativar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="vazio mt-4">Nenhum cupom criado.</p>
      )}
      {recado ? (
        <p role="status" className={`mt-3 ${recado.ok ? "text-green-800" : "text-red-700"}`}>
          {recado.texto}
        </p>
      ) : null}
    </div>
  );
}
