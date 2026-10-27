"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PARENTESCOS, ROTULO_DO_PARENTESCO } from "@/lib/menor";

/**
 * Os menores que este cliente representa, e o cadastro de um novo a partir
 * dele: endereco e contato vem daqui, e ele ja entra como quem representa.
 * RG e CPF nao vem: sao do menor, e herdar faria a procuracao sair com o
 * documento do adulto.
 */
export function MenoresDoCliente({
  clienteId,
  nomeDoCliente,
  menores,
}: {
  clienteId: string;
  nomeDoCliente: string;
  menores: Array<{ id: string; nome: string; regime: string }>;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", nascimento: "", parentesco: "GENITORA", documento: "", rg: "", nacionalidade: "" });

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro(null);
    const r = await fetch(`/api/clientes/${clienteId}/menores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = (await r.json().catch(() => ({}))) as { erro?: string; menor?: { id: string } };
    setOcupado(false);
    if (!r.ok || !json.menor) {
      setErro(json.erro ?? "Não deu certo.");
      return;
    }
    router.push(`/clientes/${json.menor.id}`);
  }

  return (
    <section className="cartao">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Menores representados</h2>
          <p className="mt-1 text-sm text-slate-600">
            Quando quem figura na ação é o filho, cadastre-o daqui: {nomeDoCliente} já entra como quem o representa, com
            endereço e contato. O RG e o CPF do menor são dele e são pedidos à parte.
          </p>
        </div>
        <button type="button" className={aberto ? "botao-secundario" : "botao-principal"} onClick={() => setAberto((v) => !v)}>
          {aberto ? "Cancelar" : "Cadastrar menor"}
        </button>
      </div>

      {menores.length ? (
        <ul className="lista mt-3">
          {menores.map((m) => (
            <li key={m.id} className="py-2 text-sm">
              <Link href={`/clientes/${m.id}`} className="font-medium text-marca">
                {m.nome}
              </Link>
              <span className="block text-xs text-slate-500">{m.regime}</span>
            </li>
          ))}
        </ul>
      ) : !aberto ? (
        <p className="mt-3 text-sm text-slate-500">Nenhum menor cadastrado a partir deste cliente.</p>
      ) : null}

      {aberto ? (
        <form onSubmit={cadastrar} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 sm:col-span-2">
            <span className="rotulo">Nome do menor</span>
            <input className="campo" required minLength={2} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </label>
          <label className="grid gap-1">
            <span className="rotulo">Data de nascimento</span>
            <input type="date" className="campo" required value={form.nascimento} onChange={(e) => setForm({ ...form, nascimento: e.target.value })} />
          </label>
          <label className="grid gap-1">
            <span className="rotulo">{nomeDoCliente} é</span>
            <select className="campo" value={form.parentesco} onChange={(e) => setForm({ ...form, parentesco: e.target.value })}>
              {PARENTESCOS.map((p) => (
                <option key={p} value={p}>
                  {ROTULO_DO_PARENTESCO[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="rotulo">
              CPF do menor <span className="font-normal text-slate-500">opcional</span>
            </span>
            <input className="campo" value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} />
          </label>
          <label className="grid gap-1">
            <span className="rotulo">
              RG do menor <span className="font-normal text-slate-500">opcional</span>
            </span>
            <input className="campo" value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} />
          </label>
          <label className="grid gap-1 sm:col-span-2">
            <span className="rotulo">Nacionalidade do menor</span>
            <input
              className="campo"
              placeholder="brasileira, brasileiro"
              value={form.nacionalidade}
              onChange={(e) => setForm({ ...form, nacionalidade: e.target.value })}
            />
            <span className="ajuda">Escreva como a criança é: é isso que põe o documento no feminino ou no masculino.</span>
          </label>
          {erro ? <p className="aviso-erro sm:col-span-2">{erro}</p> : null}
          <div className="sm:col-span-2">
            <button type="submit" className="botao-principal" disabled={ocupado}>
              {ocupado ? "Cadastrando…" : "Cadastrar menor"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
