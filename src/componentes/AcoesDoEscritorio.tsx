"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
// Catalogo puro: importar de @/lib/faixas ou @/lib/modulos traria o Prisma
// para o bundle do navegador.
import { FAIXAS, MODULOS } from "@/lib/catalogo";
import { PLANO, PLANOS, modulosDoPlano, planoExato } from "@/lib/planos";
import { ROTULO_DO_MODULO } from "@/lib/rotulos";
import type { Modulo } from "@/lib/catalogo";

async function chamar(rota: string, corpo: unknown) {
  const resposta = await fetch(rota, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const json = await resposta.json().catch(() => ({}));
  return { ok: resposta.ok, json } as const;
}

export function AcoesDoEscritorio({
  escritorioId,
  faixaAtual,
  modulos,
  emCortesia = false,
  encerrado = false,
  ciclo = null,
  valorCentavos = 0,
  emTeste = false,
  descontos = { anual: "10%", trimestral: "5%" },
  cupom = null,
}: {
  escritorioId: string;
  faixaAtual: string;
  modulos: { modulo: string; ativo: boolean }[];
  /** Assinatura em cortesia: usa sem pagar. */
  emCortesia?: boolean;
  /** Escritorio encerrado (ainda nao apagado). */
  encerrado?: boolean;
  /** MENSAL | ANUAL; null sem assinatura. */
  ciclo?: string | null;
  /** Valor fechado da mensalidade; 0 = tabela. */
  valorCentavos?: number;
  /** Ainda no periodo de teste. */
  emTeste?: boolean;
  /** Descontos de ciclo da tabela vigente, ja em texto ("10%"). */
  descontos?: { anual: string; trimestral: string };
  /** Cupom aplicado na assinatura, ja descrito ("BOASVINDAS, 20%, até 23/01/2027"). */
  cupom?: string | null;
}) {
  const router = useRouter();
  const [recado, setRecado] = useState<{ texto: string; ok: boolean } | null>(
    null,
  );
  const [ocupado, setOcupado] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [isentoAte, setIsentoAte] = useState("");
  const [codigoDoCupom, setCodigoDoCupom] = useState("");
  const [motivoDoEncerramento, setMotivoDoEncerramento] = useState("");
  const [exclusao, setExclusao] = useState({ aberta: false, confirmacao: "", motivo: "" });

  async function excluir() {
    if (!window.confirm("Excluir definitivamente? Isto não se desfaz.")) return;
    setOcupado(true);
    setRecado(null);
    const { ok, json } = await chamar(`/api/plataforma/escritorios/${escritorioId}`, {
      acao: "excluir",
      confirmacao: exclusao.confirmacao,
      motivo: exclusao.motivo,
    });
    setOcupado(false);
    if (!ok) {
      setRecado({ texto: json.erro ?? "Falhou.", ok: false });
      return;
    }
    window.alert(json.detalhe ?? "Excluído.");
    router.push("/plataforma/escritorios");
  }
  const [valor, setValor] = useState(valorCentavos ? (valorCentavos / 100).toFixed(2).replace(".", ",") : "");
  const contratados = new Map(modulos.map((m) => [m.modulo, m.ativo]));
  const ativos = modulos
    .filter((m) => m.ativo)
    .map((m) => m.modulo as Modulo)
    .filter((m) => m !== "NUCLEO");
  const planoAtual = planoExato(ativos);

  async function agir(corpo: Record<string, unknown>) {
    setOcupado(true);
    setRecado(null);
    const { ok, json } = await chamar(
      `/api/plataforma/escritorios/${escritorioId}`,
      corpo,
    );
    setOcupado(false);
    setRecado({
      texto: ok ? (json.detalhe ?? "Feito.") : (json.erro ?? "Falhou."),
      ok,
    });
    router.refresh();
  }

  return (
    <section className="cartao-aperto mt-6 text-sm">
      <h2 className="font-semibold">Ações da plataforma</h2>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-slate-600">Faixa:</span>
        {FAIXAS.map((faixa) => (
          <button
            key={faixa}
            type="button"
            disabled={ocupado || faixa === faixaAtual}
            onClick={() => agir({ acao: "faixa", faixa })}
            className={`rounded border px-2 py-1 text-xs ${
              faixa === faixaAtual
                ? "border-marca bg-marca/10 font-semibold text-marca"
                : "border-slate-300"
            } disabled:opacity-60`}
          >
            {faixa}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <p className="text-slate-600">
          Plano{planoAtual ? `: ${PLANO[planoAtual].rotulo}` : " (montado)"}
        </p>
        <p className="ajuda">
          Aplicar um plano diz o conjunto inteiro: o que não esta nele sai. O
          valor da assinatura não muda sozinho.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PLANOS.map((plano) => (
            <button
              key={plano}
              type="button"
              disabled={ocupado || plano === planoAtual}
              onClick={() => agir({ acao: "plano", plano })}
              className={`rounded border px-2 py-1 text-xs ${
                plano === planoAtual
                  ? "border-marca bg-marca/10 font-semibold text-marca"
                  : "border-slate-300"
              } disabled:opacity-60`}
              title={modulosDoPlano(plano)
                .map((modulo) => ROTULO_DO_MODULO[modulo])
                .join(", ")}
            >
              {PLANO[plano].rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <p className="text-slate-600">Módulos contratados:</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {MODULOS.filter((modulo) => modulo !== "NUCLEO").map((modulo) => {
            const ativo = contratados.get(modulo) === true;
            return (
              <button
                key={modulo}
                type="button"
                disabled={ocupado}
                onClick={() => agir({ acao: "modulo", modulo, ativo: !ativo })}
                className={`rounded border px-2 py-1 text-xs ${
                  ativo
                    ? "border-green-600 bg-green-50 text-green-800"
                    : "border-slate-300"
                } disabled:opacity-60`}
              >
                {ativo ? "✓ " : ""}
                {ROTULO_DO_MODULO[modulo as Modulo] ?? modulo}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={ocupado}
          onClick={() => agir({ acao: "regua" })}
          className="rounded border border-slate-400 px-3 py-1.5 font-semibold disabled:opacity-60"
        >
          Passar a regua agora
        </button>
      </div>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <p className="font-semibold">Cortesia</p>
        <p className="mt-1 text-slate-600">
          Usa sem pagar, sem prazo ou até uma data (isenção): nenhuma fatura é gerada, o escritório fica ativo e sai da
          receita e da previsão do painel.
        </p>
        {emCortesia ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => agir({ acao: "cortesia", ligar: false })}
            className="mt-2 rounded border border-slate-400 px-3 py-1.5 font-semibold disabled:opacity-60"
          >
            Retirar a cortesia (volta a cobrar)
          </button>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              aria-label="Motivo da cortesia"
              className="campo max-w-sm"
              placeholder="Motivo (ex.: escritório da casa, para testes)"
              value={motivo}
              maxLength={300}
              onChange={(e) => setMotivo(e.target.value)}
            />
            <button
              type="button"
              disabled={ocupado || !motivo.trim()}
              onClick={() =>
                agir({ acao: "cortesia", ligar: true, motivo: motivo.trim(), ...(isentoAte ? { ate: isentoAte } : {}) })
              }
              className="rounded border border-slate-400 px-3 py-1.5 font-semibold disabled:opacity-60"
            >
              {isentoAte ? "Isentar até a data" : "Conceder cortesia sem prazo"}
            </button>
            <label className="flex items-center gap-1 text-slate-600">
              até
              <input
                type="date"
                aria-label="Isenção até (opcional)"
                className="rounded border border-slate-400 px-2 py-1"
                value={isentoAte}
                onChange={(e) => setIsentoAte(e.target.value)}
              />
            </label>
            <span className="ajuda w-full">
              Com data, é isenção por prazo: nenhuma fatura até o dia marcado, e depois a régua volta a cobrar sozinha.
            </span>
          </div>
        )}
      </div>

      {ciclo ? (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <p className="font-semibold">Cupom de desconto</p>
          {cupom ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-slate-700">Aplicado: {cupom}.</span>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => agir({ acao: "removerCupom" })}
                className="rounded border border-slate-400 px-3 py-1.5 font-semibold disabled:opacity-60"
              >
                Retirar o cupom
              </button>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                aria-label="Código do cupom"
                className="campo max-w-xs uppercase"
                placeholder="Código (criado em Financeiro)"
                value={codigoDoCupom}
                maxLength={40}
                onChange={(e) => setCodigoDoCupom(e.target.value)}
              />
              <button
                type="button"
                disabled={ocupado || !codigoDoCupom.trim()}
                onClick={() => agir({ acao: "cupom", codigo: codigoDoCupom.trim() })}
                className="rounded border border-slate-400 px-3 py-1.5 font-semibold disabled:opacity-60"
              >
                Aplicar cupom
              </button>
            </div>
          )}
          <p className="ajuda">O desconto vale sobre a mensalidade (ou a fatura do período), nunca sobre o excedente de consumo.</p>
        </div>
      ) : null}

      {ciclo ? (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <p className="font-semibold">Valor da mensalidade</p>
          <p className="mt-1 text-slate-600">
            Preço negociado, fechado na assinatura. Em branco ou zero, vale a tabela. Muda as faturas seguintes, não a já gerada.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1">
              <span>R$</span>
              <input
                className="w-32 rounded border border-slate-400 px-2 py-1"
                inputMode="decimal"
                aria-label="Valor da mensalidade em reais"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="tabela"
              />
            </label>
            <button
              type="button"
              disabled={ocupado || (valor.trim() !== "" && !/^\d+(,\d{1,2})?$/.test(valor.trim()))}
              onClick={() =>
                agir({
                  acao: "valor",
                  valorCentavos: valor.trim() ? Math.round(Number(valor.trim().replace(",", ".")) * 100) : 0,
                })
              }
              className="rounded border border-slate-400 px-3 py-1.5 font-semibold disabled:opacity-60"
            >
              Gravar valor
            </button>
          </div>
          {emTeste ? (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => {
                if (window.confirm("Encerrar o período de teste agora? A primeira fatura sai na próxima regua.")) {
                  void agir({ acao: "encerrarTeste" });
                }
              }}
              className="mt-3 rounded border border-slate-400 px-3 py-1.5 font-semibold disabled:opacity-60"
            >
              Encerrar o teste agora
            </button>
          ) : null}
        </div>
      ) : null}

      {ciclo ? (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <p className="font-semibold">Ciclo da assinatura</p>
          <p className="mt-1 text-slate-600">
            Hoje:{" "}
            {ciclo === "ANUAL"
              ? `anual, com ${descontos.anual} de desconto`
              : ciclo === "TRIMESTRAL"
                ? `trimestral, com ${descontos.trimestral} de desconto`
                : "mensal"}
            . No trimestral e no anual sai uma fatura do período inteiro; nos meses do meio, só excedente de consumo.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              { valor: "MENSAL", rotulo: "Mensal" },
              { valor: "TRIMESTRAL", rotulo: `Trimestral (${descontos.trimestral} de desconto)` },
              { valor: "ANUAL", rotulo: `Anual (${descontos.anual} de desconto)` },
            ]
              .filter((c) => c.valor !== ciclo)
              .map((c) => (
                <button
                  key={c.valor}
                  type="button"
                  disabled={ocupado}
                  onClick={() => agir({ acao: "ciclo", ciclo: c.valor })}
                  className="rounded border border-slate-400 px-3 py-1.5 font-semibold disabled:opacity-60"
                >
                  Passar para {c.rotulo.toLowerCase()}
                </button>
              ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 border-t border-slate-200 pt-4">
        <p className="font-semibold">Processos do DJEN</p>
        <p className="mt-1 text-slate-600">
          Busca agora os processos dos últimos 12 meses das OABs que ainda não foram buscadas, sem esperar a captura da
          madrugada.
        </p>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => agir({ acao: "processos" })}
          className="mt-2 rounded border border-slate-400 px-3 py-1.5 font-semibold disabled:opacity-60"
        >
          Buscar processos agora
        </button>
      </div>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <p className="font-semibold">Nuvem do escritório</p>
        <p className="mt-1 text-slate-600">
          Cópia agora para a nuvem conectada os documentos que ficaram para trás. Roda sozinho todo dia e depois de
          cada falha.
        </p>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => agir({ acao: "nuvem" })}
          className="mt-2 rounded border border-slate-400 px-3 py-1.5 font-semibold disabled:opacity-60"
        >
          Copiar para a nuvem agora
        </button>
      </div>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <p className="font-semibold">Encerramento</p>
        {encerrado ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => agir({ acao: "reativar" })}
            className="mt-2 rounded border border-slate-400 px-3 py-1.5 font-semibold disabled:opacity-60"
          >
            Reativar o escritório
          </button>
        ) : (
          <>
            <p className="mt-1 text-slate-600">
              Interrompe o acesso e a cobrança. Os dados ficam guardados pelo prazo de retenção, para exportação, e
              depois são apagados pela rotina semanal. Até lá, dá para reativar.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                aria-label="Motivo do encerramento"
                className="campo max-w-sm"
                placeholder="Motivo (ex.: escritório de teste)"
                value={motivoDoEncerramento}
                maxLength={300}
                onChange={(e) => setMotivoDoEncerramento(e.target.value)}
              />
              <button
                type="button"
                disabled={ocupado || motivoDoEncerramento.trim().length < 3}
                onClick={() => {
                  if (window.confirm("Encerrar este escritório? O acesso é interrompido na hora.")) {
                    void agir({ acao: "encerrar", motivo: motivoDoEncerramento.trim() });
                  }
                }}
                className="rounded border border-red-300 px-3 py-1.5 font-semibold text-red-800 disabled:opacity-60"
              >
                Encerrar escritório
              </button>
            </div>
          </>
        )}
      </div>

      <div className="mt-4 border-t border-red-200 pt-4">
        <p className="font-semibold text-red-800">Excluir definitivamente</p>
        <p className="mt-1 text-slate-600">
          Sem esperar o prazo de retenção: para escritório de teste, cadastro feito por engano ou pedido de eliminação do
          titular (LGPD). Sem fatura paga, some tudo e o endereço fica livre. Com fatura paga ou nota emitida, os dados
          são apagados e ficam só faturas, assinatura, aceites e notas, que são registro fiscal da Blackbird. Não se desfaz.
        </p>
        {exclusao.aberta ? (
          <div className="mt-2 grid gap-2 sm:max-w-md">
            <input
              aria-label="Endereço do escritório, para confirmar"
              className="campo"
              placeholder="Digite o endereço do escritório para confirmar"
              value={exclusao.confirmacao}
              onChange={(e) => setExclusao({ ...exclusao, confirmacao: e.target.value })}
            />
            <input
              aria-label="Motivo da exclusão"
              className="campo"
              placeholder="Motivo (fica registrado)"
              maxLength={300}
              value={exclusao.motivo}
              onChange={(e) => setExclusao({ ...exclusao, motivo: e.target.value })}
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={ocupado || !exclusao.confirmacao.trim() || exclusao.motivo.trim().length < 10}
                onClick={excluir}
                className="rounded border border-red-400 bg-red-50 px-3 py-1.5 font-semibold text-red-800 disabled:opacity-60"
              >
                Excluir definitivamente
              </button>
              <button type="button" className="botao-discreto" onClick={() => setExclusao({ aberta: false, confirmacao: "", motivo: "" })}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setExclusao({ ...exclusao, aberta: true })}
            className="mt-2 rounded border border-red-300 px-3 py-1.5 font-semibold text-red-800"
          >
            Quero excluir este escritório
          </button>
        )}
      </div>

      {recado ? (
        <p className={`mt-3 ${recado.ok ? "text-green-700" : "text-red-700"}`}>
          {recado.texto}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Botao de registrar pagamento, usado na lista de faturas.
 *
 * Exportacao propria, e nao uma propriedade de AcoesDoEscritorio: componente
 * de cliente pendurado em outro nao entra no manifesto do React Server
 * Components, e a pagina quebra com 500 em producao.
 */
export function AcaoDaFatura({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  if (status !== "ABERTA") {
    return <span className="text-xs text-slate-500">{status}</span>;
  }

  return (
    <button
      type="button"
      disabled={ocupado}
      onClick={async () => {
        setOcupado(true);
        await chamar("/api/plataforma/faturas", {
          faturaId: id,
          acao: "pagar",
        });
        setOcupado(false);
        router.refresh();
      }}
      className="rounded border border-slate-400 px-2 py-1 text-xs font-semibold disabled:opacity-60"
    >
      {ocupado ? "..." : "Registrar pagamento"}
    </button>
  );
}
