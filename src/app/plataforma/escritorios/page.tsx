import Link from "next/link";
import { redirect } from "next/navigation";
import { prismaPlataforma } from "@/lib/prisma";
import { exigirOperador, SemOperador } from "@/lib/plataforma";
import { diasDeAtraso } from "@/lib/cobranca";
import { ROTULO_DO_AVISO, type TipoDeAviso } from "@/lib/avisos-de-cobranca";
import { emReais } from "@/lib/dinheiro";
import { NavegacaoDaPlataforma } from "@/componentes/NavegacaoDaPlataforma";
import { AcoesNaLista } from "@/componentes/AcoesNaLista";

const CORES: Record<string, string> = {
  TESTE: "bg-slate-100 text-slate-700",
  ATIVO: "bg-green-100 text-green-800",
  INADIMPLENTE: "bg-amber-100 text-amber-800",
  SUSPENSO: "bg-red-100 text-red-800",
  ENCERRADO: "bg-slate-200 text-slate-600",
};

const ROTULO: Record<string, string> = {
  TESTE: "Em teste",
  ATIVO: "Ativo",
  INADIMPLENTE: "Inadimplente",
  SUSPENSO: "Suspenso",
  ENCERRADO: "Encerrado",
};

const FILTROS = [
  { chave: "", rotulo: "Todos" },
  { chave: "INADIMPLENTE", rotulo: "Inadimplentes" },
  { chave: "SUSPENSO", rotulo: "Suspensos" },
  { chave: "ATIVO", rotulo: "Ativos" },
  { chave: "TESTE", rotulo: "Em teste" },
  { chave: "ENCERRADO", rotulo: "Encerrados" },
];

const dia = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default async function EscritoriosDaPlataforma({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  let operador;
  try {
    operador = await exigirOperador();
  } catch (erro) {
    if (erro instanceof SemOperador) redirect("/plataforma/login");
    throw erro;
  }

  const { status } = await searchParams;
  const filtro = FILTROS.some((f) => f.chave === status) ? (status ?? "") : "";

  const [escritorios, contagem] = await Promise.all([
    prismaPlataforma().escritorio.findMany({
      where: filtro ? { status: filtro } : {},
      orderBy: { criadoEm: "desc" },
      include: {
        assinatura: true,
        faturas: { where: { status: "ABERTA" }, orderBy: { vencimento: "asc" } },
        avisosDeCobranca: { orderBy: { enviadoEm: "desc" }, take: 1 },
      },
    }),
    prismaPlataforma().escritorio.groupBy({ by: ["status"], _count: true }),
  ]);
  const quantos = (s: string) =>
    s ? (contagem.find((c) => c.status === s)?._count ?? 0) : contagem.reduce((t, c) => t + c._count, 0);

  const agora = new Date();

  return (
    <main className="pagina">
      <NavegacaoDaPlataforma ativo="/plataforma/escritorios" operador={operador.nome} />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h1>Escritórios</h1>
        <Link href="/plataforma/novo" className="botao-principal">
          Implantar escritório
        </Link>
      </div>

      <nav aria-label="Filtrar por status" className="mt-4 flex flex-wrap gap-2 text-sm">
        {FILTROS.map((f) => (
          <Link
            key={f.chave || "todos"}
            href={f.chave ? `/plataforma/escritorios?status=${f.chave}` : "/plataforma/escritorios"}
            aria-current={filtro === f.chave ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${
              filtro === f.chave ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {f.rotulo} ({quantos(f.chave)})
          </Link>
        ))}
      </nav>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <th className="py-2">Escritório</th>
              <th className="py-2">Status</th>
              <th className="py-2">Faixa</th>
              <th className="py-2">Teste até</th>
              <th className="py-2 text-right">Em aberto</th>
              <th className="py-2 text-right">Maior atraso</th>
              <th className="py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {escritorios.map((escritorio) => {
              const emAberto = escritorio.faturas.reduce((t, f) => t + f.valorCentavos, 0);
              const atraso = escritorio.faturas[0] ? diasDeAtraso(escritorio.faturas[0].vencimento, agora) : null;
              const aviso = escritorio.avisosDeCobranca[0];
              return (
                <tr key={escritorio.id} className="border-b border-slate-100 align-top">
                  <td className="py-2">
                    <Link href={`/plataforma/${escritorio.id}`} className="font-semibold text-marca">
                      {escritorio.nome}
                    </Link>
                    <span className="block text-xs text-slate-500">{escritorio.slug}</span>
                  </td>
                  <td className="py-2">
                    <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${CORES[escritorio.status] ?? ""}`}>
                      {ROTULO[escritorio.status] ?? escritorio.status}
                    </span>
                    {escritorio.suspensaoManual ? <span className="mt-1 block text-xs text-red-700">pelo operador</span> : null}
                    {escritorio.suspensaoAdiadaAte && escritorio.suspensaoAdiadaAte > agora ? (
                      <span className="mt-1 block text-xs text-amber-800">
                        liberado até {dia(new Date(escritorio.suspensaoAdiadaAte.getTime() - 1))}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2">{escritorio.faixa}</td>
                  <td className="py-2">{escritorio.assinatura ? dia(escritorio.assinatura.fimDoTeste) : "—"}</td>
                  <td className="py-2 text-right tabular-nums">{emAberto > 0 ? emReais(emAberto) : "—"}</td>
                  <td className="py-2 text-right tabular-nums">
                    {atraso !== null && atraso > 0 ? `${atraso} dia(s)` : "—"}
                    {aviso ? (
                      <span className="block text-xs text-slate-500" title={aviso.para}>
                        {ROTULO_DO_AVISO[aviso.tipo as TipoDeAviso] ?? aviso.tipo} em {dia(aviso.enviadoEm)}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2">
                    <AcoesNaLista
                      id={escritorio.id}
                      slug={escritorio.slug}
                      status={escritorio.status}
                      atraso={atraso}
                      temAberta={escritorio.faturas.length > 0}
                      dados={{
                        nome: escritorio.nome,
                        razaoSocial: escritorio.razaoSocial,
                        cidade: escritorio.cidade,
                        telefoneAtendimento: escritorio.telefoneAtendimento,
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {escritorios.length === 0 ? (
        <p className="mt-6 text-slate-600">
          {filtro ? "Nenhum escritório com este status." : "Nenhum escritório cadastrado ainda."}
        </p>
      ) : null}
    </main>
  );
}
