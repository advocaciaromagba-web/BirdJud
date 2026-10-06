"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export type ContratoNaTela = {
  id: string;
  clienteNome: string;
  tipo: string;
  resumo: string;
  forma: string;
  automatico: boolean;
  ativo: boolean;
  /** Linha por parcela do plano, ja emitida ou nao. */
  parcelas: Array<{
    numero: number;
    total: number;
    valor: string;
    vencimentoBR: string;
    emitida: boolean;
  }>;
  /** Por que o contrato nao gera parcela, quando nao gera. */
  motivo: string | null;
  proximaNumero: number | null;
  naJanela: boolean;
  atrasada: boolean;
  impedimentos: string[];
};

export type ClienteNaTela = { id: string; nome: string };

/**
 * Contratos de honorarios.
 *
 * O QUE ESTA TELA FAZ DE DIFERENTE: mostra o plano inteiro antes de qualquer
 * cobranca existir. Dá para ver as doze parcelas, as datas e os valores, e
 * conferir se bate com o contrato assinado — antes de o cliente receber a
 * primeira. Depois disso, uma parcela sai por vez.
 */
export function PainelHonorarios({
  contratos,
  clientes,
  temConta,
}: {
  contratos: ContratoNaTela[];
  clientes: ClienteNaTela[];
  temConta: boolean;
}) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [agindo, setAgindo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [tipo, setTipo] = useState("VALOR");
  const [aberto, setAberto] = useState(false);

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setAviso(null);
    setSalvando(true);
    const d = new FormData(evento.currentTarget);
    const formulario = evento.currentTarget;

    const resposta = await fetch("/api/honorarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clienteId: String(d.get("clienteId") ?? ""),
        tipo: String(d.get("tipo") ?? "VALOR"),
        valor: String(d.get("valor") ?? ""),
        percentual: String(d.get("percentual") ?? ""),
        parcelas: Number(d.get("parcelas") ?? 1),
        primeiroVencimento: String(d.get("primeiroVencimento") ?? "") || null,
        forma: String(d.get("forma") ?? "BOLETO"),
        emissaoAutomatica: d.get("emissaoAutomatica") === "on",
        descricao: String(d.get("descricao") ?? "") || null,
      }),
    });
    setSalvando(false);
    if (!resposta.ok) {
      const det = await resposta.json().catch(() => null);
      setErro(det?.erro ?? "Nao consegui gravar o contrato.");
      return;
    }
    formulario.reset();
    setTipo("VALOR");
    setAberto(false);
    setAviso("Contrato gravado. Confira o plano de parcelas abaixo.");
    router.refresh();
  }

  async function agir(id: string, corpo: Record<string, unknown>, feito: string) {
    setAgindo(id);
    setErro(null);
    setAviso(null);
    const resposta = await fetch(`/api/honorarios/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
    setAgindo(null);
    if (!resposta.ok) {
      const det = await resposta.json().catch(() => null);
      setErro(det?.erro ?? "Nao consegui concluir.");
      return;
    }
    setAviso(feito);
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <section className="cartao">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Contrato de honorarios</h2>
            <p className="mt-1 text-sm text-slate-600">
              O contrato diz o valor, a forma e quantas parcelas. O sistema
              monta o plano e emite uma parcela por vez, perto do vencimento —
              assim da para corrigir ou encerrar no meio sem deixar cobranca na
              rua.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="botao-secundario"
          >
            {aberto ? "Fechar" : "Novo contrato"}
          </button>
        </div>

        {!temConta ? (
          <p className="mt-3 text-sm text-amber-700">
            Conecte a conta de cobranca em Integracoes para emitir as parcelas.
            O contrato pode ser gravado antes disso.
          </p>
        ) : null}

        {aberto ? (
          <form onSubmit={salvar} className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label htmlFor="h-cliente" className="rotulo">
                Cliente
              </label>
              <select id="h-cliente" name="clienteId" required className="campo">
                <option value="">Escolha...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="h-tipo" className="rotulo">
                Tipo
              </label>
              <select
                id="h-tipo"
                name="tipo"
                className="campo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
              >
                <option value="VALOR">Valor fixo</option>
                <option value="PERCENTUAL">Percentual de exito</option>
                <option value="MISTO">Entrada + exito</option>
              </select>
            </div>

            <div>
              <label htmlFor="h-forma" className="rotulo">
                Forma
              </label>
              <select id="h-forma" name="forma" className="campo" defaultValue="BOLETO">
                <option value="BOLETO">Boleto</option>
                <option value="PIX">Pix</option>
                <option value="CARTAO">Cartao</option>
                <option value="QUALQUER">O cliente escolhe</option>
              </select>
            </div>

            {tipo !== "PERCENTUAL" ? (
              <>
                <div>
                  <label htmlFor="h-valor" className="rotulo">
                    {tipo === "MISTO" ? "Entrada (R$)" : "Valor (R$)"}
                  </label>
                  <input id="h-valor" name="valor" inputMode="decimal" className="campo" />
                </div>
                <div>
                  <label htmlFor="h-parcelas" className="rotulo">
                    Parcelas
                  </label>
                  <input
                    id="h-parcelas"
                    name="parcelas"
                    type="number"
                    min={1}
                    max={60}
                    defaultValue={1}
                    className="campo"
                  />
                </div>
                <div>
                  <label htmlFor="h-venc" className="rotulo">
                    Primeiro vencimento
                  </label>
                  <input id="h-venc" name="primeiroVencimento" type="date" className="campo" />
                </div>
              </>
            ) : null}

            {tipo !== "VALOR" ? (
              <div>
                <label htmlFor="h-perc" className="rotulo">
                  Exito (%)
                </label>
                <input id="h-perc" name="percentual" inputMode="decimal" className="campo" />
              </div>
            ) : null}

            <div className="md:col-span-2">
              <label htmlFor="h-desc" className="rotulo">
                Sobre o que (aparece na cobranca)
              </label>
              <input
                id="h-desc"
                name="descricao"
                maxLength={120}
                placeholder="acao trabalhista"
                className="campo"
              />
            </div>

            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input type="checkbox" name="emissaoAutomatica" className="h-4 w-4" />
              Emitir as parcelas sozinho, perto do vencimento
            </label>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={salvando}
                className="botao-principal disabled:opacity-50"
              >
                {salvando ? "Gravando..." : "Gravar contrato"}
              </button>
            </div>
          </form>
        ) : null}

        {aviso ? <p className="mt-3 text-sm text-emerald-700">{aviso}</p> : null}
        {erro ? <p className="aviso-erro mt-3">{erro}</p> : null}
      </section>

      <section>
        <h2 className="font-semibold">Contratos</h2>
        {contratos.length === 0 ? (
          <p className="vazio mt-3">Nenhum contrato de honorarios ainda.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {contratos.map((c) => (
              <li
                key={c.id}
                className={`rounded-[var(--raio)] border border-slate-200 bg-white px-4 py-3 ${c.ativo ? "" : "opacity-60"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {c.clienteNome}
                      <span className="ml-2 text-sm text-slate-600">{c.resumo}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {c.forma}
                      {c.automatico ? " · emite sozinho" : " · emite so por clique"}
                      {c.ativo ? "" : " · encerrado"}
                    </p>
                    {c.motivo ? (
                      <p className="mt-1 text-xs text-slate-600">{c.motivo}</p>
                    ) : null}
                    {c.atrasada ? (
                      <p className="mt-1 text-xs text-amber-700">
                        A parcela {c.proximaNumero} ja venceu e nunca foi
                        emitida: escolha a data antes de cobrar.
                      </p>
                    ) : null}
                    {c.impedimentos.length > 0 ? (
                      <p className="mt-1 text-xs text-amber-700">
                        Falta no cadastro: {c.impedimentos.join("; ")}.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {c.ativo && c.proximaNumero !== null && !c.atrasada ? (
                      <button
                        type="button"
                        disabled={agindo === c.id || c.impedimentos.length > 0}
                        onClick={() =>
                          agir(
                            c.id,
                            { acao: "EMITIR", antecipar: !c.naJanela },
                            `Parcela ${c.proximaNumero} emitida.`,
                          )
                        }
                        className="botao-principal disabled:opacity-50"
                      >
                        {c.naJanela
                          ? `Emitir a ${c.proximaNumero}a`
                          : `Antecipar a ${c.proximaNumero}a`}
                      </button>
                    ) : null}
                    {c.ativo ? (
                      <button
                        type="button"
                        disabled={agindo === c.id}
                        onClick={() => {
                          if (
                            !confirm(
                              "Encerrar o contrato? As parcelas que ainda nao sairam deixam de ser emitidas. As cobrancas ja emitidas continuam valendo.",
                            )
                          )
                            return;
                          agir(c.id, { acao: "ENCERRAR" }, "Contrato encerrado.");
                        }}
                        className="botao-secundario disabled:opacity-50"
                      >
                        Encerrar
                      </button>
                    ) : null}
                  </div>
                </div>

                {c.parcelas.length > 0 ? (
                  <ol className="mt-3 grid gap-1 border-t border-slate-100 pt-2">
                    {c.parcelas.map((p) => (
                      <li
                        key={p.numero}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className={p.emitida ? "text-slate-400" : "text-slate-700"}>
                          {p.numero}/{p.total} · {p.vencimentoBR}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums text-slate-600">{p.valor}</span>
                          <span
                            className={
                              p.emitida ? "text-emerald-700" : "text-slate-400"
                            }
                          >
                            {p.emitida ? "cobrada" : "a cobrar"}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
