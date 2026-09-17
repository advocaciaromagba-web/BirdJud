import { redirect } from "next/navigation";
import { comEscritorio } from "@/lib/prisma";
import { exigirSessao } from "@/lib/sessao";

export default async function PaginaClientes() {
  let contexto;
  try {
    contexto = await exigirSessao();
  } catch {
    redirect("/login");
  }

  const clientes = await comEscritorio(contexto.escritorioId, (db) =>
    db.cliente.findMany({ orderBy: { nome: "asc" }, take: 200 })
  );

  return (
    <main className="mx-auto max-w-3xl p-10">
      <h1 className="text-2xl font-bold">Clientes</h1>
      <p className="mt-1 text-sm text-neutral-500">{contexto.marca.nome}</p>

      {clientes.length === 0 ? (
        <p className="mt-6 text-neutral-600">Nenhum cliente cadastrado ainda.</p>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200">
          {clientes.map((cliente) => (
            <li key={cliente.id} className="py-3">
              <p className="font-semibold">{cliente.nome}</p>
              {cliente.documento ? (
                <p className="text-sm text-neutral-500">{cliente.documento}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
