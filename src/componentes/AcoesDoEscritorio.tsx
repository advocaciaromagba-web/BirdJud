"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
// Catalogo puro: importar de @/lib/faixas ou @/lib/modulos traria o Prisma
// para o bundle do navegador.
import { FAIXAS, MODULOS } from "@/lib/catalogo";

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
}: {
  escritorioId: string;
  faixaAtual: string;
  modulos: { modulo: string; ativo: boolean }[];
}) {
  const router = useRouter();
  const [recado, setRecado] = useState<{ texto: string; ok: boolean } | null>(
    null,
  );
  const [ocupado, setOcupado] = useState(false);
  const contratados = new Map(modulos.map((m) => [m.modulo, m.ativo]));

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
      <h2 className="font-semibold">Acoes da plataforma</h2>

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
        <p className="text-slate-600">Modulos contratados:</p>
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
                {modulo}
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
