import Link from "next/link";
import { redirect } from "next/navigation";
import { prismaPlataforma } from "@/lib/prisma";
import { exigirOperador, SemOperador } from "@/lib/plataforma";
import { diasDeAtraso } from "@/lib/cobranca";
import { emReais } from "@/lib/dinheiro";
import { MarcaBirdJud } from "@/componentes/MarcaBirdJud";

const CORES: Record<string, string> = {
  TESTE: "bg-slate-100 text-slate-700",
  ATIVO: "bg-green-100 text-green-800",
  INADIMPLENTE: "bg-amber-100 text-amber-800",
  SUSPENSO: "bg-red-100 text-red-800",
  ENCERRADO: "bg-slate-200 text-slate-600",
};

export default async function PainelPlataforma() {
  let operador;
  try {
    operador = await exigirOperador();
  } catch (erro) {
    if (erro instanceof SemOperador) redirect("/plataforma/login");
    throw erro;
  }

  const escritorios = await prismaPlataforma().escritorio.findMany({
    orderBy: { criadoEm: "desc" },
    include: {
      assinatura: true,
      faturas: { where: { status: "ABERTA" }, orderBy: { vencimento: "asc" } },
    },
  });

  const agora = new Date();

  return (
    <main className="pagina">
      <div className="cabecalho-da-pagina">
        <div>
          <MarcaBirdJud />
          <h1 className="mt-4">Escritorios</h1>
        </div>
        <p className="text-sm text-slate-500">operador: {operador.nome}</p>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <th className="py-2">Escritorio</th>
              <th className="py-2">Status</th>
              <th className="py-2">Faixa</th>
              <th className="py-2">Teste ate</th>
              <th className="py-2 text-right">Em aberto</th>
              <th className="py-2 text-right">Maior atraso</th>
            </tr>
          </thead>
          <tbody>
            {escritorios.map((escritorio) => {
              const emAberto = escritorio.faturas.reduce(
                (t, f) => t + f.valorCentavos,
                0,
              );
              const atraso = escritorio.faturas[0]
                ? diasDeAtraso(escritorio.faturas[0].vencimento, agora)
                : null;
              return (
                <tr key={escritorio.id} className="border-b border-slate-100">
                  <td className="py-2">
                    <Link
                      href={`/plataforma/${escritorio.id}`}
                      className="font-semibold text-marca"
                    >
                      {escritorio.nome}
                    </Link>
                    <span className="block text-xs text-slate-500">
                      {escritorio.slug}
                    </span>
                  </td>
                  <td className="py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${CORES[escritorio.status] ?? ""}`}
                    >
                      {escritorio.status}
                    </span>
                  </td>
                  <td className="py-2">{escritorio.faixa}</td>
                  <td className="py-2">
                    {escritorio.assinatura
                      ? escritorio.assinatura.fimDoTeste.toLocaleDateString(
                          "pt-BR",
                        )
                      : "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {emAberto > 0 ? emReais(emAberto) : "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {atraso !== null && atraso > 0 ? `${atraso} dia(s)` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {escritorios.length === 0 ? (
        <p className="mt-6 text-slate-600">
          Nenhum escritorio cadastrado ainda.
        </p>
      ) : null}
    </main>
  );
}
