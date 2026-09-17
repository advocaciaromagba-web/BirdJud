import { comEscritorio } from "@/lib/prisma";
import { contextoDaPagina } from "@/lib/pagina";
import { Navegacao } from "@/componentes/Navegacao";
import { FormularioCriar } from "@/componentes/FormularioCriar";

export default async function PaginaClientes() {
  const contexto = await contextoDaPagina();

  const clientes = await comEscritorio(contexto.escritorioId, (db) =>
    db.cliente.findMany({ orderBy: { nome: "asc" }, take: 200 })
  );

  return (
    <>
      <Navegacao nomeEscritorio={contexto.marca.nome} papel={contexto.papel} />
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold">Clientes</h1>

        <FormularioCriar
          rota="/api/clientes"
          campos={[
            { nome: "nome", rotulo: "Nome", obrigatorio: true },
            { nome: "documento", rotulo: "CPF / CNPJ" },
            { nome: "email", rotulo: "E-mail", tipo: "email" },
            { nome: "telefone", rotulo: "Telefone" },
          ]}
        />

        {clientes.length === 0 ? (
          <p className="mt-6 text-neutral-600">Nenhum cliente cadastrado ainda.</p>
        ) : (
          <ul className="mt-6 divide-y divide-neutral-200">
            {clientes.map((cliente) => (
              <li key={cliente.id} className="py-3">
                <p className="font-semibold">{cliente.nome}</p>
                <p className="text-sm text-neutral-500">
                  {[cliente.documento, cliente.telefone, cliente.email].filter(Boolean).join(" · ") ||
                    "sem outros dados"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
