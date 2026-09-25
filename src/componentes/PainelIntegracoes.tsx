"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type CampoConector = {
  nome: string;
  rotulo: string;
  tipo: "text" | "password" | "textarea";
  obrigatorio: boolean;
  ajuda?: string;
};

export type IntegracaoNaTela = {
  tipo: string;
  rotulo: string;
  descricao: string;
  campos: CampoConector[];
  conectada: boolean;
  status: string | null;
  erro: string | null;
  verificadoEm: string | null;
};

function Selo({ status }: { status: string | null }) {
  if (status === "OK") {
    return (
      <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">
        conectada
      </span>
    );
  }
  if (status === "ERRO") {
    return (
      <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">
        com erro
      </span>
    );
  }
  return (
    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
      nao conectada
    </span>
  );
}

export function PainelIntegracoes({
  integracoes,
}: {
  integracoes: IntegracaoNaTela[];
}) {
  if (integracoes.length === 0) {
    return (
      <p className="mt-6 text-slate-600">
        Nenhuma integracao disponivel: elas aparecem conforme os modulos
        contratados.
      </p>
    );
  }

  return (
    <div className="mt-6 grid gap-4">
      {integracoes.map((integracao) => (
        <Cartao key={integracao.tipo} integracao={integracao} />
      ))}
    </div>
  );
}

function Cartao({ integracao }: { integracao: IntegracaoNaTela }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState<{ texto: string; ok: boolean } | null>(
    null,
  );

  async function chamar(rota: string, opcoes: RequestInit) {
    setOcupado(true);
    setRecado(null);
    const resposta = await fetch(rota, opcoes);
    const json = await resposta.json().catch(() => ({}));
    setOcupado(false);
    router.refresh();
    return { resposta, json } as const;
  }

  async function conectar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const formData = new FormData(form);
    const dados: Record<string, string> = {};
    for (const campo of integracao.campos) {
      dados[campo.nome] = String(formData.get(campo.nome) ?? "");
    }

    const { resposta, json } = await chamar("/api/integracoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: integracao.tipo, dados }),
    });

    if (!resposta.ok) {
      setRecado({
        texto: json.erro ?? "Nao foi possivel conectar.",
        ok: false,
      });
      return;
    }
    // A credencial fica guardada mesmo quando o teste falha: o escritorio
    // corrige o que faltou e testa de novo, sem digitar tudo outra vez.
    setRecado({ texto: json.detalhe, ok: json.ok });
    if (json.ok) {
      form.reset();
      setAberto(false);
    }
  }

  async function testar() {
    const { resposta, json } = await chamar(
      `/api/integracoes/${integracao.tipo}/testar`,
      {
        method: "POST",
      },
    );
    setRecado({
      texto: resposta.ok ? json.detalhe : (json.erro ?? "Falha no teste."),
      ok: resposta.ok && json.ok,
    });
  }

  async function desconectar() {
    await chamar(`/api/integracoes/${integracao.tipo}`, { method: "DELETE" });
    setRecado({ texto: "Integracao desconectada.", ok: true });
  }

  return (
    <section className="cartao-aperto">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">{integracao.rotulo}</h2>
        <Selo status={integracao.status} />
      </div>
      <p className="mt-1 text-sm text-slate-600">{integracao.descricao}</p>

      {integracao.erro ? (
        <p className="mt-2 text-sm text-red-700">
          Ultimo erro: {integracao.erro}
        </p>
      ) : null}
      {integracao.verificadoEm ? (
        <p className="mt-1 text-xs text-slate-500">
          Verificada em{" "}
          {new Date(integracao.verificadoEm).toLocaleString("pt-BR")}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {integracao.campos.length > 0 ? (
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="botao-principal"
          >
            {integracao.conectada ? "Trocar credenciais" : "Conectar"}
          </button>
        ) : null}
        {integracao.conectada ? (
          <>
            <button
              type="button"
              onClick={testar}
              disabled={ocupado}
              className="rounded border border-slate-400 px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
            >
              {ocupado ? "Testando..." : "Testar conexao"}
            </button>
            <button
              type="button"
              onClick={desconectar}
              disabled={ocupado}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-60"
            >
              Desconectar
            </button>
          </>
        ) : null}
      </div>

      {recado ? (
        <p
          className={`mt-3 text-sm ${recado.ok ? "text-green-700" : "text-red-700"}`}
        >
          {recado.texto}
        </p>
      ) : null}

      {aberto ? (
        <form
          onSubmit={conectar}
          className="mt-4 grid gap-3 border-t border-slate-200 pt-4"
        >
          {integracao.campos.map((campo) => (
            <label key={campo.nome} className="grid gap-1 text-sm">
              {campo.rotulo}
              {campo.ajuda ? (
                <span className="text-xs text-slate-500">{campo.ajuda}</span>
              ) : null}
              {campo.tipo === "textarea" ? (
                <textarea
                  name={campo.nome}
                  required={campo.obrigatorio}
                  rows={4}
                  className="rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                />
              ) : (
                <input
                  name={campo.nome}
                  type={campo.tipo}
                  required={campo.obrigatorio}
                  autoComplete="off"
                  className="campo"
                />
              )}
            </label>
          ))}
          <button
            type="submit"
            disabled={ocupado}
            className="botao-principal justify-self-start"
          >
            {ocupado ? "Conectando..." : "Conectar e testar"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
