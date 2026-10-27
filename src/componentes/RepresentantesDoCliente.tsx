"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
// Puro, sem banco: pode entrar no navegador.
import { PARENTESCOS, ROTULO_DO_PARENTESCO } from "@/lib/menor";

export type RepresentanteNaTela = {
  nome: string;
  cpf: string;
  rg: string;
  nacionalidade: string;
  estadoCivil: string;
  profissao: string;
  email: string;
  telefone: string;
  mesmoEnderecoDaEmpresa: boolean;
  qualificacao: string;
  /** So no cliente menor. */
  parentesco?: string;
};

const VAZIO: RepresentanteNaTela = {
  nome: "",
  cpf: "",
  rg: "",
  nacionalidade: "",
  estadoCivil: "",
  profissao: "",
  email: "",
  telefone: "",
  mesmoEnderecoDaEmpresa: true,
  qualificacao: "",
};

/**
 * Quem assina pela empresa — ou por um cliente menor de idade.
 *
 * Aparece so para pessoa juridica e para menor: pedir representante legal de
 * um adulto e pedir que alguem invente um dado. No menor, cada linha diz o
 * parentesco ("por sua genitora", "por seu genitor") e o endereco, quando o
 * mesmo, e o do menor.
 */
export function RepresentantesDoCliente({
  clienteId,
  iniciais,
  paraMenor = null,
}: {
  clienteId: string;
  iniciais: RepresentanteNaTela[];
  /** Texto do regime do menor ("12 anos — vai representado"), ou nulo para empresa. */
  paraMenor?: string | null;
}) {
  const menor = paraMenor !== null;
  const router = useRouter();
  const [linhas, setLinhas] = useState<RepresentanteNaTela[]>(
    iniciais.length > 0 ? iniciais : [{ ...VAZIO, parentesco: menor ? "GENITORA" : undefined }],
  );
  const [editando, setEditando] = useState(iniciais.length === 0);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function mudar(i: number, campo: keyof RepresentanteNaTela, valor: string | boolean) {
    setLinhas((antes) =>
      antes.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)),
    );
    setErro(null);
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSalvando(true);

    const resposta = await fetch("/api/representantes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clienteId, representantes: linhas }),
    });
    setSalvando(false);

    const detalhe = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      setErro(detalhe?.erro ?? "Não consegui gravar.");
      return;
    }
    setEditando(false);
    router.refresh();
  }

  return (
    <section className="cartao">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{menor ? "Quem representa o menor" : "Quem assina pela empresa"}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {menor
              ? `Quem exerce o poder familiar: entra na qualificação de todo documento do menor e é quem assina. ${paraMenor}.`
              : "Entra na qualificação da peça e na procuração. Mais de um quando os sócios assinam em conjunto."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditando((e) => !e)}
          className={editando ? "botao-secundario" : "botao-principal"}
        >
          {editando ? "Cancelar" : iniciais.length > 0 ? "Editar" : "Cadastrar"}
        </button>
      </div>

      {!editando ? (
        iniciais.length === 0 ? (
          <p className="mt-3 text-sm text-amber-700">
            {menor
              ? "Ninguém cadastrado. Sem quem represente, nenhum documento do menor é gerado: ato sem representação é nulo ou anulável."
              : "Nenhum representante cadastrado. Sem isso, a qualificação da peça sai incompleta e a procuração não tem quem assine."}
          </p>
        ) : (
          <ul className="lista mt-3">
            {iniciais.map((r, i) => (
              <li key={`${r.cpf}-${i}`} className="py-2 text-sm">
                <span className="font-medium">
                  {r.nome}
                  {menor && r.parentesco ? (
                    <span className="font-normal text-slate-500">
                      {" "}
                      · {ROTULO_DO_PARENTESCO[r.parentesco as keyof typeof ROTULO_DO_PARENTESCO] ?? r.parentesco}
                    </span>
                  ) : null}
                </span>
                <span className="block text-xs text-slate-500">
                  {r.qualificacao}
                </span>
                {r.email ? (
                  <span className="block text-xs text-slate-500">
                    assina por {r.email}
                  </span>
                ) : (
                  <span className="block text-xs text-amber-700">
                    sem e-mail: a assinatura eletrônica não tem para onde ir
                  </span>
                )}
              </li>
            ))}
          </ul>
        )
      ) : (
        <form onSubmit={salvar} className="mt-4 grid gap-6">
          {linhas.map((linha, i) => (
            <div
              key={i}
              className="rounded-[var(--raio)] border border-slate-200 p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {i + 1}º {menor ? "responsável" : "representante"}
                </p>
                {linhas.length > 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setLinhas((antes) => antes.filter((_, j) => j !== i))
                    }
                    className="text-xs text-slate-500 hover:underline"
                  >
                    remover
                  </button>
                ) : null}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {menor ? (
                  <div className="sm:col-span-2">
                    <label className="rotulo" htmlFor={`rp-par-${i}`}>
                      Parentesco
                    </label>
                    <select
                      id={`rp-par-${i}`}
                      value={linha.parentesco ?? "GENITORA"}
                      onChange={(e) => mudar(i, "parentesco", e.target.value)}
                      className="campo"
                    >
                      {PARENTESCOS.map((p) => (
                        <option key={p} value={p}>
                          {ROTULO_DO_PARENTESCO[p]}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <label className="rotulo" htmlFor={`rp-nome-${i}`}>
                    Nome
                  </label>
                  <input
                    id={`rp-nome-${i}`}
                    value={linha.nome}
                    onChange={(e) => mudar(i, "nome", e.target.value)}
                    className="campo"
                  />
                </div>
                <div>
                  <label className="rotulo" htmlFor={`rp-cpf-${i}`}>
                    CPF
                  </label>
                  <input
                    id={`rp-cpf-${i}`}
                    value={linha.cpf}
                    onChange={(e) => mudar(i, "cpf", e.target.value)}
                    className="campo"
                  />
                </div>
                <div>
                  <label className="rotulo" htmlFor={`rp-rg-${i}`}>
                    RG <span className="font-normal text-slate-500">opcional</span>
                  </label>
                  <input
                    id={`rp-rg-${i}`}
                    value={linha.rg}
                    onChange={(e) => mudar(i, "rg", e.target.value)}
                    className="campo"
                  />
                </div>
                <div>
                  <label className="rotulo" htmlFor={`rp-nac-${i}`}>
                    Nacionalidade
                  </label>
                  <input
                    id={`rp-nac-${i}`}
                    value={linha.nacionalidade}
                    onChange={(e) => mudar(i, "nacionalidade", e.target.value)}
                    placeholder="brasileira"
                    className="campo"
                  />
                </div>
                <div>
                  <label className="rotulo" htmlFor={`rp-ec-${i}`}>
                    Estado civil
                  </label>
                  <input
                    id={`rp-ec-${i}`}
                    value={linha.estadoCivil}
                    onChange={(e) => mudar(i, "estadoCivil", e.target.value)}
                    className="campo"
                  />
                </div>
                <div>
                  <label className="rotulo" htmlFor={`rp-prof-${i}`}>
                    Profissão
                  </label>
                  <input
                    id={`rp-prof-${i}`}
                    value={linha.profissao}
                    onChange={(e) => mudar(i, "profissao", e.target.value)}
                    className="campo"
                  />
                </div>
                <div>
                  <label className="rotulo" htmlFor={`rp-tel-${i}`}>
                    Telefone
                  </label>
                  <input
                    id={`rp-tel-${i}`}
                    value={linha.telefone}
                    onChange={(e) => mudar(i, "telefone", e.target.value)}
                    className="campo"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="rotulo" htmlFor={`rp-email-${i}`}>
                    E-mail
                  </label>
                  <input
                    id={`rp-email-${i}`}
                    type="email"
                    value={linha.email}
                    onChange={(e) => mudar(i, "email", e.target.value)}
                    className="campo"
                  />
                  <p className="ajuda">
                    E por ele que a assinatura eletrônica chega.
                  </p>
                </div>
              </div>
            </div>
          ))}

          <div>
            <button
              type="button"
              onClick={() => setLinhas((antes) => [...antes, { ...VAZIO, parentesco: menor ? "GENITOR" : undefined }])}
              className="botao-secundario"
            >
              {menor ? "Mais um responsável" : "Mais um representante"}
            </button>
          </div>

          {erro ? <p className="aviso-erro">{erro}</p> : null}

          <div>
            <button
              type="submit"
              disabled={salvando}
              className="botao-principal disabled:opacity-50"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
