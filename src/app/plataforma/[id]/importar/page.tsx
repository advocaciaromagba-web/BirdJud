import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prismaPlataforma } from "@/lib/prisma";
import { exigirOperador, SemOperador } from "@/lib/plataforma";
import { NavegacaoDaPlataforma } from "@/componentes/NavegacaoDaPlataforma";
import { ImportadorDeClientes } from "@/componentes/ImportadorDeClientes";
import { importacoesDoEscritorio } from "@/lib/importacao-do-escritorio";

export const dynamic = "force-dynamic";

export default async function ImportarNaImplantacao({ params }: { params: Promise<{ id: string }> }) {
  let operador;
  try {
    operador = await exigirOperador();
  } catch (erro) {
    if (erro instanceof SemOperador) redirect("/plataforma/login");
    throw erro;
  }
  const { id } = await params;
  const escritorio = await prismaPlataforma().escritorio.findUnique({ where: { id }, select: { nome: true } });
  if (!escritorio) notFound();
  const importacoes = await importacoesDoEscritorio(id);
  return (
    <main className="pagina">
      <NavegacaoDaPlataforma ativo={null} operador={operador.nome} />
      <Link href={`/plataforma/${id}/implantacao`} className="mt-4 inline-block text-sm text-slate-500">
        ← implantacao de {escritorio.nome}
      </Link>
      <h1 className="mt-2">Importar clientes</h1>
      <p className="mt-2 leitura text-slate-600">
        A planilha exportada do sistema anterior do escritorio. Mesmas regras da tela do escritorio: nada
        entra antes da conferencia, e o lote pode ser desfeito.
      </p>
      <ImportadorDeClientes
        rota={`/api/plataforma/escritorios/${id}/importar`}
        importacoes={importacoes.map((i) => ({
          ...i,
          criadaEm: i.criadaEm.toISOString(),
          desfeitaEm: i.desfeitaEm?.toISOString() ?? null,
        }))}
      />
    </main>
  );
}
