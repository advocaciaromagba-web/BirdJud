"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type NotaNaTela = {
  id: string;
  numero: string;
  cliente: string;
  descricao: string;
  valor: string;
  status: string;
  data: string;
  chaveAcesso: string | null;
  linkPdf: string | null;
  erro: string | null;
};

export type Fiscal = {
  razaoSocial: string;
  cnpj: string;
  inscricaoMunicipal: string;
  codigoMunicipio: string;
  regime: string;
  codigoTributacao: string;
  aliquota: string;
  serie: string;
  ambiente: string;
} | null;

const CORES: Record<string, string> = {
  EMITIDA: "bg-emerald-100 text-emerald-800",
  RECUSADA: "bg-rose-100 text-rose-800",
  CANCELADA: "bg-slate-100 text-slate-500",
  RASCUNHO: "bg-slate-100 text-slate-700",
  INDETERMINADA: "bg-amber-100 text-amber-900",
};

export function PainelNotas({
  notas,
  clientes,
  fiscal,
  podeConfigurar,
}: {
  notas: NotaNaTela[];
  clientes: { id: string; nome: string; temDocumento: boolean }[];
  fiscal: Fiscal;
  podeConfigurar: boolean;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function chamar(
    rota: string,
    metodo: string,
    corpo: unknown,
    aoDarCerto: () => void,
  ) {
    setOcupado(true);
    setErro(null);
    const resposta = await fetch(rota, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const json = await resposta.json().catch(() => ({}));
    setOcupado(false);
    if (!resposta.ok) {
      setErro(json.erro ?? "Nao foi possivel concluir.");
      return;
    }
    aoDarCerto();
    router.refresh();
  }

  function emitir(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const dados = new FormData(form);
    void chamar(
      "/api/nfse",
      "POST",
      {
        clienteId: String(dados.get("clienteId") ?? ""),
        descricao: String(dados.get("descricao") ?? ""),
        valor: String(dados.get("valor") ?? ""),
      },
      () => form.reset(),
    );
  }

  function salvarCadastro(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    const campos = Object.fromEntries(
      [
        "razaoSocial",
        "cnpj",
        "inscricaoMunicipal",
        "codigoMunicipio",
        "regime",
        "codigoTributacao",
        "aliquota",
        "serie",
        "ambiente",
      ].map((campo) => [campo, String(dados.get(campo) ?? "")]),
    );
    void chamar(
      "/api/nfse",
      "PATCH",
      { acao: "CADASTRO", dados: campos },
      () => {},
    );
  }

  return (
    <>
      {podeConfigurar ? (
        <details className="mt-4" open={!fiscal}>
          <summary className="cursor-pointer text-sm font-semibold text-marca">
            Cadastro fiscal{" "}
            {fiscal ? "" : "(obrigatorio antes da primeira nota)"}
          </summary>
          <p className="mt-2 text-sm text-slate-500">
            Estes dados saem impressos na nota. O codigo do servico e a aliquota
            vem do contador do escritorio — nao ha padrao que sirva para todo
            mundo.
          </p>
          <form
            onSubmit={salvarCadastro}
            className="cartao-aperto mt-3 grid gap-3 sm:grid-cols-2"
          >
            <Campo
              nome="razaoSocial"
              rotulo="Razao social"
              valor={fiscal?.razaoSocial}
            />
            <Campo nome="cnpj" rotulo="CNPJ" valor={fiscal?.cnpj} />
            <Campo
              nome="inscricaoMunicipal"
              rotulo="Inscricao municipal"
              valor={fiscal?.inscricaoMunicipal}
            />
            <Campo
              nome="codigoMunicipio"
              rotulo="Codigo IBGE do municipio (7 digitos)"
              valor={fiscal?.codigoMunicipio}
            />
            <label className="grid gap-1 text-sm">
              Regime
              <select
                name="regime"
                defaultValue={fiscal?.regime ?? "SIMPLES"}
                className="campo"
              >
                <option value="SIMPLES">Simples Nacional</option>
                <option value="MEI">MEI</option>
                <option value="NORMAL">Normal</option>
              </select>
            </label>
            <Campo
              nome="codigoTributacao"
              rotulo="Codigo do servico"
              valor={fiscal?.codigoTributacao}
            />
            <Campo
              nome="aliquota"
              rotulo="Aliquota do ISS (%)"
              valor={fiscal?.aliquota}
            />
            <Campo nome="serie" rotulo="Serie" valor={fiscal?.serie ?? "1"} />
            <label className="grid gap-1 text-sm">
              Ambiente
              <select
                name="ambiente"
                defaultValue={fiscal?.ambiente ?? "HOMOLOGACAO"}
                className="campo"
              >
                <option value="HOMOLOGACAO">
                  Homologacao (sem valor fiscal)
                </option>
                <option value="PRODUCAO">Producao</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={ocupado}
              className="botao-principal justify-self-start sm:col-span-2"
            >
              Guardar cadastro
            </button>
          </form>
        </details>
      ) : null}

      {fiscal ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-marca">
            Emitir nota
          </summary>
          <form onSubmit={emitir} className="cartao-aperto mt-3 grid gap-3">
            <label className="grid gap-1 text-sm">
              Cliente
              <select name="clienteId" required className="campo">
                <option value="">—</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.temDocumento
                      ? cliente.nome
                      : `${cliente.nome} (sem CPF/CNPJ)`}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Descricao do servico
              <input name="descricao" required className="campo" />
            </label>
            <label className="grid gap-1 text-sm">
              Valor (R$)
              <input name="valor" required className="campo" />
            </label>
            <button
              type="submit"
              disabled={ocupado}
              className="botao-principal justify-self-start"
            >
              {ocupado ? "Emitindo…" : "Emitir nota"}
            </button>
          </form>
        </details>
      ) : null}

      {erro ? <p className="mt-3 text-sm text-red-700">{erro}</p> : null}

      {notas.length === 0 ? (
        <p className="mt-6 text-slate-600">Nenhuma nota emitida ainda.</p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-200">
          {notas.map((nota) => (
            <li
              key={nota.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3"
            >
              <span
                className={`rounded px-2 py-0.5 text-xs font-semibold ${CORES[nota.status] ?? CORES.RASCUNHO}`}
              >
                {nota.status}
              </span>
              <span className="font-semibold">{nota.numero}</span>
              <span>{nota.cliente}</span>
              <span className="text-slate-500">{nota.descricao}</span>
              <span className="ml-auto">{nota.valor}</span>
              <span className="w-full text-sm text-slate-500">
                {nota.data}
                {nota.chaveAcesso ? (
                  <span className="break-all"> · chave {nota.chaveAcesso}</span>
                ) : null}
                {nota.linkPdf ? (
                  <a
                    href={nota.linkPdf}
                    target="_blank"
                    rel="noreferrer"
                    className="-my-1 ml-2 py-2 text-marca hover:underline"
                  >
                    PDF
                  </a>
                ) : null}
                {nota.status === "EMITIDA" ? (
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() =>
                      confirm("Cancelar esta nota na prefeitura?") &&
                      chamar(
                        "/api/nfse",
                        "PATCH",
                        { acao: "CANCELAR", id: nota.id },
                        () => {},
                      )
                    }
                    className="-my-1 ml-3 py-2 text-slate-500 hover:text-rose-700 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                ) : null}
              </span>
              {nota.status === "INDETERMINADA" ? (
                <span className="w-full text-sm text-amber-800">
                  Resultado do envio incerto. Consulte esta DPS no ambiente da NFS-e antes de emitir outra nota.
                </span>
              ) : null}
              {nota.erro ? (
                <span className="w-full text-sm text-rose-700">
                  {nota.erro}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Campo({
  nome,
  rotulo,
  valor,
}: {
  nome: string;
  rotulo: string;
  valor?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      {rotulo}
      <input
        name={nome}
        defaultValue={valor ?? ""}
        required
        className="campo"
      />
    </label>
  );
}
