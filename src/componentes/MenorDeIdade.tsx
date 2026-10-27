"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Marca o cliente como menor de idade. Marcado, todo documento sai no nome
 * dele com quem o representa — "representado" ate 16 anos, "assistido" de 16
 * a 18 —, e o servidor exige a data de nascimento.
 */
export function MenorDeIdade({
  clienteId,
  menor,
  regime,
  doCadastroDe,
}: {
  clienteId: string;
  menor: boolean;
  /** "12 anos — vai representado (até 16 anos)" */
  regime: string;
  doCadastroDe: { id: string; nome: string } | null;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function trocar(valor: boolean) {
    setOcupado(true);
    setErro(null);
    const r = await fetch(`/api/clientes/${clienteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menor: valor }),
    });
    const json = (await r.json().catch(() => ({}))) as { erro?: string };
    setOcupado(false);
    if (!r.ok) {
      setErro(json.erro ?? "Não deu certo.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-4 rounded-[var(--raio)] border border-slate-200 p-3 text-sm">
      <label className="flex items-center gap-2 font-medium">
        <input type="checkbox" checked={menor} disabled={ocupado} onChange={(e) => void trocar(e.target.checked)} />
        Cliente menor de idade
      </label>
      <p className="ajuda">
        {menor
          ? `Os documentos saem no nome do menor, com quem o representa. ${regime[0].toUpperCase()}${regime.slice(1)}.`
          : "Marque quando a parte for menor: o documento sai no nome dele, representado (até 16 anos) ou assistido (de 16 a 18) por quem exerce o poder familiar. Precisa da data de nascimento."}
      </p>
      {menor && doCadastroDe ? (
        <p className="mt-1 text-xs text-slate-500">
          Cadastrado a partir de{" "}
          <a href={`/clientes/${doCadastroDe.id}`} className="underline">
            {doCadastroDe.nome}
          </a>
          .
        </p>
      ) : null}
      {erro ? <p className="mt-1 text-red-700">{erro}</p> : null}
    </div>
  );
}
