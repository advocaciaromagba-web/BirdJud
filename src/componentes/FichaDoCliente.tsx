"use client";

import { Fragment, useState, type FormEvent } from "react";
import { consultarCep, estadoDepois, focar, mascararCep, type EstadoDoCep } from "./consultaDeCep";
import { RecadoDoCep } from "./RecadoDoCep";
import { useRouter } from "next/navigation";

export type CampoDaFicha = {
  /** Campo do cliente, ou "endereco.<parte>" para uma parte do endereco. */
  nome: string;
  rotulo: string;
  valor: string;
  tipo?: string;
  obrigatorio?: boolean;
  ajuda?: string;
  /** Titulo da secao em que o campo comeca. */
  grupo?: string;
  /** Ocupa a linha inteira. */
  largo?: boolean;
  placeholder?: string;
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
  const [cep, setCep] = useState<EstadoDoCep>({ tipo: "parado" });

  /**
   * CEP completo: busca o endereco e preenche rua, bairro, cidade e UF; o
   * cursor vai para o numero. CEP geral de cidade preenche so cidade e UF e
   * leva o cursor para a rua.
   */
  async function aoMudarCep(valor: string) {
    const mascarado = mascararCep(valor);
    setValores((antes) => ({ ...antes, "endereco.cep": mascarado }));
    setSalvo(false);
    if (mascarado.replace(/\D/g, "").length !== 8) {
      setCep({ tipo: "parado" });
      return;
    }
    setCep({ tipo: "buscando" });
    const achado = await consultarCep(mascarado);
    setCep(estadoDepois(achado));
    if (!achado) return;
    setValores((antes) => ({
      ...antes,
      "endereco.logradouro": achado.logradouro ?? (achado.geral ? "" : antes["endereco.logradouro"] ?? ""),
      "endereco.bairro": achado.bairro ?? (achado.geral ? "" : antes["endereco.bairro"] ?? ""),
      "endereco.cidade": achado.cidade,
      "endereco.uf": achado.uf,
    }));
    focar(achado.geral ? "cli-endereco.logradouro" : "cli-endereco.numero");
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSalvo(false);

    // As partes do endereco vao juntas, num objeto so; a rota soma ao que
    // ja havia, entao mandar so o numero nao apaga a rua.
    const mudancas: Record<string, unknown> = {};
    const endereco: Record<string, string> = {};
    for (const c of campos) {
      if (valores[c.nome] === c.valor) continue;
      const valor = valores[c.nome] ?? "";
      if (c.nome.startsWith("endereco.")) endereco[c.nome.slice(9)] = valor;
      else mudancas[c.nome] = valor;
    }
    if (Object.keys(endereco).length) mudancas.endereco = endereco;
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
    <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-2">
      {campos.map((campo) => (
        <Fragment key={campo.nome}>
        {campo.grupo ? (
          <p className="mt-2 border-t border-slate-100 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">
            {campo.grupo}
          </p>
        ) : null}
        <div className={campo.largo || campo.tipo === "textarea" ? "sm:col-span-2" : ""}>
          <label htmlFor={`cli-${campo.nome}`} className="rotulo">
            {campo.rotulo}
            {campo.obrigatorio ? null : (
              <span className="ml-1 font-normal text-slate-400">opcional</span>
            )}
          </label>
          {campo.tipo === "textarea" ? (
            <textarea
              id={`cli-${campo.nome}`}
              rows={3}
              value={valores[campo.nome] ?? ""}
              onChange={(e) => {
                setValores((antes) => ({ ...antes, [campo.nome]: e.target.value }));
                setSalvo(false);
              }}
              className="campo"
            />
          ) : (
            <input
              id={`cli-${campo.nome}`}
              type={campo.tipo ?? "text"}
              required={campo.obrigatorio}
              placeholder={campo.placeholder}
              value={valores[campo.nome] ?? ""}
              inputMode={campo.nome === "endereco.cep" ? "numeric" : undefined}
              onChange={(e) => {
                if (campo.nome === "endereco.cep") {
                  void aoMudarCep(e.target.value);
                  return;
                }
                setValores((antes) => ({ ...antes, [campo.nome]: e.target.value }));
                setSalvo(false);
              }}
              className="campo"
            />
          )}
          {campo.nome === "endereco.cep" ? <RecadoDoCep estado={cep} /> : null}
          {campo.ajuda ? <p className="ajuda">{campo.ajuda}</p> : null}
        </div>
        </Fragment>
      ))}

      {erro ? <p className="aviso-erro sm:col-span-2">{erro}</p> : null}
      {salvo && !mudou ? (
        <p className="text-sm text-emerald-700 sm:col-span-2">Salvo.</p>
      ) : null}

      <div className="sm:col-span-2">
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
