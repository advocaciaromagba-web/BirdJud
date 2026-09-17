import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { Navegacao } from "@/componentes/Navegacao";
import { FormularioCriar } from "@/componentes/FormularioCriar";

export default async function PaginaProcessos() {
  const contexto = await contextoDaPagina();

  const { processos, clientes } = await comEscritorio(contexto.escritorioId, async (db) => ({
    processos: await db.processo.findMany({
      orderBy: { criadoEm: "desc" },
      take: 200,
      include: { cliente: { select: { nome: true } } },
    }),
    clientes: await db.cliente.findMany({ orderBy: { nome: "asc" }, take: 500 }),
  }));

  return (
    <>
      <Navegacao nomeEscritorio={contexto.marca.nome} papel={contexto.papel} />
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold">Processos</h1>

        <FormularioCriar
          rota="/api/processos"
          campos={[
            { nome: "numero", rotulo: "Numero do processo", obrigatorio: true },
            {
              nome: "clienteId",
              rotulo: "Cliente",
              tipo: "select",
              opcoes: clientes.map((c) => ({ valor: c.id, rotulo: c.nome })),
            },
            { nome: "tribunal", rotulo: "Tribunal" },
            { nome: "vara", rotulo: "Vara" },
            { nome: "area", rotulo: "Area" },
          ]}
        />

        {processos.length === 0 ? (
          <p className="mt-6 text-neutral-600">Nenhum processo cadastrado ainda.</p>
        ) : (
          <ul className="mt-6 divide-y divide-neutral-200">
            {processos.map((processo) => (
              <li key={processo.id} className="py-3">
                <p className="font-semibold">{processo.numero}</p>
                <p className="text-sm text-neutral-500">
                  {[processo.cliente?.nome, processo.tribunal, processo.vara, processo.area]
                    .filter(Boolean)
                    .join(" · ") || "sem outros dados"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
