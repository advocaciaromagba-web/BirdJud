"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type LinhaNaTela = {
  clienteId: string;
  nome: string;
  codigo: string | null;
  whatsapp: string | null;
  temTelefone: boolean;
  temEmail: boolean;
  aviso: string;
  podeTestarAviso: boolean;
  ultima: string | null;
};

const semAcento = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * A lista de clientes com o codigo de cada um e o que se pode fazer com ele.
 * Nenhuma acao daqui aceita destino: o codigo so vai para o contato que ja
 * esta no cadastro.
 */
export function PainelDeCodigos({ linhas, ehAdmin }: { linhas: LinhaNaTela[]; ehAdmin: boolean }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [recado, setRecado] = useState<{ ok: boolean; texto: string } | null>(null);

  const visiveis = useMemo(() => {
    const termo = semAcento(busca.trim());
    return termo ? linhas.filter((l) => semAcento(`${l.nome} ${l.codigo ?? ""}`).includes(termo)) : linhas;
  }, [linhas, busca]);
  const semCodigo = linhas.filter((l) => !l.codigo).length;

  async function pedir(chave: string, url: string, corpo?: unknown) {
    setOcupado(chave);
    setRecado(null);
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo ?? {}) });
      const j = await r.json().catch(() => ({}));
      setRecado(r.ok ? { ok: j.ok !== false, texto: j.texto ?? "Feito." } : { ok: false, texto: j.erro ?? "Não deu certo." });
      if (r.ok) router.refresh();
    } finally {
      setOcupado(null);
    }
  }
  const acao = (l: LinhaNaTela, qual: string) => pedir(`${l.clienteId}:${qual}`, `/api/codigos/${l.clienteId}`, { acao: qual });

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="campo max-w-sm"
          placeholder="Buscar cliente ou código…"
          aria-label="Buscar cliente ou código"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {semCodigo ? (
          <button type="button" className="botao-principal" disabled={ocupado !== null} onClick={() => pedir("faltantes", "/api/codigos")}>
            {ocupado === "faltantes" ? "Criando…" : `Criar o código dos ${semCodigo} cliente(s) que não têm`}
          </button>
        ) : null}
      </div>
      {recado ? (
        <p role="status" className={`mt-3 text-sm ${recado.ok ? "text-emerald-700" : "text-red-700"}`}>
          {recado.texto}
        </p>
      ) : null}

      {visiveis.length === 0 ? (
        <p className="vazio mt-4">{linhas.length ? "Nenhum cliente com esse nome ou código." : "Nenhum cliente cadastrado ainda."}</p>
      ) : (
        <div className="cartao mt-4 overflow-x-auto p-0">
          <table className="tabela">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Código</th>
                <th>Dizer o código</th>
                <th>Entregar de novo</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => (
                <tr key={l.clienteId}>
                  <td className="font-medium">{l.nome}</td>
                  <td>
                    {l.codigo ? (
                      <span className="whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 font-mono text-sm font-semibold tracking-wide text-white">{l.codigo}</span>
                    ) : (
                      <button type="button" className="text-sm underline" disabled={ocupado !== null} onClick={() => acao(l, "gerar")}>
                        criar código
                      </button>
                    )}
                  </td>
                  <td>
                    {l.whatsapp ? (
                      <a href={l.whatsapp} target="_blank" rel="noopener noreferrer" className="botao-secundario whitespace-nowrap text-sm">
                        Abrir WhatsApp com o código
                      </a>
                    ) : (
                      <span className="text-xs text-slate-500">{l.codigo ? (l.temTelefone ? "telefone do cadastro inválido" : "sem telefone no cadastro") : "—"}</span>
                    )}
                  </td>
                  <td>
                    {l.codigo ? (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                        <button type="button" className="underline" disabled={ocupado !== null} onClick={() => acao(l, "pessoalmente")}>
                          entreguei pessoalmente
                        </button>
                        {l.temEmail ? (
                          <button
                            type="button"
                            className="underline"
                            disabled={ocupado !== null}
                            onClick={() => window.confirm(`Enviar o código de ${l.nome} para o e-mail que está no cadastro?`) && acao(l, "email")}
                          >
                            {ocupado === `${l.clienteId}:email` ? "enviando…" : "enviar ao e-mail do cadastro"}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500">sem e-mail: só pessoalmente</span>
                        )}
                        {ehAdmin ? (
                          <button
                            type="button"
                            className="text-red-700 underline"
                            disabled={ocupado !== null}
                            onClick={() =>
                              window.confirm(`Trocar o código de ${l.nome}? O código atual deixa de valer agora, e o novo precisa ser entregue ao cliente.`) && acao(l, "trocar")
                            }
                          >
                            trocar
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                  <td className="text-sm text-slate-600">
                    {l.aviso}
                    {l.ultima ? <span className="block text-xs text-slate-500">última entrega: {l.ultima}</span> : null}
                    {ehAdmin && l.podeTestarAviso ? (
                      <button
                        type="button"
                        className="mt-0.5 block text-xs underline"
                        disabled={ocupado !== null}
                        onClick={() => window.confirm(`Enviar o 1º aviso (com o código) só para ${l.nome}, pelos contatos do cadastro?`) && acao(l, "primeiro-aviso")}
                      >
                        {ocupado === `${l.clienteId}:primeiro-aviso` ? "enviando…" : "enviar o 1º aviso só a este"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
