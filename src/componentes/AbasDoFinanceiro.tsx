import Link from "next/link";

/**
 * Abas do Financeiro. A conferencia do extrato mora aqui, e nao no menu
 * lateral: e la que o dinheiro que entrou encontra a parcela a receber, e o
 * resultado e linha do livro-caixa.
 */
export function AbasDoFinanceiro({
  ativa,
  temLivroCaixa,
  temExtrato,
  pendentes,
}: {
  ativa: "LANCAMENTOS" | "EXTRATO" | "CONTRATOS";
  temLivroCaixa: boolean;
  temExtrato: boolean;
  pendentes?: number;
}) {
  const aba = (rotulo: string, href: string, ligada: boolean) => (
    <Link
      href={href}
      aria-current={ligada ? "page" : undefined}
      className={`rounded-lg px-3 py-1.5 text-sm ${ligada ? "bg-slate-900 font-semibold text-white" : "text-slate-700 hover:bg-slate-100"}`}
    >
      {rotulo}
    </Link>
  );
  if (!temLivroCaixa) return null;
  return (
    <nav className="mt-3 flex flex-wrap gap-2" aria-label="Financeiro">
      {aba("Lançamentos", "/financeiro", ativa === "LANCAMENTOS")}
      {temExtrato
        ? aba(pendentes ? `Conferir extrato (${pendentes})` : "Conferir extrato", "/conciliacao", ativa === "EXTRATO")
        : null}
      {aba("Contratos × financeiro", "/financeiro/contratos", ativa === "CONTRATOS")}
    </nav>
  );
}
