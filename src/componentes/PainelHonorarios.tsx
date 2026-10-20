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
    /** Ja entrou no financeiro como recebida. */
    recebida: boolean;
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
 * Contratos de honorarios de UM cliente, na ficha dele.
 *
 * O contrato nasce aqui, junto da procuracao, da declaracao e do contrato em
 * documento. Gravado, as parcelas entram sozinhas no financeiro, A RECEBER,
 * com as datas — e a baixa vem da cobranca paga ou da conferencia do extrato.
 *
 * O QUE ESTA TELA FAZ DE DIFERENTE: mostra o plano inteiro antes de qualquer
 * cobranca existir. Dá para ver as doze parcelas, as datas e os valores, e
 * conferir se bate com o contrato assinado — antes de o cliente receber a
 * primeira. Depois disso, uma parcela sai por vez.
 */
export function PainelHonorarios({
  contratos,
  cliente,
  temConta,
  temCobrancas,
  temFinanceiro,
  temNotaFiscal = false,
}: {
  contratos: ContratoNaTela[];
  cliente: ClienteNaTela;
  temConta: boolean;
  /** Modulo COBRANCAS: emitir boleto/Pix pela conta do escritorio. */
  temCobrancas: boolean;
  /** Modulo FINANCEIRO: as parcelas entram a receber no livro-caixa. */
  temFinanceiro: boolean;
  /** Modulo NFSE: parcela recebida oferece preparar a nota. */
  temNotaFiscal?: boolean;
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
        clienteId: cliente.id,
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
      setErro(det?.erro ?? "Não consegui gravar o contrato.");
      return;
    }
    formulario.reset();
    setTipo("VALOR");
    setAberto(false);
    setAviso(
      temFinanceiro
        ? "Contrato gravado. As parcelas já estão no financeiro, a receber. Confira o plano abaixo."
        : "Contrato gravado. Confira o plano de parcelas abaixo.",
    );
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
      setErro(det?.erro ?? "Não consegui concluir.");
      return;
    }
    setAviso(feito);
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Honorários</h2>
            <p className="mt-1 text-sm text-slate-600">
              O valor, a forma e as parcelas combinadas com {cliente.nome}. E
              daqui que sai o contrato de honorários em documento
              {temFinanceiro
                ? ", e as parcelas entram no financeiro a receber, com as datas, para a conferência do extrato dar baixa"
                : ""}
              .
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

        {temCobrancas && !temConta ? (
          <p className="mt-3 text-sm text-amber-700">
            Para emitir boleto ou Pix das parcelas, conecte a conta de cobrança
            em Integrações. O contrato pode ser gravado antes disso.
          </p>
        ) : null}

        {aberto ? (
          <form onSubmit={salvar} className="mt-4 grid gap-3 md:grid-cols-2">
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
                <option value="PERCENTUAL">Percentual de êxito</option>
                <option value="MISTO">Entrada + êxito</option>
              </select>
            </div>

            <div>
              <label htmlFor="h-forma" className="rotulo">
                Forma
              </label>
              <select id="h-forma" name="forma" className="campo" defaultValue="BOLETO">
                <option value="BOLETO">Boleto</option>
                <option value="PIX">Pix</option>
                <option value="CARTAO">Cartão</option>
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
                Sobre o que (aparece na cobrança)
              </label>
              <input
                id="h-desc"
                name="descricao"
                maxLength={120}
                placeholder="ação trabalhista"
                className="campo"
              />
            </div>

            {temCobrancas ? (
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input type="checkbox" name="emissaoAutomatica" className="h-4 w-4" />
                Emitir boleto/Pix das parcelas sozinho, perto do vencimento
              </label>
            ) : null}

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
        {contratos.length === 0 ? (
          <p className="vazio">Nenhum contrato de honorários com este cliente ainda.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {contratos.map((c) => (
              <li
                key={c.id}
                className={`rounded-[var(--raio)] border border-slate-200 bg-white px-4 py-3 ${c.ativo ? "" : "opacity-60"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{c.resumo}</p>
                    <p className="text-xs text-slate-500">
                      {c.forma}
                      {temCobrancas ? (c.automatico ? " · emite sozinho" : " · emite só por clique") : ""}
                      {c.ativo ? "" : " · encerrado"}
                    </p>
                    {c.motivo ? (
                      <p className="mt-1 text-xs text-slate-600">{c.motivo}</p>
                    ) : null}
                    {c.atrasada ? (
                      <p className="mt-1 text-xs text-amber-700">
                        A parcela {c.proximaNumero} já venceu e nunca foi
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
                    {temCobrancas && c.ativo && c.proximaNumero !== null && !c.atrasada ? (
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
                              "Encerrar o contrato? As parcelas que ainda não foram cobradas saem do financeiro (a receber). Cobranças já emitidas e parcelas recebidas continuam valendo.",
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
                        <span className={p.emitida ? "text-slate-500" : "text-slate-700"}>
                          {p.numero}/{p.total} · {p.vencimentoBR}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums text-slate-600">{p.valor}</span>
                          <span
                            className={
                              p.recebida
                                ? "font-semibold text-emerald-700"
                                : p.emitida
                                  ? "text-sky-700"
                                  : "text-slate-500"
                            }
                          >
                            {p.recebida ? "recebida" : p.emitida ? "cobrança emitida" : "a receber"}
                          </span>
                          {p.recebida && temNotaFiscal ? (
                            <a
                              className="text-marca underline"
                              href={`/notas?${new URLSearchParams({
                                clienteId: cliente.id,
                                valor: p.valor.replace(/[^\d,]/g, ""),
                                descricao: `Honorários advocatícios — ${c.resumo}, parcela ${p.numero}/${p.total}`,
                              }).toString()}`}
                            >
                              preparar nota
                            </a>
                          ) : null}
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
