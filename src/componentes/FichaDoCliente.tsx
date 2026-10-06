"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export type CampoDaFicha = {
  nome: "nome" | "documento" | "email" | "telefone";
  rotulo: string;
  valor: string;
  tipo?: string;
  obrigatorio?: boolean;
  ajuda?: string;
};

/**
 * Edicao do cliente.
 *
 * Ate aqui o cadastro era so de ida: errou o nome, digitou o CPF torto, mudou
 * o telefone — nao havia como corrigir pela tela. Em escritorio isso nao e
 * incomodo pequeno, porque o cadastro errado segue junto para a cobranca, a
 * nota fiscal e a peca.
 *
 * So manda o que MUDOU. Reenviar o formulario inteiro faria uma edicao de
 * telefone sobrescrever um e-mail que outra pessoa acabou de corrigir em outra
 * aba — perda de dado que ninguem ve acontecer.
 */
export function FichaDoCliente({
  id,
  campos,
}: {
  id: string;
  campos: CampoDaFicha[];
}) {
  const router = useRouter();
  const [valores, setValores] = useState(() =>
    Object.fromEntries(campos.map((c) => [c.nome, c.valor])),
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const mudou = campos.some((c) => valores[c.nome] !== c.valor);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSalvo(false);

    const mudancas = Object.fromEntries(
      campos
        .filter((c) => valores[c.nome] !== c.valor)
        .map((c) => [c.nome, valores[c.nome] ?? ""]),
    );
    if (Object.keys(mudancas).length === 0) return;

    setSalvando(true);
    const resposta = await fetch(`/api/clientes/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mudancas),
    });
    setSalvando(false);

    if (!resposta.ok) {
      const detalhe = await resposta.json().catch(() => null);
      setErro(detalhe?.erro ?? "Nao consegui salvar.");
      return;
    }
    setSalvo(true);
    // Recarrega do servidor: as pendencias ao lado mudam com o que acabou de
    // ser salvo, e mostrar pendencia velha ao lado de dado novo e pior que
    // nao mostrar nada.
    router.refresh();
  }

  return (
    <form onSubmit={salvar} className="grid gap-4">
      {campos.map((campo) => (
        <div key={campo.nome}>
          <label htmlFor={`cli-${campo.nome}`} className="rotulo">
            {campo.rotulo}
            {campo.obrigatorio ? null : (
              <span className="ml-1 font-normal text-slate-400">opcional</span>
            )}
          </label>
          <input
            id={`cli-${campo.nome}`}
            type={campo.tipo ?? "text"}
            required={campo.obrigatorio}
            value={valores[campo.nome] ?? ""}
            onChange={(e) => {
              setValores((antes) => ({ ...antes, [campo.nome]: e.target.value }));
              setSalvo(false);
            }}
            className="campo"
          />
          {campo.ajuda ? <p className="ajuda">{campo.ajuda}</p> : null}
        </div>
      ))}

      {erro ? <p className="aviso-erro">{erro}</p> : null}
      {salvo && !mudou ? (
        <p className="text-sm text-emerald-700">Salvo.</p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={!mudou || salvando}
          className="botao-principal disabled:opacity-50"
        >
          {salvando ? "Salvando..." : "Salvar alteracoes"}
        </button>
      </div>
    </form>
  );
}
